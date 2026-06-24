const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'rusgo.db');

// Token signing key
const JWT_SECRET = 'rusgo-super-secret-key-2026';

let GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY && fs.existsSync(path.join(__dirname, '.env'))) {
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const match = envContent.match(/GROQ_API_KEY\s*=\s*(.*)/);
    if (match) {
        GROQ_API_KEY = match[1].trim().replace(/['"]/g, '');
    }
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Initialize SQLite database
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database: rusgo.db');
        initializeDatabase();
    }
});

// Setup schema tables with migrations
function initializeDatabase() {
    db.serialize(() => {
        // Check if users table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (tableErr, tableRes) => {
            if (tableErr) {
                console.error('Error checking database tables:', tableErr.message);
                return;
            }
            
            const usersTableExists = !!tableRes;

            db.get('PRAGMA user_version', (err, res) => {
                if (err) {
                    console.error('Error reading DB schema version:', err.message);
                    return;
                }

                let currentVersion = res ? res.user_version : 0;
                if (!usersTableExists) {
                    currentVersion = 0;
                }
                console.log(`SQLite DB Version: v${currentVersion} (Users table exists: ${usersTableExists})`);

                if (currentVersion < 2) {
                    // Drop old schema if exists to upgrade cleanly to UNIQUE username constraints and passwords
                    console.log('Upgrading database schema to version 2 (with password auth support)...');
                    
                    db.serialize(() => {
                        db.run('DROP TABLE IF EXISTS progress');
                        db.run('DROP TABLE IF EXISTS users');

                        db.run(`
                            CREATE TABLE IF NOT EXISTS users (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                username TEXT UNIQUE NOT NULL,
                                password_hash TEXT NOT NULL,
                                salt TEXT NOT NULL,
                                avatar TEXT DEFAULT '👤',
                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                            )
                        `);

                        db.run(`
                            CREATE TABLE IF NOT EXISTS progress (
                                user_id INTEGER PRIMARY KEY,
                                xp INTEGER DEFAULT 0,
                                gems INTEGER DEFAULT 120,
                                streak INTEGER DEFAULT 7,
                                last_active TEXT,
                                completed_levels TEXT DEFAULT '[]',
                                weekly_progress TEXT DEFAULT '[10,0,30,15,25,10,0]',
                                unlocked_achievements TEXT DEFAULT '[]',
                                settings TEXT DEFAULT '{"ttsEnabled":true}',
                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                            )
                        `);

                        db.run('PRAGMA user_version = 2', (versionErr) => {
                            if (versionErr) {
                                                            console.error('Error setting db version to 2:', versionErr.message);
                            } else {
                                console.log('Database successfully upgraded to version 2.');
                            }
                            seedDefaultUser();
                        });
                    });
                } else {
                    console.log('Database schema is up to date.');
                    seedDefaultUser();
                }
            });
        });
    });
}

// Seed default tester/student user account: student / password
function seedDefaultUser() {
    db.get('SELECT id FROM users WHERE id = 1', (err, row) => {
        if (err) {
            console.error('Error checking default user:', err.message);
            return;
        }

        if (!row) {
            console.log('Seeding default student tester account...');
            const defaultUsername = 'student';
            const defaultPassword = 'password';
            const salt = crypto.randomBytes(16).toString('hex');
            const passwordHash = crypto.pbkdf2Sync(defaultPassword, salt, 1000, 64, 'sha512').toString('hex');
            
            db.serialize(() => {
                db.run(
                    'INSERT INTO users (id, username, password_hash, salt, avatar) VALUES (1, ?, ?, ?, "👤")',
                    [defaultUsername, passwordHash, salt],
                    (insertErr) => {
                        if (insertErr) console.error('Error inserting seed user:', insertErr.message);
                    }
                );
                db.run(`
                    INSERT INTO progress (user_id, xp, gems, streak, last_active, completed_levels, weekly_progress, unlocked_achievements, settings)
                    VALUES (1, 0, 120, 7, datetime('now'), '[]', '[10,0,30,15,25,10,0]', '[]', '{"ttsEnabled":true}')
                `, (progressErr) => {
                    if (progressErr) console.error('Error inserting seed progress:', progressErr.message);
                });
            });
        }
    });
}

