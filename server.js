const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'rusgo.db');

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
        // Read current database user_version
        db.get('PRAGMA user_version', (err, res) => {
            if (err) {
                console.error('Error reading DB schema version:', err.message);
                return;
            }

            const currentVersion = res ? res.user_version : 0;
            console.log(`SQLite DB Version: v${currentVersion}`);

            if (currentVersion === 0) {
                // Version 1 Setup (Initial Database Initialization)
                console.log('Initializing schema v1 tables...');
                
                db.run(`
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT DEFAULT 'Студент RusGo',
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

                db.run('PRAGMA user_version = 1', (versionErr) => {
                    if (versionErr) {
                        console.error('Error setting db version to 1:', versionErr.message);
                    } else {
                        console.log('Database successfully initialized to version 1.');
                    }
                    seedDefaultUser();
                });
            } else {
                // Dynamic forward migration block placeholder:
                // This block lets us update schema structure in the future without data loss
                /*
                if (currentVersion < 2) {
                    console.log('Migrating schema to v2...');
                    db.run('ALTER TABLE progress ADD COLUMN custom_theme TEXT DEFAULT "dark"');
                    db.run('PRAGMA user_version = 2');
                }
                */
                console.log('Database schema is up to date.');
                seedDefaultUser();
            }
        });
    });
}

// Seed default developer/student user id=1 if not exists
function seedDefaultUser() {
    db.get('SELECT id FROM users WHERE id = 1', (err, row) => {
        if (err) {
            console.error('Error checking default user:', err.message);
            return;
        }

        if (!row) {
            console.log('Seeding default user and progress state...');
            db.serialize(() => {
                db.run('INSERT INTO users (id, username, avatar) VALUES (1, "Студент RusGo", "👤")', (err) => {
                    if (err) console.error('Error inserting user:', err.message);
                });
                db.run(`
                    INSERT INTO progress (user_id, xp, gems, streak, last_active, completed_levels, weekly_progress, unlocked_achievements, settings)
                    VALUES (1, 0, 120, 7, datetime('now'), '[]', '[10,0,30,15,25,10,0]', '[]', '{"ttsEnabled":true}')
                `, (err) => {
                    if (err) console.error('Error inserting progress:', err.message);
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
   REST API ENDPOINTS
   ========================================================================== */

// 1. GET User profile & progress details
app.get('/api/user', (req, res) => {
    db.get(`
        SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
               p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
        FROM users u
        LEFT JOIN progress p ON u.id = p.user_id
        WHERE u.id = 1
    `, (err, row) => {
        if (err) {
            console.error('API Error fetching user:', err.message);
            return res.status(500).json({ error: 'Database query failure' });
        }

        if (!row) {
            return res.status(404).json({ error: 'Default user not found' });
        }

        res.json(formatUserResponse(row));
    });
});

// 2. POST Save progress updates
app.post('/api/progress', (req, res) => {
    const { xp, gems, streak, completed_levels, weekly_progress, unlocked_achievements, settings } = req.body;

    // Convert objects to JSON string before inserting
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
        WHERE user_id = 1
    `, [xp, gems, streak, completedLevelsStr, weeklyProgressStr, unlockedAchievementsStr, settingsStr], function(err) {
        if (err) {
            console.error('API Error updating progress:', err.message);
            return res.status(500).json({ error: 'Database update failure' });
        }

        // Fetch updated row and respond
        db.get(`
            SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
                   p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
            FROM users u
            LEFT JOIN progress p ON u.id = p.user_id
            WHERE u.id = 1
        `, (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch updated progress' });
            }
            res.json(formatUserResponse(row));
        });
    });
});

// 3. POST Reset user progress columns back to defaults
app.post('/api/reset', (req, res) => {
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
        WHERE user_id = 1
    `, (err) => {
        if (err) {
            console.error('API Error resetting progress:', err.message);
            return res.status(500).json({ error: 'Reset failure' });
        }

        // Retrieve and respond
        db.get(`
            SELECT u.id, u.username, u.avatar, p.xp, p.gems, p.streak, p.last_active,
                   p.completed_levels, p.weekly_progress, p.unlocked_achievements, p.settings
            FROM users u
            LEFT JOIN progress p ON u.id = p.user_id
            WHERE u.id = 1
        `, (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to fetch reset state' });
            }
            res.json(formatUserResponse(row));
        });
    });
});

// Start Server listening
app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` RusGo server is running!`);
    console.log(` Access dashboard at: http://localhost:${PORT}`);
    console.log(`==================================================`);
});