// Helper to parse DB JSON columns safely
function formatUserResponse(row) {
    if (!row) return null;
    return {
        id: row.id,
        username: row.username,
        avatar: row.avatar,
        xp: row.xp,
        gems: row.gems,
        streak: row.streak,
        last_active: row.last_active,
        completed_levels: JSON.parse(row.completed_levels || '[]'),
        weekly_progress: JSON.parse(row.weekly_progress || '[0,0,0,0,0,0,0]'),
        unlocked_achievements: JSON.parse(row.unlocked_achievements || '[]'),
        settings: JSON.parse(row.settings || '{"ttsEnabled":true}')
    };
}

/* ==========================================================================
   STATELESS HMAC TOKEN HELPERS
   ========================================================================== */

function generateToken(userId) {
    const payload = JSON.stringify({ userId, exp: Date.now() + 24 * 60 * 60 * 1000 }); // 24hr expiration
    const base64Payload = Buffer.from(payload).toString('base64');
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(base64Payload).digest('hex');
    return `${base64Payload}.${signature}`;
}

function verifyToken(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [base64Payload, signature] = parts;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(base64Payload).digest('hex');
    if (signature !== expectedSignature) return null;

    try {
        const payload = JSON.parse(Buffer.from(base64Payload, 'base64').toString('utf8'));
        if (payload.exp < Date.now()) return null; // Expired
        return payload.userId;
    } catch (e) {
        return null;
    }
}

// Middleware to authenticate token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (!token) {
        return res.status(401).json({ error: 'Авторизация требуется' });
    }

    const userId = verifyToken(token);
    if (!userId) {
        return res.status(401).json({ error: 'Неверный или истекший сессионный токен' });
    }

    req.userId = userId;
    next();
}

/* ==========================================================================
   REST API ENDPOINTS
   ========================================================================== */

// 1. POST Register a new user
app.post('/api/auth/register', (req, res) => {
    const { username, password, avatar } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    const normUsername = username.trim();
    if (normUsername.length < 3) {
        return res.status(400).json({ error: 'Имя пользователя должно быть не менее 3 символов' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    const avatarVal = avatar || '👤';

    db.run(
        'INSERT INTO users (username, password_hash, salt, avatar) VALUES (?, ?, ?, ?)',
        [normUsername, passwordHash, salt, avatarVal],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'Пользователь с таким именем уже зарегистрирован' });
                }
                console.error('Registration database error:', err.message);
                return res.status(500).json({ error: 'Ошибка базы данных при регистрации' });
            }

            const userId = this.lastID;

            // Initialize progress entry
            db.run(
                `INSERT INTO progress (user_id, xp, gems, streak, last_active, completed_levels, weekly_progress, unlocked_achievements, settings)
                 VALUES (?, 0, 120, 7, datetime('now'), '[]', '[0,0,0,0,0,0,0]', '[]', '{"ttsEnabled":true}')`,
                [userId],
                (progressErr) => {
                    if (progressErr) {
                        console.error('Registration progress setup error:', progressErr.message);
                        return res.status(500).json({ error: 'Ошибка инициализации прогресса пользователя' });
                    }

                    const token = generateToken(userId);
                    res.status(201).json({
                        token,
                        user: { id: userId, username: normUsername, avatar: avatarVal }
                    });
                }
            );
        }
    );
});

// 2. POST Log in user
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Имя пользователя и пароль обязательны' });
    }

    const normUsername = username.trim().toLowerCase();
    db.get('SELECT * FROM users WHERE LOWER(username) = ?', [normUsername], (err, user) => {
        if (err) {
            console.error('Login database select error:', err.message);
            return res.status(500).json({ error: 'Внутренняя ошибка базы данных' });
        }

        if (!user) {
            return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        const passwordHash = crypto.pbkdf2Sync(password, user.salt, 1000, 64, 'sha512').toString('hex');
        if (passwordHash !== user.password_hash) {
            return res.status(400).json({ error: 'Неверное имя пользователя или пароль' });
        }

        const token = generateToken(user.id);
        res.json({
            token,
            user: { id: user.id, username: user.username, avatar: user.avatar }
        });
    });
});

// 3. GET User profile & progress details (Authenticated)
app.get('/api/user', authenticateToken, (req, res) => {
    db.get(`
        SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
               p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
        FROM users u
        LEFT JOIN progress p ON u.id = p.user_id
        WHERE u.id = ?
    `, [req.userId], (err, row) => {
        if (err) {
            console.error('API Error fetching user:', err.message);
            return res.status(500).json({ error: 'Database query failure' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json(formatUserResponse(row));
    });
});

// 4. POST Save progress updates (Authenticated)
app.post('/api/progress', authenticateToken, (req, res) => {
    const { xp, gems, streak, completed_levels, weekly_progress, unlocked_achievements, settings } = req.body;

    const completedLevelsStr = JSON.stringify(completed_levels || []);
    const weeklyProgressStr = JSON.stringify(weekly_progress || [0,0,0,0,0,0,0]);
    const unlockedAchievementsStr = JSON.stringify(unlocked_achievements || []);
    const settingsStr = JSON.stringify(settings || { ttsEnabled: true });

    db.run(`
        UPDATE progress
        SET xp = ?, 
            gems = ?, 
            streak = ?, 
            last_active = datetime('now'), 
            completed_levels = ?, 
            weekly_progress = ?, 
            unlocked_achievements = ?, 
            settings = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    `, [xp, gems, streak, completedLevelsStr, weeklyProgressStr, unlockedAchievementsStr, settingsStr, req.userId], function(err) {
        if (err) {
            console.error('API Error updating progress:', err.message);
            return res.status(500).json({ error: 'Database update failure' });
        }

        db.get(`
            SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
                   p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
            FROM users u
            LEFT JOIN progress p ON u.id = p.user_id
            WHERE u.id = ?
        `, [req.userId], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch updated progress' });
            }
            res.json(formatUserResponse(row));
        });
    });
});

// 5. POST Reset user progress columns back to defaults (Authenticated)
app.post('/api/reset', authenticateToken, (req, res) => {
    db.run(`
        UPDATE progress
        SET xp = 0,
            gems = 120,
            streak = 7,
            last_active = datetime('now'),
            completed_levels = '[]',
            weekly_progress = '[0,0,0,0,0,0,0]',
            unlocked_achievements = '[]',
            settings = '{"ttsEnabled":true}',
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    `, [req.userId], (err) => {
        if (err) {
            console.error('API Error resetting progress:', err.message);
            return res.status(500).json({ error: 'Reset failure' });
        }

        db.get(`
            SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
                   p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
            FROM users u
            LEFT JOIN progress p ON u.id = p.user_id
            WHERE u.id = ?
        `, [req.userId], (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch reset state' });
            }
            res.json(formatUserResponse(row));
        });
    });
});

// 6. POST Chat with Groq tutor proxy
app.post('/api/chat', (req, res) => {
    const { messages } = req.body;
    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: "Groq API key not configured on server." });
    }
    fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${GROQ_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: messages,
            temperature: 0.7,
            response_format: { type: "json_object" }
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(errText => {
                throw new Error(`Groq API returned error: ${response.status} - ${errText}`);
            });
        }
        return response.json();
    })
    .then(data => res.json(data))
    .catch(e => {
        console.error("Server chat proxy error:", e);
        res.status(500).json({ error: e.message });
    });
});

// Start Server listening
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` RusGo server is running!`);
    console.log(` Access dashboard at: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
