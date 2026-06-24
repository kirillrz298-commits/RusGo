document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    /* ---------------------------------------------------
     * STATE MANAGEMENT (LocalStorage & SQLite API Sync)
     * --------------------------------------------------- */
    const DEFAULT_STATE = {
        xp: 0,
        gems: 120,
        streak: 7,
        lessonsCompleted: [], // Level indexes completed (e.g. [1])
        weeklyProgress: [10, 0, 30, 15, 25, 10, 0], // XP per day Mon-Sun
        activeTab: 'map',
        activeBranch: 'conversational',
        ttsEnabled: true
    };

    let state = { ...DEFAULT_STATE };
    let isOnlineMode = false;
    const API_URL = window.location.origin.startsWith('file') ? 'http://localhost:3000' : '';

    function getAuthHeaders() {
        const token = localStorage.getItem('rusgo_auth_token');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    function mapServerStateToLocal(serverState) {
        if (!serverState) return { ...DEFAULT_STATE };
        return {
            xp: serverState.xp || 0,
            gems: serverState.gems || 0,
            streak: serverState.streak || 0,
            lessonsCompleted: serverState.completed_levels || [],
            weeklyProgress: serverState.weekly_progress || [0, 0, 0, 0, 0, 0, 0],
            unlockedAchievements: serverState.unlocked_achievements || [],
            ttsEnabled: serverState.settings ? !!serverState.settings.ttsEnabled : true,
            activeBranch: serverState.settings ? (serverState.settings.activeBranch || 'conversational') : 'conversational',
            username: serverState.username || '',
            avatar: serverState.avatar || '👤',
            id: serverState.id
        };
    }

    async function checkServerConnection() {
        const token = localStorage.getItem('rusgo_auth_token');
        if (!token) {
            isOnlineMode = false;
            return;
        }
        try {
            const res = await fetch(`${API_URL}/api/user`, {
                headers: { ...getAuthHeaders() }
            });
            if (res.ok) {
                isOnlineMode = true;
                const serverState = await res.json();
                state = mapServerStateToLocal(serverState);
                localStorage.setItem('rusgo_app_state', JSON.stringify(state));
                console.log('RusGo: SQLite API active (logged in as ' + state.username + ').', state);
            } else if (res.status === 401 || res.status === 404) {
                logoutUserQuietly();
            } else {
                isOnlineMode = false;
            }
        } catch (e) {
            isOnlineMode = false;
            console.log('RusGo: SQLite API offline. Running in LocalStorage mode.');
        }
    }

    async function syncProgressToServer() {
        if (!isOnlineMode) return;
        try {
            const body = {
                xp: state.xp,
                gems: state.gems,
                streak: state.streak,
                completed_levels: state.lessonsCompleted,
                weekly_progress: state.weeklyProgress,
                unlocked_achievements: state.unlockedAchievements || [],
                settings: { ttsEnabled: state.ttsEnabled, activeBranch: state.activeBranch }
            };
            const res = await fetch(`${API_URL}/api/progress`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                const serverState = await res.json();
                state = mapServerStateToLocal(serverState);
                localStorage.setItem('rusgo_app_state', JSON.stringify(state));
                console.log('RusGo: Synced progress to SQLite.');
            }
        } catch (e) {
            console.error('RusGo: Server sync error:', e);
        }
    }

    async function loadState() {
        const saved = localStorage.getItem('rusgo_app_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Если в localStorage лежат серверные snake_case ключи — нормализуем их.
                // mapServerStateToLocal обрабатывает оба формата: если нет completed_levels,
                // то вернётся lessonsCompleted из parsed через spread по DEFAULT_STATE.
                if (parsed.completed_levels !== undefined) {
                    state = { ...DEFAULT_STATE, ...mapServerStateToLocal(parsed) };
                } else {
                    // Локальный формат — просто подмерживаем, гарантируя наличие всех полей
                    state = {
                        ...DEFAULT_STATE,
                        ...parsed,
                        lessonsCompleted: Array.isArray(parsed.lessonsCompleted) ? parsed.lessonsCompleted : [],
                        weeklyProgress: Array.isArray(parsed.weeklyProgress) ? parsed.weeklyProgress : [0,0,0,0,0,0,0],
                        unlockedAchievements: Array.isArray(parsed.unlockedAchievements) ? parsed.unlockedAchievements : []
                    };
                }
            } catch (e) {
                console.warn('RusGo: Failed to parse saved state, resetting.', e);
                state = { ...DEFAULT_STATE };
            }
        } else {
            state = { ...DEFAULT_STATE };
        }
        updateGlobalMetrics();
        updateAuthButtonsVisibility();

        await checkServerConnection();
        updateGlobalMetrics();
        updateAuthButtonsVisibility();
    }

    function saveState() {
        localStorage.setItem('rusgo_app_state', JSON.stringify(state));
        updateGlobalMetrics();
        if (isOnlineMode) {
            syncProgressToServer();
        }
    }

    function logoutUserQuietly() {
        localStorage.removeItem('rusgo_auth_token');
        localStorage.removeItem('rusgo_app_state');
        state = { ...DEFAULT_STATE };
        isOnlineMode = false;
        updateGlobalMetrics();
        updateAuthButtonsVisibility();
    }

    function logoutUser() {
        logoutUserQuietly();
        exitAppMode();
    }

    function updateGlobalMetrics() {
        // App topbar elements
        const appStreak = document.getElementById('appStreak');
        const appGems = document.getElementById('appGems');
        const appXp = document.getElementById('appXp');
        const profileStreak = document.getElementById('profileStreak');
        const profileGems = document.getElementById('profileGems');
        const profileTotalXP = document.getElementById('profileTotalXP');
        const profileLessonsCompleted = document.getElementById('profileLessonsCompleted');

        if (appStreak) appStreak.textContent = state.streak;
        if (appGems) appGems.textContent = state.gems;
        if (appXp) appXp.textContent = state.xp;

        // Profile metrics
        const appStreakText = document.getElementById('appStreakText');
        const appGemsText = document.getElementById('appGemsText');
        const appTotalXpText = document.getElementById('appTotalXpText');
        const appLessonsText = document.getElementById('appLessonsText');

        if (appStreakText) appStreakText.textContent = state.streak;
        if (appGemsText) appGemsText.textContent = state.gems;
        if (appTotalXpText) appTotalXpText.textContent = state.xp;
        if (appLessonsText) appLessonsText.textContent = (state.lessonsCompleted || []).length;

        if (profileStreak) profileStreak.textContent = state.streak;
        if (profileGems) profileGems.textContent = state.gems;
        if (profileTotalXP) profileTotalXP.textContent = state.xp;
        if (profileLessonsCompleted) profileLessonsCompleted.textContent = (state.lessonsCompleted || []).length;

        // Update profile username
        const appUsername = document.getElementById('appUsername');
        const topbarUsername = document.getElementById('topbarUsername');
        const profileUserLevel = document.getElementById('profileUserLevel');
        if (appUsername) appUsername.textContent = state.username || 'Студент RusGo';
        if (topbarUsername) topbarUsername.textContent = state.username || '';
        
        if (profileUserLevel) {
            if (state.xp < 50) profileUserLevel.textContent = 'Новичок';
            else if (state.xp < 150) profileUserLevel.textContent = 'Любитель';
            else profileUserLevel.textContent = 'Знаток';
        }
        
        updateAvatarUI(state.avatar || '👤');
    }

    function updateAvatarUI(avatarText) {
        const avatarSmall = document.querySelector('.user-avatar-small');
        const avatarLarge = document.querySelector('.profile-avatar-large');
        
        if (avatarSmall) {
            avatarSmall.innerHTML = `<span style="font-size: 1.5rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${avatarText}</span>`;
        }
        if (avatarLarge) {
            avatarLarge.innerHTML = `<span style="font-size: 3.5rem; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${avatarText}</span>`;
        }
    }


    /* ---------------------------------------------------
     * ROUTING: Landing Page vs Full App SPA
     * --------------------------------------------------- */
    const landingPage = document.getElementById('landingPage');
    const appInterface = document.getElementById('appInterface');
    const exitAppBtn = document.getElementById('exitAppBtn');
    const startAppButtons = document.querySelectorAll('.start-app-btn');

    async function enterAppMode() {
        if (landingPage && appInterface) {
            landingPage.style.display = 'none';
            appInterface.style.display = 'flex';
            document.body.classList.add('overflow-hidden');
            
            // Reload and render from DB/cache
            await loadState();
            renderAppPath();
            renderLeaderboard();
            renderAchievements();
            renderProfileTracker();
            resetAppChat('food');
        }
    }

    function exitAppMode() {
        if (landingPage && appInterface) {
            appInterface.style.display = 'none';
            landingPage.style.display = 'block';
            document.body.classList.remove('overflow-hidden');
        }
    }

    // Mobile Nav Toggling
    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const mobileNavOverlay = document.querySelector('.mobile-nav-overlay');
    const mobileLinks = document.querySelectorAll('.mobile-link');

    function closeMobileNav() {
        if (mobileNavToggle) mobileNavToggle.classList.remove('active');
        if (mobileNavOverlay) mobileNavOverlay.classList.remove('active');
    }

    if (mobileNavToggle && mobileNavOverlay) {
        mobileNavToggle.addEventListener('click', () => {
            mobileNavToggle.classList.toggle('active');
            mobileNavOverlay.classList.toggle('active');
        });
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', closeMobileNav);
    });

    /* ---------------------------------------------------
     * AUTHENTICATION & LOGIN/REGISTER MODAL LOGIC
     * --------------------------------------------------- */
    const authModal = document.getElementById('authModal');
    const authModalBackdrop = document.getElementById('authModalBackdrop');
    const authModalCloseBtn = document.getElementById('authModalCloseBtn');
    const authForm = document.getElementById('authForm');
    const authUsernameInput = document.getElementById('authUsernameInput');
    const authPasswordInput = document.getElementById('authPasswordInput');
    const avatarSelectionGroup = document.getElementById('avatarSelectionGroup');
    const authErrorMsg = document.getElementById('authErrorMsg');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    
    const tabLoginBtn = document.getElementById('tabLoginBtn');
    const tabRegisterBtn = document.getElementById('tabRegisterBtn');
    
    const headerLoginBtn = document.getElementById('headerLoginBtn');
    const headerRegisterBtn = document.getElementById('headerRegisterBtn');
    const headerDashboardBtn = document.getElementById('headerDashboardBtn');
    const headerLogoutBtn = document.getElementById('headerLogoutBtn');
    
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
    const mobileDashboardBtn = document.getElementById('mobileDashboardBtn');
    const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    
    const appLogoutBtn = document.getElementById('appLogoutBtn');
    
    let authMode = 'login';

    function openAuthModal(mode) {
        authMode = mode || 'login';
        authUsernameInput.value = '';
        authPasswordInput.value = '';
        authErrorMsg.style.display = 'none';
        authErrorMsg.textContent = '';
        
        if (authMode === 'login') {
            tabLoginBtn.classList.add('active');
            tabRegisterBtn.classList.remove('active');
            avatarSelectionGroup.style.display = 'none';
            authSubmitBtn.textContent = 'Войти';
        } else {
            tabLoginBtn.classList.remove('active');
            tabRegisterBtn.classList.add('active');
            avatarSelectionGroup.style.display = 'block';
            authSubmitBtn.textContent = 'Зарегистрироваться';
        }
        
        if (authModal) {
            authModal.classList.add('active');
            document.body.classList.add('overflow-hidden');
        }
    }

    function closeAuthModal() {
        if (authModal) {
            authModal.classList.remove('active');
            if (!appInterface || appInterface.style.display !== 'flex') {
                document.body.classList.remove('overflow-hidden');
            }
        }
    }

    function updateAuthButtonsVisibility() {
        const token = localStorage.getItem('rusgo_auth_token');
        
        if (token) {
            if (headerLoginBtn) headerLoginBtn.style.display = 'none';
            if (headerRegisterBtn) headerRegisterBtn.style.display = 'none';
            if (headerDashboardBtn) headerDashboardBtn.style.display = 'block';
            if (headerLogoutBtn) headerLogoutBtn.style.display = 'block';
            
            if (mobileLoginBtn) mobileLoginBtn.style.display = 'none';
            if (mobileRegisterBtn) mobileRegisterBtn.style.display = 'none';
            if (mobileDashboardBtn) mobileDashboardBtn.style.display = 'block';
            if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'block';
        } else {
            if (headerLoginBtn) headerLoginBtn.style.display = 'block';
            if (headerRegisterBtn) headerRegisterBtn.style.display = 'block';
            if (headerDashboardBtn) headerDashboardBtn.style.display = 'none';
            if (headerLogoutBtn) headerLogoutBtn.style.display = 'none';
            
            if (mobileLoginBtn) mobileLoginBtn.style.display = 'block';
            if (mobileRegisterBtn) mobileRegisterBtn.style.display = 'block';
            if (mobileDashboardBtn) mobileDashboardBtn.style.display = 'none';
            if (mobileLogoutBtn) mobileLogoutBtn.style.display = 'none';
        }
    }

    if (tabLoginBtn) tabLoginBtn.addEventListener('click', () => openAuthModal('login'));
    if (tabRegisterBtn) tabRegisterBtn.addEventListener('click', () => openAuthModal('register'));
    if (authModalCloseBtn) authModalCloseBtn.addEventListener('click', closeAuthModal);
    if (authModalBackdrop) authModalBackdrop.addEventListener('click', closeAuthModal);

    const presetLabels = document.querySelectorAll('.avatar-preset');
    presetLabels.forEach(label => {
        const input = label.querySelector('input');
        if (input) {
            input.addEventListener('change', () => {
                presetLabels.forEach(l => l.classList.remove('active'));
                if (input.checked) {
                    label.classList.add('active');
                }
            });
        }
    });

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            authErrorMsg.style.display = 'none';
            authErrorMsg.textContent = '';
            
            const username = authUsernameInput.value;
            const password = authPasswordInput.value;
            
            let url = `${API_URL}/api/auth/login`;
            let body = { username, password };
            
            if (authMode === 'register') {
                url = `${API_URL}/api/auth/register`;
                const checkedPreset = document.querySelector('input[name="avatarPreset"]:checked');
                body.avatar = checkedPreset ? checkedPreset.value : '👤';
            }
            
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                
                const data = await res.json();
                if (res.ok) {
                    localStorage.setItem('rusgo_auth_token', data.token);
                    closeAuthModal();
                    
                    await checkServerConnection();
                    updateAuthButtonsVisibility();
                    enterAppMode();
                } else {
                    authErrorMsg.textContent = data.error || 'Ошибка авторизации';
                    authErrorMsg.style.display = 'block';
                }
            } catch (err) {
                console.error('Auth error:', err);
                authErrorMsg.textContent = 'Не удалось подключиться к серверу';
                authErrorMsg.style.display = 'block';
            }
        });
    }

    if (headerLoginBtn) headerLoginBtn.addEventListener('click', () => openAuthModal('login'));
    if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', () => {
        closeMobileNav();
        openAuthModal('login');
    });
    
    if (headerRegisterBtn) headerRegisterBtn.addEventListener('click', () => openAuthModal('register'));
    if (mobileRegisterBtn) mobileRegisterBtn.addEventListener('click', () => {
        closeMobileNav();
        openAuthModal('register');
    });

    startAppButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const token = localStorage.getItem('rusgo_auth_token');
            if (token) {
                enterAppMode();
            } else {
                openAuthModal('register');
            }
        });
    });

    if (headerDashboardBtn) headerDashboardBtn.addEventListener('click', enterAppMode);
    if (mobileDashboardBtn) mobileDashboardBtn.addEventListener('click', () => {
        closeMobileNav();
        enterAppMode();
    });

    const handleLogout = () => {
        if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
            logoutUser();
        }
    };
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout);
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', () => {
        closeMobileNav();
        handleLogout();
    });
    if (appLogoutBtn) appLogoutBtn.addEventListener('click', handleLogout);

    if (exitAppBtn) exitAppBtn.addEventListener('click', exitAppMode);

    // Topbar avatar/username -> navigate to profile tab
    const topbarProfileBtn = document.getElementById('topbarProfileBtn');
    if (topbarProfileBtn) {
        topbarProfileBtn.addEventListener('click', () => {
            // Use same logic as sidebar nav buttons
            appNavBtns.forEach(b => b.classList.remove('active'));
            const profileNavBtn = document.querySelector('[data-app-tab="profile"]');
            if (profileNavBtn) profileNavBtn.classList.add('active');

            appViews.forEach(view => {
                view.classList.remove('active');
                if (view.id === 'view-profile') view.classList.add('active');
            });

            if (appHeaderTitle) appHeaderTitle.textContent = 'Мой профиль';
            state.activeTab = 'profile';
        });
    }


    // Sidebar Navigation Tabs inside App
    const appNavBtns = document.querySelectorAll('.app-nav-btn');
    const appViews = document.querySelectorAll('.app-view');
    const appHeaderTitle = document.getElementById('appHeaderTitle');

    const tabTitles = {
        map: 'Карта обучения',
        ai: 'ИИ-Репетитор Анна',
        leaderboard: 'Изумрудная лига',
        achievements: 'Достижения',
        profile: 'Мой профиль'
    };

    appNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            appNavBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const targetTab = btn.getAttribute('data-app-tab');
            state.activeTab = targetTab;
            
            appViews.forEach(view => {
                view.classList.remove('active');
                if (view.id === `view-${targetTab}`) {
                    view.classList.add('active');
                }
            });

            if (appHeaderTitle) {
                appHeaderTitle.textContent = tabTitles[targetTab] || 'RusGo';
            }
        });
    });

    // Helper: switch to any tab programmatically
    function switchToTab(tabName) {
        appNavBtns.forEach(b => b.classList.remove('active'));
        const targetBtn = document.querySelector(`[data-app-tab="${tabName}"]`);
        if (targetBtn) targetBtn.classList.add('active');

        appViews.forEach(view => {
            view.classList.remove('active');
            if (view.id === `view-${tabName}`) view.classList.add('active');
        });

        if (appHeaderTitle) appHeaderTitle.textContent = tabTitles[tabName] || 'RusGo';
        state.activeTab = tabName;

        // Scroll app content to top
        const screenContent = document.querySelector('.app-screen-content');
        if (screenContent) screenContent.scrollTop = 0;
    }

    // Profile shortcut buttons
    const profileToAchievementsBtn = document.getElementById('profileToAchievementsBtn');
    const profileToLeaderboardBtn  = document.getElementById('profileToLeaderboardBtn');
    const profileToMapBtn          = document.getElementById('profileToMapBtn');

    if (profileToAchievementsBtn) profileToAchievementsBtn.addEventListener('click', () => switchToTab('achievements'));
    if (profileToLeaderboardBtn)  profileToLeaderboardBtn.addEventListener('click',  () => switchToTab('leaderboard'));
    if (profileToMapBtn)          profileToMapBtn.addEventListener('click',          () => switchToTab('map'));

    // Also update topbarProfileBtn to use switchToTab (now defined)
    // (Re-bind since switchToTab wasn't available when the btn was first wired)
    if (topbarProfileBtn) {
        topbarProfileBtn.onclick = () => switchToTab('profile');
    }


    /* ---------------------------------------------------
     * DYNAMIC GAME PROGRESS PATH MAP
     * --------------------------------------------------- */
    const branchesData = {
        conversational: {
            title: 'Разговорный русский',
            levels: [
                { id: 101, title: 'Приветствие', desc: 'Как поздороваться и попрощаться', icon: 'message-square' },
                { id: 102, title: 'Знакомство', desc: 'Как представиться и спросить имя', icon: 'user' },
                { id: 103, title: 'Моя семья', desc: 'Члены семьи и общение', icon: 'users' },
                { id: 104, title: 'Еда и кафе', desc: 'Заказ еды и напитков', icon: 'coffee' },
                { id: 105, title: 'В магазине', desc: 'Покупки и цены', icon: 'shopping-cart' },
                { id: 106, title: 'В городе', desc: 'Ориентация в пространстве', icon: 'map-pin' },
                { id: 107, title: 'Погода', desc: 'Времена года и погода', icon: 'cloud-sun' },
                { id: 108, title: 'Хобби и досуг', desc: 'Свободное время', icon: 'smile' },
                { id: 109, title: 'Работа', desc: 'Профессии и занятость', icon: 'briefcase' },
                { id: 110, title: 'Эмоции', desc: 'Как выразить чувства', icon: 'heart' }
            ]
        },
        grammar: {
            title: 'Грамматика и основы',
            levels: [
                { id: 201, title: 'Алфавит', desc: 'Буквы и базовые звуки', icon: 'book-open' },
                { id: 202, title: 'Местоимения', desc: 'Я, ты, он, она и другие', icon: 'fingerprint' },
                { id: 203, title: 'Числа 1-10', desc: 'Количественные числительные', icon: 'binary' },
                { id: 204, title: 'Существительные', desc: 'Мужской, женский и средний род', icon: 'languages' },
                { id: 205, title: 'Глаголы', desc: 'Базовые действия и спряжения', icon: 'activity' },
                { id: 206, title: 'Прилагательные', desc: 'Цвета и описания', icon: 'palette' },
                { id: 207, title: 'Вопросы', desc: 'Кто, что, где, когда, почему', icon: 'help-circle' },
                { id: 208, title: 'Предлоги', desc: 'В, на, под, около', icon: 'compass' },
                { id: 209, title: 'Множественное число', desc: 'Правила образования', icon: 'copy' },
                { id: 210, title: 'Настоящее время', desc: 'Построение простых фраз', icon: 'clock' }
            ]
        },
        culture: {
            title: 'Культура и туризм',
            levels: [
                { id: 301, title: 'Русская кухня', desc: 'Борщ, пельмени и чай', icon: 'utensils' },
                { id: 302, title: 'Метро Москвы', desc: 'Подземные дворцы столицы', icon: 'train' },
                { id: 303, title: 'Сувениры', desc: 'Матрешка, шапка-ушанка', icon: 'gift' },
                { id: 304, title: 'Города России', desc: 'Москва, Петербург, Казань', icon: 'landmark' },
                { id: 305, title: 'Праздники', desc: 'Новый год, Масленица', icon: 'sparkles' },
                { id: 306, title: 'В отеле', desc: 'Заселение и сервис', icon: 'key' },
                { id: 307, title: 'В аэропорту', desc: 'Багаж, паспортный контроль', icon: 'plane' },
                { id: 308, title: 'Времена года', desc: 'Природа и сезоны', icon: 'sun' },
                { id: 309, title: 'Традиции', desc: 'Гостеприимство и баня', icon: 'home' },
                { id: 310, title: 'Фразы выживания', desc: 'Экстренная помощь и знаки', icon: 'shield-alert' }
            ]
        }
    };

    function updateBranchSelectorUI() {
        const branch = state.activeBranch || 'conversational';
        const branchSelectorContainer = document.querySelector('.branch-selector-container');
        if (branchSelectorContainer) {
            branchSelectorContainer.querySelectorAll('.branch-tab-btn').forEach(btn => {
                if (btn.getAttribute('data-branch') === branch) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    }

    // Wire branch selection buttons
    const branchSelectorContainer = document.querySelector('.branch-selector-container');
    if (branchSelectorContainer) {
        branchSelectorContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.branch-tab-btn');
            if (!btn) return;
            
            const branch = btn.getAttribute('data-branch');
            state.activeBranch = branch;
            
            saveState();
            renderAppPath();
        });
    }

    function renderAppPath() {
        updateBranchSelectorUI();
        const appPathNodes = document.getElementById('appPathNodes');
        const appPathProgress = document.getElementById('appPathProgress');
        if (!appPathNodes) return;

        appPathNodes.innerHTML = '';
        
        const branchKey = state.activeBranch || 'conversational';
        const currentBranch = branchesData[branchKey] || branchesData.conversational;
        const branchLevels = currentBranch.levels;

        let activeFound = false;

        branchLevels.forEach((level, idx) => {
            const lessons = state.lessonsCompleted || [];
            const isCompleted = lessons.includes(level.id);
            // Level is active if it is the first uncompleted level in this branch, or all previous are completed
            let isActive = false;
            if (!isCompleted && !activeFound) {
                isActive = true;
                activeFound = true;
            } else if (idx === 0 && lessons.filter(id => branchLevels.map(l => l.id).includes(id)).length === 0) {
                isActive = true;
                activeFound = true;
            }

            const isLocked = !isCompleted && !isActive;

            // Generate HTML Node element
            const nodeDiv = document.createElement('div');
            nodeDiv.className = 'path-node-item';

            let statusClass = 'locked';
            if (isCompleted) statusClass = 'completed';
            if (isActive) statusClass = 'active';

            let iconHTML = `<i data-lucide="${level.icon}" class="node-inner-icon"></i>`;
            if (isLocked) iconHTML = `<i data-lucide="lock" class="node-inner-icon"></i>`;

            nodeDiv.innerHTML = `
                <button class="node-btn ${statusClass}" data-level-id="${level.id}" ${isLocked ? 'disabled' : ''}>
                    ${isActive ? '<span class="crown-crown">👑</span>' : ''}
                    ${iconHTML}
                    <span class="node-label-floating">${level.title}</span>
                </button>
            `;

            // Bind start lesson action
            const button = nodeDiv.querySelector('button');
            button.addEventListener('click', () => {
                if (!isLocked) {
                    startInteractiveLesson(level.id);
                }
            });

            appPathNodes.appendChild(nodeDiv);
        });

        // Update vertical line progress percentage
        if (appPathProgress) {
            const lessons = state.lessonsCompleted || [];
            const completedInBranch = branchLevels.filter(level => lessons.includes(level.id)).length;
            let percent = (completedInBranch / branchLevels.length) * 100;
            appPathProgress.style.height = `${percent}%`;
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }


    /* ---------------------------------------------------
     * INTERACTIVE LESSONS SYSTEM ENGINE
     * --------------------------------------------------- */
    const lessonOverlay = document.getElementById('lessonOverlay');
    const exitLessonBtn = document.getElementById('exitLessonBtn');
    const lessonPlayerBody = document.getElementById('lessonPlayerBody');
    const lessonProgressBar = document.getElementById('lessonProgressBar');
    const lessonXpCounter = document.getElementById('lessonXpCounter');
    const lessonFeedback = document.getElementById('lessonFeedback');
    const lessonActionBtn = document.getElementById('lessonActionBtn');
    const lessonFooter = document.querySelector('.lesson-player-footer');

    // Speech Synthesizer call
    function speakRussianText(text) {
        if (!state.ttsEnabled) return;
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // cancel pending speech
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'ru-RU';
            utterance.rate = 0.85; // slightly slower for learners
            window.speechSynthesis.speak(utterance);
        }
    }

    const lessonsData = {
        // Conversational Branch
        101: {
            title: 'Приветствие',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Формы приветствия и прощания <i data-lucide="message-square" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите основные фразы:',
                    vocab: [
                        { cyr: 'Привет', pron: '[Pri-vet]', en: 'Hello (informal)', icon: 'hand' },
                        { cyr: 'Здравствуйте', pron: '[Zdrav-stvuy-te]', en: 'Hello (formal)', icon: 'users' },
                        { cyr: 'Пока', pron: '[Pa-ka]', en: 'Bye (informal)', icon: 'smile' },
                        { cyr: 'До свидания', pron: '[Do svi-da-ni-ya]', en: 'Goodbye (formal)', icon: 'log-out' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как сказать привет другу в неформальной обстановке?',
                    options: ['До свидания', 'Здравствуйте', 'Привет', 'Пожалуйста'],
                    correctIdx: 2
                },
                {
                    type: 'quiz_choice',
                    title: 'Выберите вежливое и уважительное прощание:',
                    options: ['Привет', 'До свидания', 'Пока', 'Здорово'],
                    correctIdx: 1
                }
            ]
        },
        102: {
            title: 'Знакомство',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Знакомимся с людьми <i data-lucide="user" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Кликните на слово, чтобы услышать:',
                    vocab: [
                        { cyr: 'Меня зовут', pron: '[Me-nya za-vut]', en: 'My name is', icon: 'user' },
                        { cyr: 'Как тебя зовут?', pron: '[Kak te-bya za-vut?]', en: 'What is your name?', icon: 'help-circle' },
                        { cyr: 'Приятно познакомиться', pron: '[Pri-yat-na pa-zna-ko-mit-sya]', en: 'Nice to meet you', icon: 'heart' }
                    ]
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Как тебя зовут?"',
                    desc: 'Выберите слова в правильном порядке:',
                    scrambled: ['тебя', 'зовут', 'Как', '?'],
                    correctOrder: ['Как', 'тебя', 'зовут', '?']
                },
                {
                    type: 'quiz_choice',
                    title: 'Что ответить собеседнику на фразу "Меня зовут Анна"?',
                    options: ['До свидания', 'Приятно познакомиться', 'Где метро?', 'Пока'],
                    correctIdx: 1
                }
            ]
        },
        103: {
            title: 'Моя семья',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Члены семьи <i data-lucide="users" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Нажмите для перевода:',
                    vocab: [
                        { cyr: 'Мама', pron: '[Ma-ma]', en: 'Mother', icon: 'heart' },
                        { cyr: 'Папа', pron: '[Pa-pa]', en: 'Father', icon: 'award' },
                        { cyr: 'Брат', pron: '[Brat]', en: 'Brother', icon: 'smile' },
                        { cyr: 'Сестра', pron: '[Ses-tra]', en: 'Sister', icon: 'smile' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как переводится слово "Мама"?',
                    options: ['Father', 'Sister', 'Mother', 'Brother'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "У меня есть брат"',
                    desc: 'Расположите карточки слов:',
                    scrambled: ['брат', 'У', 'есть', 'меня'],
                    correctOrder: ['У', 'меня', 'есть', 'брат']
                }
            ]
        },
        104: {
            title: 'Еда и кафе',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Еда и напитки <i data-lucide="coffee" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Нажмите, чтобы прослушать:',
                    vocab: [
                        { cyr: 'Кофе', pron: '[Ko-fe]', en: 'Coffee', icon: 'coffee' },
                        { cyr: 'Чай', pron: '[Chay]', en: 'Tea', icon: 'cup-soap' },
                        { cyr: 'Вода', pron: '[Va-da]', en: 'Water', icon: 'droplet' },
                        { cyr: 'Суп', pron: '[Sup]', en: 'Soup', icon: 'utensils' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какой напиток переводится как "Tea"?',
                    options: ['Кофе', 'Вода', 'Чай', 'Суп'],
                    correctIdx: 2
                },
                {
                    type: 'quiz_choice',
                    title: 'Как вежливо попросить кофе?',
                    options: ['Эй, кофе!', 'Кофе, пожалуйста.', 'Я не хочу кофе.', 'Где тут суп?'],
                    correctIdx: 1
                }
            ]
        },
        105: {
            title: 'В магазине',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Покупки в магазине <i data-lucide="shopping-cart" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите новые слова:',
                    vocab: [
                        { cyr: 'Сколько стоит?', pron: '[Skol-ko sto-it?]', en: 'How much does it cost?', icon: 'help-circle' },
                        { cyr: 'Деньги', pron: '[Den-gi]', en: 'Money', icon: 'coins' },
                        { cyr: 'Магазин', pron: '[Ma-ga-zin]', en: 'Shop', icon: 'shopping-bag' },
                        { cyr: 'Хлеб', pron: '[Hleb]', en: 'Bread', icon: 'chevrons-right' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Где мы обычно покупаем хлеб?',
                    options: ['В метро', 'В магазине', 'В аптеке', 'В лесу'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Сколько это стоит?"',
                    desc: 'Порядок слов:',
                    scrambled: ['стоит', 'это', 'Сколько', '?'],
                    correctOrder: ['Сколько', 'это', 'стоит', '?']
                }
            ]
        },
        106: {
            title: 'В городе',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Ориентация в городе <i data-lucide="map-pin" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Ключевые слова для туриста:',
                    vocab: [
                        { cyr: 'Улица', pron: '[U-li-tsa]', en: 'Street', icon: 'map' },
                        { cyr: 'Метро', pron: '[Met-ro]', en: 'Subway', icon: 'train' },
                        { cyr: 'Аптека', pron: '[Ap-te-ka]', en: 'Pharmacy', icon: 'activity' },
                        { cyr: 'Где находится?', pron: '[Gde na-ho-dit-sya?]', en: 'Where is...?', icon: 'navigation' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Что такое "Аптека"?',
                    options: ['Subway', 'Street', 'Pharmacy', 'Hotel'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Где находится метро?"',
                    desc: 'Соберите предложение:',
                    scrambled: ['метро', 'Где', 'находится', '?'],
                    correctOrder: ['Где', 'находится', 'метро', '?']
                }
            ]
        },
        107: {
            title: 'Погода',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Описание погоды <i data-lucide="cloud-sun" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите слова:',
                    vocab: [
                        { cyr: 'Холодно', pron: '[Ho-lad-na]', en: 'Cold', icon: 'snowflake' },
                        { cyr: 'Жарко', pron: '[Zhar-ka]', en: 'Hot', icon: 'sun' },
                        { cyr: 'Дождь', pron: '[Dozhd]', en: 'Rain', icon: 'cloud-rain' },
                        { cyr: 'Солнце', pron: '[Soln-tse]', en: 'Sun', icon: 'sun' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово описывает погоду зимой в Сибири?',
                    options: ['Жарко', 'Солнце', 'Холодно', 'Тепло'],
                    correctIdx: 2
                },
                {
                    type: 'quiz_choice',
                    title: 'Как переводится "Rain"?',
                    options: ['Солнце', 'Дождь', 'Снег', 'Ветер'],
                    correctIdx: 1
                }
            ]
        },
        108: {
            title: 'Хобби и досуг',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Увлечения и хобби <i data-lucide="smile" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Нажмите для перевода:',
                    vocab: [
                        { cyr: 'Музыка', pron: '[Mu-zy-ka]', en: 'Music', icon: 'music' },
                        { cyr: 'Спорт', pron: '[Sport]', en: 'Sport', icon: 'activity' },
                        { cyr: 'Книга', pron: '[Kni-ga]', en: 'Book', icon: 'book' },
                        { cyr: 'Кино', pron: '[Ki-no]', en: 'Cinema', icon: 'film' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как сказать "I read books"? (Я читаю...)',
                    options: ['Спорт', 'Книги', 'Кино', 'Музыку'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Я люблю спорт"',
                    desc: 'Порядок слов:',
                    scrambled: ['люблю', 'Я', 'спорт'],
                    correctOrder: ['Я', 'люблю', 'спорт']
                }
            ]
        },
        109: {
            title: 'Работа',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Профессии и занятость <i data-lucide="briefcase" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите названия:',
                    vocab: [
                        { cyr: 'Врач', pron: '[Vrach]', en: 'Doctor', icon: 'heart-pulse' },
                        { cyr: 'Учитель', pron: '[U-chi-tel]', en: 'Teacher', icon: 'book-open' },
                        { cyr: 'Офис', pron: '[O-fis]', en: 'Office', icon: 'building' },
                        { cyr: 'Работа', pron: '[Ra-bo-ta]', en: 'Work', icon: 'briefcase' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Кто обучает детей в школе?',
                    options: ['Врач', 'Учитель', 'Водитель', 'Строитель'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Как переводится слово "Врач"?',
                    options: ['Doctor', 'Teacher', 'Engineer', 'Office'],
                    correctIdx: 0
                }
            ]
        },
        110: {
            title: 'Эмоции',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Чувства и эмоции <i data-lucide="heart" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите слова:',
                    vocab: [
                        { cyr: 'Счастье', pron: '[Schas-tye]', en: 'Happiness', icon: 'smile' },
                        { cyr: 'Радость', pron: '[Ra-dost]', en: 'Joy', icon: 'award' },
                        { cyr: 'Грусть', pron: '[Grust]', en: 'Sadness', icon: 'frown' },
                        { cyr: 'Страх', pron: '[Strah]', en: 'Fear', icon: 'shield-alert' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово означает "Happiness"?',
                    options: ['Грусть', 'Счастье', 'Страх', 'Работа'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово противоположно по смыслу слову "Радость"?',
                    options: ['Счастье', 'Грусть', 'Спорт', 'Привет'],
                    correctIdx: 1
                }
            ]
        },

        // Grammar Branch
        201: {
            title: 'Алфавит',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'alphabet_intro',
                    title: 'Русские буквы <i data-lucide="book-open" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Нажмите на букву для прослушивания правильного звука:',
                    cards: [
                        { cyr: 'А', lat: 'A (as in father)', word: 'Арбуз (Watermelon)' },
                        { cyr: 'Б', lat: 'B (as in book)', word: 'Банан (Banana)' },
                        { cyr: 'Д', lat: 'D (as in door)', word: 'Дом (House)' },
                        { cyr: 'К', lat: 'K (as in kite)', word: 'Кот (Cat)' },
                        { cyr: 'М', lat: 'M (as in milk)', word: 'Мама (Mother)' },
                        { cyr: 'Т', lat: 'T (as in tree)', word: 'Телефон (Phone)' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какая русская буква передает звук [B]?',
                    options: ['А', 'Б', 'Д', 'К'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'С какой буквы начинается слово "Дом"?',
                    options: ['К', 'М', 'Д', 'Т'],
                    correctIdx: 2
                }
            ]
        },
        202: {
            title: 'Местоимения',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Личные местоимения <i data-lucide="fingerprint" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Нажмите, чтобы прослушать перевод:',
                    vocab: [
                        { cyr: 'Я', pron: '[Ya]', en: 'I', icon: 'user' },
                        { cyr: 'Ты', pron: '[Ty]', en: 'You (singular/informal)', icon: 'user' },
                        { cyr: 'Он', pron: '[On]', en: 'He', icon: 'user' },
                        { cyr: 'Она', pron: '[A-na]', en: 'She', icon: 'user' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое местоимение означает "She"?',
                    options: ['Я', 'Ты', 'Он', 'Она'],
                    correctIdx: 3
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Он мой друг"',
                    desc: 'Порядок слов:',
                    scrambled: ['друг', 'Он', 'мой'],
                    correctOrder: ['Он', 'мой', 'друг']
                }
            ]
        },
        203: {
            title: 'Числа 1-10',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Считаем по-русски <i data-lucide="binary" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Цифры от 1 до 5:',
                    vocab: [
                        { cyr: 'Один', pron: '[A-din]', en: '1 / One', icon: 'chevron-right' },
                        { cyr: 'Два', pron: '[Dva]', en: '2 / Two', icon: 'chevrons-right' },
                        { cyr: 'Три', pron: '[Tri]', en: '3 / Three', icon: 'chevrons-right' },
                        { cyr: 'Пять', pron: '[Pyat]', en: '5 / Five', icon: 'star' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какая цифра переводится как "Two"?',
                    options: ['Один', 'Три', 'Два', 'Пять'],
                    correctIdx: 2
                },
                {
                    type: 'quiz_choice',
                    title: 'Сколько пальцев на руке у человека?',
                    options: ['Два', 'Один', 'Три', 'Пять'],
                    correctIdx: 3
                }
            ]
        },
        204: {
            title: 'Существительные',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Род существительных <i data-lucide="languages" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Примеры мужского, женского и среднего рода:',
                    vocab: [
                        { cyr: 'Стол', pron: '[Stol]', en: 'Table (Masculine - ends in consonant)', icon: 'square' },
                        { cyr: 'Книга', pron: '[Kni-ga]', en: 'Book (Feminine - ends in A)', icon: 'book' },
                        { cyr: 'Окно', pron: '[Ak-no]', en: 'Window (Neuter - ends in O)', icon: 'layout' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какого рода слово "Книга"?',
                    options: ['Мужской род', 'Женский род', 'Средний род', 'Общий род'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Слово "Окно" относится к какому роду?',
                    options: ['Мужской род', 'Женский род', 'Средний род', 'Нет рода'],
                    correctIdx: 2
                }
            ]
        },
        205: {
            title: 'Глаголы',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Начальная форма глаголов <i data-lucide="activity" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Инфинитивы базовых действий:',
                    vocab: [
                        { cyr: 'Идти', pron: '[Id-ti]', en: 'To go', icon: 'navigation' },
                        { cyr: 'Читать', pron: '[Chi-tat]', en: 'To read', icon: 'book-open' },
                        { cyr: 'Писать', pron: '[Pi-sat]', en: 'To write', icon: 'pen-tool' },
                        { cyr: 'Знать', pron: '[Znat]', en: 'To know', icon: 'brain' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какой глагол переводится как "To read"?',
                    options: ['Идти', 'Читать', 'Писать', 'Знать'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Я хочу читать"',
                    desc: 'Порядок слов:',
                    scrambled: ['читать', 'хочу', 'Я'],
                    correctOrder: ['Я', 'хочу', 'читать']
                }
            ]
        },
        206: {
            title: 'Прилагательные',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Свойства и цвета <i data-lucide="palette" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите прилагательные:',
                    vocab: [
                        { cyr: 'Красный', pron: '[Kras-ny]', en: 'Red', icon: 'palette' },
                        { cyr: 'Синий', pron: '[Si-ni]', en: 'Blue', icon: 'palette' },
                        { cyr: 'Большой', pron: '[Bal-shoy]', en: 'Big', icon: 'maximize' },
                        { cyr: 'Новый', pron: '[No-vy]', en: 'New', icon: 'sparkles' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как по-русски сказать "Red"?',
                    options: ['Синий', 'Красный', 'Большой', 'Новый'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое прилагательное означает "Big"?',
                    options: ['Новый', 'Синий', 'Красный', 'Большой'],
                    correctIdx: 3
                }
            ]
        },
        207: {
            title: 'Вопросы',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Вопросительные слова <i data-lucide="help-circle" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Изучите вопросительные местоимения:',
                    vocab: [
                        { cyr: 'Кто?', pron: '[Kto?]', en: 'Who?', icon: 'help-circle' },
                        { cyr: 'Что?', pron: '[Chto?]', en: 'What?', icon: 'help-circle' },
                        { cyr: 'Где?', pron: '[Gde?]', en: 'Where?', icon: 'help-circle' },
                        { cyr: 'Когда?', pron: '[Kag-da?]', en: 'When?', icon: 'help-circle' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово переводится как "Where"?',
                    options: ['Кто', 'Что', 'Где', 'Когда'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите вопрос: "Кто это такой ?"',
                    desc: 'Порядок слов:',
                    scrambled: ['такой', 'Кто', 'это', '?'],
                    correctOrder: ['Кто', 'это', 'такой', '?']
                }
            ]
        },
        208: {
            title: 'Предлоги',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Предлоги места <i data-lucide="compass" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Предлоги положения предметов:',
                    vocab: [
                        { cyr: 'В', pron: '[V]', en: 'In / Inside', icon: 'box' },
                        { cyr: 'На', pron: '[Na]', en: 'On / On top of', icon: 'chevrons-up' },
                        { cyr: 'Под', pron: '[Pod]', en: 'Under', icon: 'chevrons-down' },
                        { cyr: 'Около', pron: '[O-ka-la]', en: 'Near / Next to', icon: 'align-justify' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как сказать "The cat is in the box" (Кот находится ___ коробке)?',
                    options: ['на', 'под', 'в', 'около'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Книга лежит на столе"',
                    desc: 'Расположите карточки:',
                    scrambled: ['на', 'лежат', 'лежит', 'Книга', 'столе'],
                    correctOrder: ['Книга', 'лежит', 'на', 'столе']
                }
            ]
        },
        209: {
            title: 'Множественное число',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Множественное число существительных <i data-lucide="copy" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Один предмет против нескольких:',
                    vocab: [
                        { cyr: 'Книги', pron: '[Kni-gi]', en: 'Books', icon: 'copy' },
                        { cyr: 'Дома', pron: '[Da-ma]', en: 'Houses', icon: 'copy' },
                        { cyr: 'Коты', pron: '[Ka-ty]', en: 'Cats', icon: 'copy' },
                        { cyr: 'Яблоки', pron: '[Yab-la-ki]', en: 'Apples', icon: 'copy' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово является множественным числом от слова "Кот"?',
                    options: ['Книги', 'Коты', 'Яблоки', 'Дома'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово переводится как "Books"?',
                    options: ['Коты', 'Дома', 'Книги', 'Яблоки'],
                    correctIdx: 2
                }
            ]
        },
        210: {
            title: 'Настоящее время',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Глаголы в настоящем времени <i data-lucide="clock" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Спряжение глагола "Говорить" (to speak):',
                    vocab: [
                        { cyr: 'Я говорю', pron: '[Ya ga-va-ryu]', en: 'I speak', icon: 'user' },
                        { cyr: 'Ты говоришь', pron: '[Ty ga-va-rish]', en: 'You speak', icon: 'user' },
                        { cyr: 'Он говорит', pron: '[On ga-va-rit]', en: 'He speaks', icon: 'user' },
                        { cyr: 'Мы говорим', pron: '[My ga-va-rim]', en: 'We speak', icon: 'users' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Выберите верную форму глагола: "Мы ___ по-русски" (We speak...)',
                    options: ['говорю', 'говоришь', 'говорим', 'говорит'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Ты говоришь очень хорошо"',
                    desc: 'Расположите слова:',
                    scrambled: ['хорошо', 'говоришь', 'Ты', 'очень'],
                    correctOrder: ['Ты', 'говоришь', 'очень', 'хорошо']
                }
            ]
        },

        // Culture Branch
        301: {
            title: 'Русская кухня',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Русская кулинария <i data-lucide="utensils" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Национальные русские блюда:',
                    vocab: [
                        { cyr: 'Борщ', pron: '[Borsh]', en: 'Beetroot soup', icon: 'soup' },
                        { cyr: 'Блины', pron: '[Bli-ny]', en: 'Pancakes', icon: 'pizza' },
                        { cyr: 'Пельмени', pron: '[Pel-me-ni]', en: 'Dumplings', icon: 'cookie' },
                        { cyr: 'Самовар', pron: '[Sa-ma-var]', en: 'Traditional water boiler', icon: 'cup-soap' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какой суп традиционно имеет ярко-красный цвет из-за свеклы?',
                    options: ['Суп-пюре', 'Борщ', 'Грибной суп', 'Куриный бульон'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите предложение: "Я очень люблю блины"',
                    desc: 'Порядок слов:',
                    scrambled: ['люблю', 'Я', 'блины', 'очень'],
                    correctOrder: ['Я', 'очень', 'люблю', 'блины']
                }
            ]
        },
        302: {
            title: 'Метро Москвы',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Транспорт и метро Москвы <i data-lucide="train" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Слова для передвижения:',
                    vocab: [
                        { cyr: 'Станция', pron: '[Stan-tsi-ya]', en: 'Station', icon: 'map-pin' },
                        { cyr: 'Поезд', pron: '[Po-ezd]', en: 'Train', icon: 'train' },
                        { cyr: 'Переход', pron: '[Pe-re-hod]', en: 'Transfer / Crosswalk', icon: 'navigation' },
                        { cyr: 'Эскалатор', pron: '[Es-ka-la-tar]', en: 'Escalator', icon: 'chevrons-down' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Как переводится слово "Поезд"?',
                    options: ['Station', 'Train', 'Bus', 'Plane'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Где находится переход ?"',
                    desc: 'Порядок слов:',
                    scrambled: ['находится', 'Где', 'переход', '?'],
                    correctOrder: ['Где', 'находится', 'переход', '?']
                }
            ]
        },
        303: {
            title: 'Сувениры',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Сувениры из России <i data-lucide="gift" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Традиционные русские подарки:',
                    vocab: [
                        { cyr: 'Матрешка', pron: '[Mat-ryosh-ka]', en: 'Wooden nesting doll', icon: 'toy-brick' },
                        { cyr: 'Ушанка', pron: '[U-shan-ka]', en: 'Fur hat with ear flaps', icon: 'sparkles' },
                        { cyr: 'Балалайка', pron: '[Ba-la-lay-ka]', en: 'Three-stringed guitar', icon: 'music' },
                        { cyr: 'Самовар', pron: '[Sa-ma-var]', en: 'Metal tea kettle', icon: 'cup-soap' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какой сувенир представляет собой деревянную куклу, внутри которой прячутся другие куклы?',
                    options: ['Балалайка', 'Матрешка', 'Ушанка', 'Самовар'],
                    correctIdx: 1
                },
                {
                    type: 'quiz_choice',
                    title: 'Что такое "Ушанка"?',
                    options: ['Традиционная теплая меховая шапка', 'Музыкальный инструмент', 'Деревянная игрушка', 'Напиток'],
                    correctIdx: 0
                }
            ]
        },
        304: {
            title: 'Города России',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'География России <i data-lucide="landmark" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Крупнейшие города страны:',
                    vocab: [
                        { cyr: 'Москва', pron: '[Mas-kva]', en: 'Moscow (Capital)', icon: 'map' },
                        { cyr: 'Петербург', pron: '[Pe-ter-burg]', en: 'St. Petersburg', icon: 'map' },
                        { cyr: 'Казань', pron: '[Ka-zan]', en: 'Kazan', icon: 'map' },
                        { cyr: 'Сибирь', pron: '[Si-bir]', en: 'Siberia (Region)', icon: 'snowflake' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какой город является столицей Российской Федерации?',
                    options: ['Петербург', 'Москва', 'Казань', 'Владивосток'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите предложение: "Я еду в Москву"',
                    desc: 'Порядок слов:',
                    scrambled: ['Москву', 'еду', 'Я', 'в'],
                    correctOrder: ['Я', 'в', 'еду', 'Москву']
                }
            ]
        },
        305: {
            title: 'Праздники',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Русские праздники и традиции <i data-lucide="sparkles" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Популярные праздничные дни:',
                    vocab: [
                        { cyr: 'Новый год', pron: '[No-vy god]', en: 'New Year', icon: 'gift' },
                        { cyr: 'Масленица', pron: '[Mas-le-ni-tsa]', en: 'Butter Week / pancake festival', icon: 'sun' },
                        { cyr: 'Рождество', pron: '[Razh-dest-vo]', en: 'Christmas', icon: 'star' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'На какой праздник в России традиционно пекут блины и прощаются с зимой?',
                    options: ['Новый год', 'Масленица', 'День победы', 'Рождество'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите поздравление: "С Новым годом !"',
                    desc: 'Порядок карточек:',
                    scrambled: ['годом', 'С', '!', 'Новым'],
                    correctOrder: ['С', 'Новым', 'годом', '!']
                }
            ]
        },
        306: {
            title: 'В отеле',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Проживание в отеле <i data-lucide="key" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Слова для общения на ресепшн:',
                    vocab: [
                        { cyr: 'Номер', pron: '[No-mer]', en: 'Room', icon: 'key' },
                        { cyr: 'Ключ', pron: '[Klyuch]', en: 'Key', icon: 'key' },
                        { cyr: 'Ресепшн', pron: '[Re-sep-shn]', en: 'Reception', icon: 'user' },
                        { cyr: 'Паспорт', pron: '[Pas-part]', en: 'Passport', icon: 'file-text' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово переводится как "Key"?',
                    options: ['Номер', 'Паспорт', 'Ключ', 'Отель'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Покажите ваш паспорт пожалуйста"',
                    desc: 'Порядок слов:',
                    scrambled: ['пожалуйста', 'паспорт', 'Покажите', 'ваш'],
                    correctOrder: ['Покажите', 'ваш', 'паспорт', 'пожалуйста']
                }
            ]
        },
        307: {
            title: 'В аэропорту',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'В аэропорту <i data-lucide="plane" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Слова перед полетом:',
                    vocab: [
                        { cyr: 'Самолет', pron: '[Sa-ma-lyot]', en: 'Airplane', icon: 'plane' },
                        { cyr: 'Билет', pron: '[Bi-let]', en: 'Ticket', icon: 'ticket' },
                        { cyr: 'Багаж', pron: '[Ba-gazh]', en: 'Luggage', icon: 'luggage' },
                        { cyr: 'Выход', pron: '[Vy-had]', en: 'Gate / Exit', icon: 'log-out' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какое слово означает ваш чемодан или сумки?',
                    options: ['Самолет', 'Билет', 'Багаж', 'Выход'],
                    correctIdx: 2
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Где мой багаж ?"',
                    desc: 'Порядок слов:',
                    scrambled: ['багаж', 'мой', 'Где', '?'],
                    correctOrder: ['Где', 'мой', 'багаж', '?']
                }
            ]
        },
        308: {
            title: 'Времена года',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Времена года <i data-lucide="sun" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Сезоны года:',
                    vocab: [
                        { cyr: 'Зима', pron: '[Zi-ma]', en: 'Winter', icon: 'snowflake' },
                        { cyr: 'Весна', pron: '[Ves-na]', en: 'Spring', icon: 'cloud-rain' },
                        { cyr: 'Лето', pron: '[Le-ta]', en: 'Summer', icon: 'sun' },
                        { cyr: 'Осень', pron: '[O-sin]', en: 'Autumn', icon: 'leaf' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Когда в России очень холодно и лежит много снега?',
                    options: ['Лето', 'Весна', 'Осень', 'Зима'],
                    correctIdx: 3
                },
                {
                    type: 'quiz_choice',
                    title: 'Как переводится "Summer"?',
                    options: ['Зима', 'Лето', 'Весна', 'Осень'],
                    correctIdx: 1
                }
            ]
        },
        309: {
            title: 'Традиции',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Русский быт и традиции <i data-lucide="home" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Популярные культурные элементы:',
                    vocab: [
                        { cyr: 'Русская баня', pron: '[Rus-ka-ya ba-nya]', en: 'Russian sauna / bathhouse', icon: 'home' },
                        { cyr: 'Дача', pron: '[Da-cha]', en: 'Summer country cottage', icon: 'home' },
                        { cyr: 'Веник', pron: '[Ve-nik]', en: 'Bathhouse whisk of birch twigs', icon: 'leaf' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Где россияне традиционно отдыхают за городом летом, выращивают овощи и сажают цветы?',
                    options: ['В метро', 'На даче', 'В аэропорту', 'В отеле'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите предложение: "Мы едем на дачу"',
                    desc: 'Порядок карточек:',
                    scrambled: ['дачу', 'едем', 'Мы', 'на'],
                    correctOrder: ['Мы', 'на', 'едем', 'дачу']
                }
            ]
        },
        310: {
            title: 'Фразы выживания',
            xpReward: 20,
            gemsReward: 5,
            slides: [
                {
                    type: 'vocab_intro',
                    title: 'Помощь и безопасность <i data-lucide="shield-alert" class="inline-icon text-primary" style="width: 1.1rem; height: 1.1rem; display: inline-block; vertical-align: -2px; margin-left: 0.25rem;"></i>',
                    desc: 'Критические фразы:',
                    vocab: [
                        { cyr: 'Помогите!', pron: '[Pa-ma-gi-te!]', en: 'Help!', icon: 'shield-alert' },
                        { cyr: 'Где больница?', pron: '[Gde bal-ni-tsa?]', en: 'Where is the hospital?', icon: 'heart-pulse' },
                        { cyr: 'Я заблудился', pron: '[Ya za-blu-dil-sya]', en: 'I am lost', icon: 'map-pin' },
                        { cyr: 'Полиция', pron: '[Pa-li-tsi-ya]', en: 'Police', icon: 'shield' }
                    ]
                },
                {
                    type: 'quiz_choice',
                    title: 'Какую фразу использовать, если вам срочно нужна помощь?',
                    options: ['Пока!', 'Помогите!', 'Здравствуйте', 'Сколько стоит?'],
                    correctIdx: 1
                },
                {
                    type: 'constructor',
                    title: 'Соберите фразу: "Где находится ближайшая больница ?"',
                    desc: 'Порядок слов:',
                    scrambled: ['ближайшая', 'больница', 'находится', 'Где', '?'],
                    correctOrder: ['Где', 'находится', 'ближайшая', 'больница', '?']
                }
            ]
        }
    };

    let activeLessonId = null;
    let activeLesson = null;
    let currentSlideIdx = 0;
    let totalSlidesCount = 0;
    let userScore = 0;
    
    // UI state helper flags
    let isSlideChecked = false;
    let isSlideCorrect = false;

    function startInteractiveLesson(levelId) {
        activeLessonId = levelId;
        activeLesson = lessonsData[levelId];
        if (!activeLesson) return;

        currentSlideIdx = 0;
        totalSlidesCount = activeLesson.slides.length;
        userScore = 0;

        if (lessonOverlay) {
            lessonOverlay.style.display = 'flex';
        }
        
        if (lessonXpCounter) lessonXpCounter.textContent = '0';
        
        loadLessonSlide();
    }

    function exitLesson() {
        if (confirm('Вы уверены, что хотите прервать урок? Прогресс не сохранится.')) {
            if (lessonOverlay) lessonOverlay.style.display = 'none';
        }
    }

    if (exitLessonBtn) exitLessonBtn.addEventListener('click', exitLesson);

    function loadLessonSlide() {
        isSlideChecked = false;
        isSlideCorrect = false;

        // Reset check panel
        if (lessonFooter) {
            lessonFooter.className = 'lesson-player-footer';
        }
        if (lessonFeedback) lessonFeedback.innerHTML = '';
        if (lessonActionBtn) {
            lessonActionBtn.textContent = 'Проверить';
            lessonActionBtn.disabled = false;
        }

        // Set progress
        if (lessonProgressBar) {
            let percent = (currentSlideIdx / totalSlidesCount) * 100;
            lessonProgressBar.style.width = `${percent}%`;
        }

        const slide = activeLesson.slides[currentSlideIdx];
        if (!slide) {
            showVictoryScreen();
            return;
        }

        // Render slide template content
        lessonPlayerBody.innerHTML = '';
        
        const slideContainer = document.createElement('div');
        slideContainer.className = 'lesson-slide';
        
        const titleH3 = document.createElement('h3');
        titleH3.innerHTML = slide.title;
        slideContainer.appendChild(titleH3);

        if (slide.desc) {
            const descP = document.createElement('p');
            descP.style.textAlign = 'center';
            descP.style.color = 'var(--text-muted)';
            descP.style.marginBottom = '1.5rem';
            descP.textContent = slide.desc;
            slideContainer.appendChild(descP);
        }

        if (slide.type === 'alphabet_intro') {
            // Render letters grid
            const grid = document.createElement('div');
            grid.className = 'alphabet-cards-grid';

            slide.cards.forEach(c => {
                const card = document.createElement('div');
                card.className = 'alphabet-card';
                card.innerHTML = `
                    <div class="letter-cyr">${c.cyr}</div>
                    <div class="letter-lat">${c.lat}</div>
                    <div class="letter-word">${c.word}</div>
                `;
                card.addEventListener('click', () => {
                    grid.querySelectorAll('.alphabet-card').forEach(x => x.classList.remove('clicked'));
                    card.classList.add('clicked');
                    speakRussianText(c.cyr);
                });
                grid.appendChild(card);
            });

            slideContainer.appendChild(grid);
            if (lessonActionBtn) lessonActionBtn.textContent = 'Продолжить';
            isSlideChecked = true; // Auto-passable slide

        } else if (slide.type === 'vocab_intro') {
            // Render flipped interactive vocabulary flashcard
            const cardWrapper = document.createElement('div');
            cardWrapper.className = 'vocab-card-container';
            cardWrapper.innerHTML = `
                <div class="vocab-card-inner">
                    <div class="vocab-card-front">
                        <div class="vocab-emoji"><i data-lucide="${slide.vocab[0].icon}" style="width: 4rem; height: 4rem; color: var(--primary);"></i></div>
                        <div class="vocab-word-ru">${slide.vocab[0].cyr}</div>
                        <div class="vocab-word-pron">${slide.vocab[0].pron}</div>
                        <span>Кликни, чтобы перевести</span>
                    </div>
                    <div class="vocab-card-back">
                        <div class="vocab-word-en">${slide.vocab[0].en}</div>
                        <span>Кликни, чтобы вернуться</span>
                    </div>
                </div>
            `;
            
            // Loop flashcards index click helper
            let vocabIndex = 0;
            const inner = cardWrapper.querySelector('.vocab-card-inner');
            
            cardWrapper.addEventListener('click', () => {
                cardWrapper.classList.toggle('flipped');
                speakRussianText(slide.vocab[vocabIndex].cyr);
            });

            // Add navigation arrows beneath the card
            const navRow = document.createElement('div');
            navRow.style.display = 'flex';
            navRow.style.justifyContent = 'center';
            navRow.style.gap = '1.5rem';
            navRow.style.marginTop = '1rem';
            navRow.innerHTML = `
                <button class="btn btn-secondary" style="padding: 0.5rem 1rem;"><i data-lucide="chevron-left"></i> Назад</button>
                <button class="btn btn-secondary" style="padding: 0.5rem 1rem;">Далее <i data-lucide="chevron-right"></i></button>
            `;

            const btns = navRow.querySelectorAll('button');
            
            // Prev Card
            btns[0].addEventListener('click', (e) => {
                e.stopPropagation();
                vocabIndex--;
                if (vocabIndex < 0) vocabIndex = slide.vocab.length - 1;
                updateCardContent();
            });

            // Next Card
            btns[1].addEventListener('click', (e) => {
                e.stopPropagation();
                vocabIndex++;
                if (vocabIndex >= slide.vocab.length) vocabIndex = 0;
                updateCardContent();
            });

            function updateCardContent() {
                cardWrapper.classList.remove('flipped');
                setTimeout(() => {
                    const item = slide.vocab[vocabIndex];
                    cardWrapper.querySelector('.vocab-emoji').innerHTML = `<i data-lucide="${item.icon}" style="width: 4rem; height: 4rem; color: var(--primary);"></i>`;
                    cardWrapper.querySelector('.vocab-word-ru').textContent = item.cyr;
                    cardWrapper.querySelector('.vocab-word-pron').textContent = item.pron;
                    cardWrapper.querySelector('.vocab-card-back .vocab-word-en').textContent = item.en;
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }, 150);
            }

            slideContainer.appendChild(cardWrapper);
            slideContainer.appendChild(navRow);
            
            if (lessonActionBtn) lessonActionBtn.textContent = 'Продолжить';
            isSlideChecked = true;

        } else if (slide.type === 'quiz_choice') {
            // Render standard quiz multi choice
            const list = document.createElement('div');
            list.className = 'lesson-quiz-options';

            let selectedIdx = -1;

            slide.options.forEach((opt, idx) => {
                const optBtn = document.createElement('button');
                optBtn.className = 'quiz-option-btn';
                optBtn.innerHTML = `
                    <span>${opt}</span>
                    <span class="quiz-index">${String.fromCharCode(65 + idx)}</span>
                `;

                optBtn.addEventListener('click', () => {
                    list.querySelectorAll('.quiz-option-btn').forEach(x => x.classList.remove('selected'));
                    optBtn.classList.add('selected');
                    selectedIdx = idx;
                });

                list.appendChild(optBtn);
            });

            slideContainer.appendChild(list);

            // Action checking function
            window.checkQuizChoice = function() {
                if (selectedIdx === -1) {
                    alert('Выберите один из вариантов ответа!');
                    return false;
                }
                
                isSlideChecked = true;
                if (selectedIdx === slide.correctIdx) {
                    isSlideCorrect = true;
                    userScore += 10;
                    if (lessonXpCounter) lessonXpCounter.textContent = userScore;
                } else {
                    isSlideCorrect = false;
                }
                return true;
            };

        } else if (slide.type === 'constructor') {
            // Render word scrambled constructor chips
            const constructorArea = document.createElement('div');
            constructorArea.className = 'sentence-builder-workspace';

            const answerContainer = document.createElement('div');
            answerContainer.className = 'sentence-answer-slots';
            constructorArea.appendChild(answerContainer);

            const scrambledContainer = document.createElement('div');
            scrambledContainer.className = 'sentence-scrambled-chips';
            constructorArea.appendChild(scrambledContainer);

            let selectedWords = [];

            function renderChips() {
                scrambledContainer.innerHTML = '';
                slide.scrambled.forEach((word, idx) => {
                    const chip = document.createElement('button');
                    chip.className = 'word-chip';
                    chip.textContent = word;

                    // If already selected, grey it out
                    const isUsed = selectedWords.includes(word);
                    if (isUsed) {
                        chip.classList.add('selected');
                    }

                    chip.addEventListener('click', () => {
                        if (!isUsed) {
                            selectedWords.push(word);
                            speakRussianText(word);
                            renderAnswer();
                            renderChips();
                        }
                    });

                    scrambledContainer.appendChild(chip);
                });
            }

            function renderAnswer() {
                answerContainer.innerHTML = '';
                selectedWords.forEach((word, idx) => {
                    const chip = document.createElement('button');
                    chip.className = 'word-chip';
                    chip.textContent = word;

                    chip.addEventListener('click', () => {
                        selectedWords.splice(idx, 1);
                        renderAnswer();
                        renderChips();
                    });

                    answerContainer.appendChild(chip);
                });
            }

            renderChips();
            slideContainer.appendChild(constructorArea);

            // Checking function
            window.checkConstructor = function() {
                if (selectedWords.length === 0) {
                    alert('Соберите фразу, нажимая на карточки слов!');
                    return false;
                }

                isSlideChecked = true;
                // Match order arrays lengths and contents
                let isMatch = selectedWords.length === slide.correctOrder.length;
                if (isMatch) {
                    for (let i = 0; i < selectedWords.length; i++) {
                        if (selectedWords[i] !== slide.correctOrder[i]) {
                            isMatch = false;
                            break;
                        }
                    }
                }

                if (isMatch) {
                    isSlideCorrect = true;
                    userScore += 15;
                    if (lessonXpCounter) lessonXpCounter.textContent = userScore;
                } else {
                    isSlideCorrect = false;
                }
                return true;
            };
        }

        lessonPlayerBody.appendChild(slideContainer);

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // Handles Checking the active question or going to next
    if (lessonActionBtn) {
        lessonActionBtn.addEventListener('click', () => {
            if (!activeLesson) {
                // At the end screen, close
                if (lessonOverlay) lessonOverlay.style.display = 'none';
                return;
            }
            const slide = activeLesson.slides[currentSlideIdx];
            if (!slide) {
                // At the end screen, close
                if (lessonOverlay) lessonOverlay.style.display = 'none';
                return;
            }

            if (!isSlideChecked) {
                // Call check method depending on slide type
                let validationSuccess = true;
                if (slide.type === 'quiz_choice') {
                    validationSuccess = window.checkQuizChoice();
                } else if (slide.type === 'constructor') {
                    validationSuccess = window.checkConstructor();
                }

                if (!validationSuccess) return; // Prevent action if nothing selected

                // Render check feedback banner
                if (isSlideCorrect) {
                    lessonFooter.classList.add('correct-active');
                    lessonFeedback.className = 'lesson-feedback feedback-correct';
                    lessonFeedback.innerHTML = `✓ <strong>Верно!</strong> Прекрасная работа.`;
                } else {
                    lessonFooter.classList.add('wrong-active');
                    lessonFeedback.className = 'lesson-feedback feedback-wrong';
                    
                    let correctStr = "";
                    if (slide.type === 'quiz_choice') {
                        correctStr = slide.options[slide.correctIdx];
                    } else if (slide.type === 'constructor') {
                        correctStr = slide.correctOrder.join(' ');
                    }
                    lessonFeedback.innerHTML = `✕ <strong>Неправильно.</strong> Правильно: "${correctStr}"`;
                }

                lessonActionBtn.textContent = 'Далее';
            } else {
                // Go next slide
                currentSlideIdx++;
                loadLessonSlide();
            }
        });
    }

    function showVictoryScreen() {
        if (lessonProgressBar) lessonProgressBar.style.width = '100%';
        if (lessonFeedback) lessonFeedback.innerHTML = '';
        if (lessonFooter) {
            lessonFooter.className = 'lesson-player-footer';
        }

        lessonPlayerBody.innerHTML = `
            <div class="lesson-victory-card">
                <div class="victory-trophy"><i data-lucide="trophy" style="width: 4rem; height: 4rem; color: var(--warning);"></i></div>
                <h3 class="victory-title">Урок завершен!</h3>
                <p class="victory-desc">Вы успешно усвоили тему: "${activeLesson.title}"</p>
                <div class="victory-rewards-row">
                    <div class="reward-pill-big">
                        <i data-lucide="award" style="color: var(--primary);"></i>
                        <span class="reward-val text-primary">+${activeLesson.xpReward}</span>
                        <span class="reward-lbl">Опыт XP</span>
                    </div>
                    <div class="reward-pill-big">
                        <i data-lucide="zap" style="color: var(--warning);"></i>
                        <span class="reward-val text-warning">+${activeLesson.gemsReward}</span>
                        <span class="reward-lbl">Кристаллы</span>
                    </div>
                </div>
            </div>
        `;

        if (lessonActionBtn) {
            lessonActionBtn.textContent = 'Завершить';
            lessonActionBtn.disabled = false;
        }

        // Apply XP and completed status to state
        state.xp += activeLesson.xpReward;
        state.gems += activeLesson.gemsReward;

        // Record Completed Levels
        if (!state.lessonsCompleted) state.lessonsCompleted = [];
        if (!state.lessonsCompleted.includes(activeLessonId)) {
            state.lessonsCompleted.push(activeLessonId);
        }

        // Update weekly activity chart Mon-Sun (use current day)
        const today = new Date().getDay(); // 0 is Sun, 1-6 Mon-Sat
        const mappedDayIdx = today === 0 ? 6 : today - 1; // Map to 0-6 (Mon-Sun)
        state.weeklyProgress[mappedDayIdx] += activeLesson.xpReward;

        saveState();
        renderAppPath();
        renderLeaderboard();
        renderAchievements();
        renderProfileTracker();

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        // Action click closes
        activeLesson = null;
        activeLessonId = null;
    }


    /* ---------------------------------------------------
     * COMPETITIVE LEADERBOARD LEAGUE ENGINE
     * --------------------------------------------------- */
    /* ---------------------------------------------------
     * COMPETITIVE LEADERBOARD LEAGUE ENGINE
     * --------------------------------------------------- */
    function getFlagSVG(countryCode) {
        const flags = {
            RU: `<svg class="flag-svg" viewBox="0 0 3 2" width="18" height="12" style="display: inline-block; vertical-align: middle; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); margin-left: 0.5rem;"><rect width="3" height="2" fill="#fff"/><rect width="3" height="1.333" fill="#0039a6" y="0.667"/><rect width="3" height="0.667" fill="#d52b1e" y="1.333"/></svg>`,
            US: `<svg class="flag-svg" viewBox="0 0 19 10" width="18" height="10" style="display: inline-block; vertical-align: middle; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); margin-left: 0.5rem;"><rect width="19" height="10" fill="#b22234"/><path d="M0,0H19V0.77H0z M0,1.54H19V2.31H0z M0,3.08H19V3.85H0z M0,4.62H19V5.39H0z M0,6.15H19V6.92H0z M0,7.69H19V8.46H0z M0,9.23H19V10H0z" fill="#fff"/><rect width="7.6" height="5.38" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.2" cy="0.8" r="0.2"/><circle cx="2.5" cy="0.8" r="0.2"/><circle cx="3.8" cy="0.8" r="0.2"/><circle cx="5.1" cy="0.8" r="0.2"/><circle cx="6.4" cy="0.8" r="0.2"/><circle cx="1.8" cy="1.6" r="0.2"/><circle cx="3.1" cy="1.6" r="0.2"/><circle cx="4.4" cy="1.6" r="0.2"/><circle cx="5.7" cy="1.6" r="0.2"/><circle cx="1.2" cy="2.4" r="0.2"/><circle cx="2.5" cy="2.4" r="0.2"/><circle cx="3.8" cy="2.4" r="0.2"/><circle cx="5.1" cy="2.4" r="0.2"/><circle cx="6.4" cy="2.4" r="0.2"/><circle cx="1.8" cy="3.2" r="0.2"/><circle cx="3.1" cy="3.2" r="0.2"/><circle cx="4.4" cy="3.2" r="0.2"/><circle cx="5.7" cy="3.2" r="0.2"/><circle cx="1.2" cy="4.0" r="0.2"/><circle cx="2.5" cy="4.0" r="0.2"/><circle cx="3.8" cy="4.0" r="0.2"/><circle cx="5.1" cy="4.0" r="0.2"/><circle cx="6.4" cy="4.0" r="0.2"/><circle cx="1.8" cy="4.8" r="0.2"/><circle cx="3.1" cy="4.8" r="0.2"/><circle cx="4.4" cy="4.8" r="0.2"/><circle cx="5.7" cy="4.8" r="0.2"/></g></svg>`,
            JP: `<svg class="flag-svg" viewBox="0 0 3 2" width="18" height="12" style="display: inline-block; vertical-align: middle; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); margin-left: 0.5rem;"><rect width="3" height="2" fill="#fff"/><circle cx="1.5" cy="1" r="0.6" fill="#bc002d"/></svg>`,
            DE: `<svg class="flag-svg" viewBox="0 0 5 3" width="18" height="11" style="display: inline-block; vertical-align: middle; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); margin-left: 0.5rem;"><rect width="5" height="3" fill="#000"/><rect width="5" height="2" fill="#dd0000" y="1"/><rect width="5" height="1" fill="#ffce00" y="2"/></svg>`,
            ES: `<svg class="flag-svg" viewBox="0 0 3 2" width="18" height="12" style="display: inline-block; vertical-align: middle; border-radius: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); margin-left: 0.5rem;"><rect width="3" height="2" fill="#aa151b"/><rect width="3" height="1" fill="#f1bf00" y="0.5"/></svg>`,
            USER: `<i data-lucide="user" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-left: 0.5rem; color: var(--primary);"></i>`
        };
        return flags[countryCode] || '';
    }

    const mockCompetitors = [
        { name: 'Юки Танака', country: 'JP', xp: 220, isUser: false },
        { name: 'Джон Доу', country: 'US', xp: 180, isUser: false },
        { name: 'Анна Шмидт', country: 'DE', xp: 130, isUser: false },
        { name: 'Карлос Гомес', country: 'ES', xp: 90, isUser: false },
        { name: 'Мария Петрова', country: 'RU', xp: 45, isUser: false }
    ];

    function renderLeaderboard() {
        const appLeaderboardBody = document.getElementById('appLeaderboardBody');
        if (!appLeaderboardBody) return;

        // Combine user in sorting
        const list = [
            ...mockCompetitors,
            { name: 'Ты (Студент RusGo)', country: 'USER', xp: state.xp, isUser: true }
        ];

        // Sort by XP
        list.sort((a, b) => b.xp - a.xp);

        appLeaderboardBody.innerHTML = '';

        list.forEach((item, idx) => {
            const rank = idx + 1;
            
            let rankClass = 'rank-other';
            if (rank === 1) rankClass = 'rank-1';
            if (rank === 2) rankClass = 'rank-2';
            if (rank === 3) rankClass = 'rank-3';

            // Promote text helper
            let status = 'stable';
            if (rank <= 3) status = 'promotion';

            const statusLabel = {
                promotion: 'Выход в лигу ↑',
                demotion: 'Вылет ↓',
                stable: 'Стабильно'
            };

            const tr = document.createElement('tr');
            if (item.isUser) {
                tr.className = 'user-row';
            }

            tr.innerHTML = `
                <td>
                    <div class="rank-badge ${rankClass}">
                        ${rank <= 3 ? '★' : ''}${rank}
                    </div>
                </td>
                <td>${item.name} ${getFlagSVG(item.country)}</td>
                <td>${item.xp} XP</td>
                <td>
                    <span class="leaderboard-status-badge ${status}">
                        ${statusLabel[status]}
                    </span>
                </td>
            `;

            appLeaderboardBody.appendChild(tr);
        });
    }


    const achievementsList = [
        { id: 'first_step', name: 'Первые шаги', desc: 'Завершите 1 урок в RusGo', target: 1, type: 'lessons', icon: 'award', color: '#FBBF24' },
        { id: 'lessons_10', name: 'Прилежный ученик', desc: 'Завершите 10 уроков в RusGo', target: 10, type: 'lessons', icon: 'book-open', color: '#34D399' },
        { id: 'lessons_30', name: 'Мастер RusGo', desc: 'Завершите все 30 уроков', target: 30, type: 'lessons', icon: 'trophy', color: '#F59E0B' },
        
        { id: 'branch_conversational', name: 'Собеседник', desc: 'Пройдите всю ветку «Разговорный»', target: 10, type: 'branch_conversational', icon: 'messages-square', color: '#60A5FA' },
        { id: 'branch_grammar', name: 'Грамотей', desc: 'Пройдите всю ветку «Грамматика»', target: 10, type: 'branch_grammar', icon: 'book', color: '#A78BFA' },
        { id: 'branch_culture', name: 'Эрудит', desc: 'Пройдите всю ветку «Культура»', target: 10, type: 'branch_culture', icon: 'compass', color: '#F472B6' },

        { id: 'streak_3', name: 'Старт серии', desc: 'Серия занятий 3+ дня подряд', target: 3, type: 'streak', icon: 'zap', color: '#FB923C' },
        { id: 'streak_7', name: 'Стабильность', desc: 'Серия занятий 7+ дней подряд', target: 7, type: 'streak', icon: 'flame', color: '#EF4444' },
        { id: 'streak_15', name: 'Неудержимый', desc: 'Серия занятий 15+ дней подряд', target: 15, type: 'streak', icon: 'shield', color: '#DC2626' },

        { id: 'gems_150', name: 'Копилка', desc: 'Соберите 150+ кристаллов', target: 150, type: 'gems', icon: 'gem', color: '#3B82F6' },
        { id: 'gems_300', name: 'Сокровищница', desc: 'Соберите 300+ кристаллов', target: 300, type: 'gems', icon: 'coins', color: '#FCD34D' },

        { id: 'xp_100', name: 'Отличник', desc: 'Наберите 100 XP на платформе', target: 100, type: 'xp', icon: 'graduation-cap', color: '#8B5CF6' },
        { id: 'xp_500', name: 'Ученый', desc: 'Наберите 500 XP на платформе', target: 500, type: 'xp', icon: 'library', color: '#EC4899' },
        { id: 'xp_1000', name: 'Академик', desc: 'Наберите 1000 XP на платформе', target: 1000, type: 'xp', icon: 'crown', color: '#FBBF24' }
    ];

    function renderAchievements() {
        const appAchievementsGrid = document.getElementById('appAchievementsGrid');
        if (!appAchievementsGrid) return;

        appAchievementsGrid.innerHTML = '';

        achievementsList.forEach(ach => {
            // Calculate progress based on state values
            let val = 0;
            if (ach.type === 'lessons') val = (state.lessonsCompleted || []).length;
            if (ach.type === 'streak') val = state.streak;
            if (ach.type === 'gems') val = state.gems;
            if (ach.type === 'xp') val = state.xp;
            
            if (ach.type === 'branch_conversational') {
                val = (state.lessonsCompleted || []).filter(id => id >= 101 && id <= 110).length;
            }
            if (ach.type === 'branch_grammar') {
                val = (state.lessonsCompleted || []).filter(id => id >= 201 && id <= 210).length;
            }
            if (ach.type === 'branch_culture') {
                val = (state.lessonsCompleted || []).filter(id => id >= 301 && id <= 310).length;
            }

            const isUnlocked = val >= ach.target;
            const progressPercent = Math.min((val / ach.target) * 100, 100);

            const card = document.createElement('div');
            card.className = `achievement-card-box glass ${isUnlocked ? '' : 'locked'}`;

            card.innerHTML = `
                <div class="ach-icon-big"><i data-lucide="${ach.icon}" style="width: 3rem; height: 3rem; color: ${ach.color};"></i></div>
                <div class="ach-name-big">${ach.name}</div>
                <div class="ach-desc-big">${ach.desc}</div>
                <div class="ach-progress-bar-container">
                    <div class="ach-progress-bar-fill" style="width: ${progressPercent}%"></div>
                </div>
                <span class="ach-status-lbl ${isUnlocked ? 'unlocked' : 'progressing'}">
                    ${isUnlocked ? 'Выполнено' : `${val} / ${ach.target}`}
                </span>
            `;

            appAchievementsGrid.appendChild(card);
        });
    }


    /* ---------------------------------------------------
     * USER PROFILE stats & resets
     * --------------------------------------------------- */
    const appResetBtn = document.getElementById('appResetBtn');
    
    function renderProfileTracker() {
        const tracker = document.getElementById('appTrackerBars');
        if (!tracker) return;

        tracker.innerHTML = '';

        const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
        
        days.forEach((day, idx) => {
            const xpVal = state.weeklyProgress[idx] || 0;
            // Let's set max visual height representing 50 XP
            let heightPercent = Math.min((xpVal / 50) * 100, 100);

            const today = new Date().getDay();
            const mappedToday = today === 0 ? 6 : today - 1;
            const isToday = idx === mappedToday;

            const col = document.createElement('div');
            col.className = 'tracker-bar-col';
            col.innerHTML = `
                <div class="tracker-bar-track" title="${xpVal} XP">
                    <div class="tracker-bar-fill ${isToday ? 'active' : ''}" style="height: ${heightPercent}%"></div>
                </div>
                <span>${day}</span>
            `;
            tracker.appendChild(col);
        });
    }

    if (appResetBtn) {
        appResetBtn.addEventListener('click', async () => {
            if (confirm('Вы уверены, что хотите сбросить все ваши достижения и начать с чистого листа?')) {
                if (isOnlineMode) {
                    try {
                        const res = await fetch(`${API_URL}/api/reset`, {
                            method: 'POST',
                            headers: { ...getAuthHeaders() }
                        });
                        if (res.ok) {
                            const serverState = await res.json();
                            state = serverState;
                        }
                    } catch (e) {
                        console.error('Reset error:', e);
                    }
                } else {
                    state = { ...DEFAULT_STATE, lessonsCompleted: [], weeklyProgress: [0, 0, 0, 0, 0, 0, 0] };
                }
                localStorage.setItem('rusgo_app_state', JSON.stringify(state));
                updateGlobalMetrics();
                renderAppPath();
                renderLeaderboard();
                renderAchievements();
                renderProfileTracker();
            }
        });
    }


    /* ---------------------------------------------------
     * IMMERSIVE APP CHAT WITH ANNA (TTS Integrated)
     * --------------------------------------------------- */
    const chatData = {
        food: {
            start: {
                text: "Привет! Добро пожаловать в ресторан «Теремок». Что бы вы хотели заказать?",
                options: [
                    { text: "Здравствуйте! Я хочу заказать борщ и блины.", next: "borsch" },
                    { text: "Здравствуйте! Дайте мне меню, пожалуйста.", next: "menu" }
                ]
            },
            borsch: {
                text: "Отличный выбор! Борщ подается со сметаной. А какие блины вы предпочитаете: с мёдом или со сгущёнкой?",
                options: [
                    { text: "Давайте со сметаной и блины с мёдом.", next: "honey" },
                    { text: "А есть блины с красной икрой?", next: "caviar" }
                ]
            },
            menu: {
                text: "Конечно, вот наше меню. Сегодня рекомендуем фирменный борщ и сладкие блины. Что закажем?",
                options: [
                    { text: "Я буду грибной суп и чай, пожалуйста.", next: "soup" },
                    { text: "Давайте тогда борщ и блины со сгущёнкой.", next: "honey" }
                ]
            },
            honey: {
                text: "Записала. Борщ и блины. Что будете пить? Есть чай, кофе и квас.",
                options: [
                    { text: "Черный чай без сахара, пожалуйста.", next: "end_success" },
                    { text: "Квас, если он холодный.", next: "end_success" }
                ]
            },
            caviar: {
                text: "Да, блины с красной икрой — наш деликатес! Из напитков что-нибудь принести?",
                options: [
                    { text: "Да, обычную воду без газа.", next: "end_success" },
                    { text: "Квас, пожалуйста.", next: "end_success" }
                ]
            },
            soup: {
                text: "Грибной суп и чай. Превосходно. Сахар к чаю нужен?",
                options: [
                    { text: "Нет, спасибо, без сахара.", next: "end_success" },
                    { text: "Да, положите две ложки.", next: "end_success" }
                ]
            },
            end_success: {
                text: "Отлично, ваш заказ принят! Вы превосходно изъясняетесь на русском. Еда будет готова через 10 минут!\n\n*(Получено достижение: «Гурман» +20 XP)*",
                options: []
            }
        },
        shopping: {
            start: {
                text: "Здравствуйте! Рада видеть вас в RusGo Boutique. Ищете что-то конкретное?",
                options: [
                    { text: "Да, я ищу тёплый свитер на зиму.", next: "sweater" },
                    { text: "Нет, спасибо, я просто смотрю.", next: "browsing" }
                ]
            },
            sweater: {
                text: "У нас прекрасная новая коллекция шерстяных свитеров! Какой размер вы носите?",
                options: [
                    { text: "Я ношу размер M (средний).", next: "color" },
                    { text: "Размер L. У вас есть оверсайз модели?", next: "oversize" }
                ]
            },
            browsing: {
                text: "Конечно, располагайтесь! Если вам понравится какая-то вещь или понадобится другой размер, дайте знать.",
                options: [
                    { text: "Хорошо. А где у вас висят куртки?", next: "jackets" },
                    { text: "Спасибо, я позову, если что.", next: "end_shop" }
                ]
            },
            color: {
                text: "Отлично, размер М. Есть классический серый и яркий изумрудно-зеленый (в цвет логотипа RusGo!). Какой принести в примерочную?",
                options: [
                    { text: "Зеленый, пожалуйста! Это мой любимый цвет.", next: "try_on" },
                    { text: "Давайте примерим серый свитер.", next: "try_on" }
                ]
            },
            oversize: {
                text: "Да, оверсайз свитера сейчас очень популярны. Есть отличная модель бежевого цвета размера L. Хотите примерить?",
                options: [
                    { text: "Да, с удовольствием. Где примерочные?", next: "try_on" },
                    { text: "Пожалуй, нет. Посмотрю еще куртки.", next: "jackets" }
                ]
            },
            jackets: {
                text: "Куртки и пальто находятся в конце зала справа. Там сейчас действуют скидки до 30%!",
                options: [
                    { text: "Отлично, пойду посмотрю свитера и куртки.", next: "try_on" }
                ]
            },
            try_on: {
                text: "Примерочные кабины находятся прямо по коридору и налево. Примеряйте, я подожду здесь!",
                options: [
                    { text: "Мне всё подошло! Я беру этот свитер.", next: "end_buy" },
                    { text: "К сожалению, размер маловат. Есть на размер больше?", next: "wrong_size" }
                ]
            },
            wrong_size: {
                text: "Без проблем! Сейчас принесу вам размер побольше. Подождите одну минуту.",
                options: [
                    { text: "Спасибо, буду ждать.", next: "end_buy" }
                ]
            },
            end_buy: {
                text: "Прекрасный выбор! Ждем вас снова в нашем магазине. У вас замечательный разговорный русский!\n\n*(Получено достижение: «Шопоголик» +15 XP)*",
                options: []
            },
            end_shop: {
                text: "Хорошего дня! Приходите к нам ещё.",
                options: []
            }
        },
        travel: {
            start: {
                text: "Здравствуйте! Это стойка регистрации авиакомпании RusGo. Куда вы летите сегодня?",
                options: [
                    { text: "Здравствуйте! Я лечу в Санкт-Петербург.", next: "spb" },
                    { text: "Привет! А где здесь стойка сдачи багажа?", next: "luggage" }
                ]
            },
            spb: {
                text: "Санкт-Петербург — прекрасный выбор! Невероятная архитектура. Предъявите ваш паспорт и билет, пожалуйста.",
                options: [
                    { text: "Вот мой паспорт и электронный билет.", next: "check" },
                    { text: "Ой, кажется, я забыл паспорт...", next: "forgot" }
                ]
            },
            luggage: {
                text: "Сдать багаж вы можете прямо здесь, если вы уже прошли онлайн-регистрацию. Куда оформляем билет?",
                options: [
                    { text: "В Москву, пожалуйста.", next: "spb" },
                    { text: "В Санкт-Петербург.", next: "spb" }
                ]
            },
            check: {
                text: "Спасибо. Паспорт проверен. Вы будете сдавать багаж или у вас только ручная кладь?",
                options: [
                    { text: "Я сдаю этот большой чемодан.", next: "weight" },
                    { text: "Только ручная кладь (рюкзак).", next: "hand_luggage" }
                ]
            },
            forgot: {
                text: "Ох, без паспорта мы не сможем зарегистрировать вас на рейс. Проверьте сумку ещё раз тщательно, возможно он там?",
                options: [
                    { text: "А, вот же он! Лежал в боковом кармане!", next: "check" }
                ]
            },
            weight: {
                text: "Поставьте чемодан на ленту весов, пожалуйста. Так, вес 18 кг — всё в пределах нормы. Какое место в самолете предпочитаете: у окна или у прохода?",
                options: [
                    { text: "У окна, хочу смотреть на облака.", next: "seat" },
                    { text: "У прохода, чтобы было удобнее вставать.", next: "seat" }
                ]
            },
            hand_luggage: {
                text: "Отлично, рюкзак проходит по габаритам. Место в салоне у окна или у прохода?",
                options: [
                    { text: "У окна, пожалуйста.", next: "seat" },
                    { text: "У прохода, спасибо.", next: "seat" }
                ]
            },
            seat: {
                text: "Ваше место 14A (у окна). Вот ваш посадочный талон и багажная бирка. Посадка начнется у выхода №8 в 10:15. Приятного полета!",
                options: [
                    { text: "Спасибо огромное за помощь! Всего доброго.", next: "end_travel" }
                ]
            },
            end_travel: {
                text: "Счастливого пути! Вы отлично говорите по-русски, у вас точно не возникнет сложностей в путешествии!\n\n*(Получено достижение: «Путешественник» +25 XP)*",
                options: []
            }
        },
        interview: {
            start: {
                text: "Здравствуйте! Я HR-директор RusGo. Рада видеть вас на собеседовании. Расскажите немного о себе.",
                options: [
                    { text: "Здравствуйте! Я разработчик интерфейсов, хочу создавать крутой EdTech.", next: "dev" },
                    { text: "Здравствуйте. Я маркетолог, помогаю стартапам расти.", next: "marketing" }
                ]
            },
            dev: {
                text: "Отлично! Нам как раз нужны инженеры во фронтенд-команду. Каким технологическим стеком вы владеете?",
                options: [
                    { text: "Я уверенно пишу на JavaScript, React, CSS и знаю основы UX.", next: "tech_ok" },
                    { text: "В основном Node.js и базы данных, но могу и верстать.", next: "backend" }
                ]
            },
            marketing: {
                text: "Интересно. Маркетинг в EdTech имеет свою специфику. Какие каналы привлечения трафика вы считаете наиболее эффективными?",
                options: [
                    { text: "Контент-маркетинг, инфлюенсеры в TikTok/YouTube и ASO приложения.", next: "mark_ok" },
                    { text: "Таргетированную рекламу и имейл-рассылки.", next: "mark_ok" }
                ]
            },
            tech_ok: {
                text: "Прекрасно, это совпадает с нашими технологиями. Мы ценим чистоту кода и внимание к микро-анимациям. Готовы ли вы сделать небольшое тестовое задание?",
                options: [
                    { text: "Да, конечно. Я готов выполнить его в ближайшие дни.", next: "job_offer" },
                    { text: "Смотря какое задание. У меня мало свободного времени.", next: "negotiate" }
                ]
            },
            backend: {
                text: "Понятно, универсальные специалисты — это здорово. Но сейчас мы ищем именно сильного фронтендера. Готовы ли вы подтянуть визуальную часть ради работы у нас?",
                options: [
                    { text: "Да, я с удовольствием изучу тонкости CSS и анимаций.", next: "tech_ok" }
                ]
            },
            mark_ok: {
                text: "Хороший аналитический подход. Мы действительно делаем ставку на вирусный маркетинг и блогеров. Какой бюджет вам потребуется на первый тестовый месяц?",
                options: [
                    { text: "Думаю, около $3000 для тестирования креативов.", next: "job_offer" },
                    { text: "Надо сначала провести глубокий аудит конкурентов.", next: "job_offer" }
                ]
            },
            negotiate: {
                text: "Мы понимаем вашу занятость, поэтому наше задание займет не более 3 часов. Нам важно увидеть ваш стиль написания кода.",
                options: [
                    { text: "Хорошо, присылайте задание. Я сделаю.", next: "job_offer" }
                ]
            },
            job_offer: {
                text: "Договорились! Я отправлю вам детали на почту. Большое спасибо за беседу. Вы отлично излагаете свои мысли на русском языке! До связи.",
                options: [
                    { text: "Спасибо! Буду ждать вашего письма. До свидания.", next: "end_job" }
                ]
            },
            end_job: {
                text: "Собеседование успешно пройдено! Вы проявили высокий уровень навыков общения. Удачи!\n\n*(Получено достижение: «Профи» +30 XP)*",
                options: []
            }
        }
    };

    let currentTopic = 'food';
    let currentStep = 'start';

    /* ---------------------------------------------------
     * IMMERSIVE APP CHAT WITH ANNA (TTS Integrated)
     * --------------------------------------------------- */
    const appChatBody = document.getElementById('appChatBody');
    const appQuickReplies = document.getElementById('appQuickReplies');
    const appTypingIndicator = document.getElementById('appTypingIndicator');
    const appScenariosList = document.getElementById('appScenariosList');
    const ttsToggleApp = document.getElementById('ttsToggleApp');

    const appScenarios = [
        { id: 'food', name: 'Заказ еды', icon: 'utensils' },
        { id: 'shopping', name: 'Покупки', icon: 'shopping-bag' },
        { id: 'travel', name: 'Путешествия', icon: 'plane' },
        { id: 'interview', name: 'Собеседование', icon: 'briefcase' }
    ];

    if (appScenariosList) {
        appScenariosList.innerHTML = '';
        appScenarios.forEach(sc => {
            const btn = document.createElement('button');
            btn.className = `scenario-card-btn ${sc.id === 'food' ? 'active' : ''}`;
            btn.setAttribute('data-app-scenario', sc.id);
            btn.innerHTML = `<i data-lucide="${sc.icon}" class="scenario-icon" style="width: 18px; height: 18px; margin-right: 8px; vertical-align: middle;"></i><span>${sc.name}</span>`;

            btn.addEventListener('click', () => {
                appScenariosList.querySelectorAll('.scenario-card-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                resetAppChat(sc.id);
            });
            appScenariosList.appendChild(btn);
        });
    }

    // Toggle Voice Output Synthesizer
    if (ttsToggleApp) {
        ttsToggleApp.addEventListener('click', () => {
            state.ttsEnabled = !state.ttsEnabled;
            saveState();
            ttsToggleApp.classList.toggle('active', state.ttsEnabled);
        });
    }

    function appendAppMessage(text, sender, isCorrection = false, correctText = "") {
        if (!appChatBody) return;

        const msg = document.createElement('div');
        msg.className = `message ${sender}`;
        msg.innerHTML = `<div class="message-text">${text.replace(/\n/g, '<br>')}</div>`;

        if (isCorrection) {
            const correction = document.createElement('div');
            correction.className = 'correction-box';
            correction.innerHTML = `<i data-lucide="info" size="14"></i> <span>Совет ИИ: Рекомендуется <strong>"${correctText}"</strong></span>`;
            msg.appendChild(correction);
        }

        appChatBody.appendChild(msg);
        appChatBody.scrollTop = appChatBody.scrollHeight;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    let appChatHistory = [];

    const systemPrompts = {
        food: "You are Anna, a friendly Russian waiter at the restaurant 'Теремок'. Speak only Russian. Keep responses simple and short (1-3 sentences). Always respond in json format with fields: 'reply' (your response in Russian), 'has_mistake' (true if user made any grammatical, spelling, or punctuation error in Russian, false otherwise), and 'correction' (the user's message corrected in Russian, or empty string if correct).",
        shopping: "You are Anna, a friendly assistant in a Russian clothing shop in Moscow. Speak only Russian. Keep responses simple and short (1-3 sentences). Always respond in json format with fields: 'reply' (your response in Russian), 'has_mistake' (true if user made any grammatical, spelling, or punctuation error in Russian, false otherwise), and 'correction' (the user's message corrected in Russian, or empty string if correct).",
        travel: "You are Anna, a friendly passport control officer at Sheremetyevo Airport. Speak only Russian. Keep responses simple and short (1-3 sentences). Always respond in json format with fields: 'reply' (your response in Russian), 'has_mistake' (true if user made any grammatical, spelling, or punctuation error in Russian, false otherwise), and 'correction' (the user's message corrected in Russian, or empty string if correct).",
        interview: "You are Anna, a friendly HR specialist interviewing the candidate for a Frontend Developer role. Speak only Russian. Keep responses simple and short (1-3 sentences). Always respond in json format with fields: 'reply' (your response in Russian), 'has_mistake' (true if user made any grammatical, spelling, or punctuation error in Russian, false otherwise), and 'correction' (the user's message corrected in Russian, or empty string if correct)."
    };

    const starterData = {
        food: {
            text: "Привет! Добро пожаловать в ресторан «Теремок». Что бы вы хотели сегодня заказать?",
            options: [
                "Здравствуйте! Я хочу заказать борщ и блины.",
                "Здравствуйте! Дайте мне меню, пожалуйста."
            ]
        },
        shopping: {
            text: "Здравствуйте! Чем я могу помочь вам сегодня в нашем магазине? Ищете что-то конкретное?",
            options: [
                "Привет! Я ищу теплую куртку.",
                "Здравствуйте, я просто смотрю."
            ]
        },
        travel: {
            text: "Добрый день! Рада приветствовать вас в аэропорту. Куда вы сегодня летите? Приготовьте ваш паспорт.",
            options: [
                "Добрый день! Я лечу в Санкт-Петербург. Вот мой паспорт.",
                "Привет! А где стойка регистрации на рейс 102?"
            ]
        },
        interview: {
            text: "Здравствуйте! Спасибо, что пришли на собеседование. Расскажите немного о себе и вашем опете работы с веб-технологиями?",
            options: [
                "Здравствуйте! Я разрабатываю интерфейсы на JavaScript и React.",
                "Привет! Мой опыт работы программистом — два года."
            ]
        }
    };

    function senderVoiceActive() {
        return state.ttsEnabled;
    }

    async function sendAppUserMessage(text) {
        if (!text.trim()) return;
        appendAppMessage(text, 'user');
        appChatHistory.push({ role: "user", content: text });

        // Show typing indicator
        if (appTypingIndicator) appTypingIndicator.style.display = 'flex';
        if (appChatBody) appChatBody.scrollTop = appChatBody.scrollHeight;

        // Clear quick replies
        if (appQuickReplies) appQuickReplies.innerHTML = '';

        const url = `${API_URL}/api/chat`;

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    messages: appChatHistory
                })
            });

            if (!response.ok) throw new Error("Groq API request failed");
            
            const data = await response.json();
            const content = data.choices[0].message.content;
            let result;
            try {
                result = JSON.parse(content);
            } catch(e) {
                result = { reply: content, has_mistake: false, correction: "" };
            }

            if (appTypingIndicator) appTypingIndicator.style.display = 'none';

            appendAppMessage(result.reply, 'tutor', result.has_mistake, result.correction);
            appChatHistory.push({ role: "assistant", content: content });

            if (senderVoiceActive()) {
                speakRussianText(result.reply);
            }

            // Offer a reset chat option in helper chips
            renderResetChip();

        } catch (error) {
            console.error("Chat with Anna error:", error);
            if (appTypingIndicator) appTypingIndicator.style.display = 'none';
            appendAppMessage("Извините, возникла проблема с подключением к ИИ-наставнику. Пожалуйста, проверьте интернет или попробуйте позже.", 'tutor');
            renderResetChip();
        }
    }

    function renderResetChip() {
        if (!appQuickReplies) return;
        appQuickReplies.innerHTML = '';
        const restartBtn = document.createElement('button');
        restartBtn.className = 'reply-chip';
        restartBtn.innerHTML = '🔄 Начать сначала';
        restartBtn.addEventListener('click', () => {
            resetAppChat(currentTopic);
        });
        appQuickReplies.appendChild(restartBtn);
    }

    function resetAppChat(topic) {
        currentTopic = topic;
        if (appChatBody) appChatBody.innerHTML = '';
        if (appQuickReplies) appQuickReplies.innerHTML = '';

        const systemPrompt = systemPrompts[topic] || systemPrompts.food;
        const starter = starterData[topic] || starterData.food;

        // Initialize history
        appChatHistory = [
            { role: "system", content: systemPrompt },
            { role: "assistant", content: JSON.stringify({ reply: starter.text, has_mistake: false, correction: "" }) }
        ];

        // Append initial message
        appendAppMessage(starter.text, 'tutor');

        // Play initial message speech if TTS enabled
        if (senderVoiceActive()) {
            speakRussianText(starter.text);
        }

        // Render initial helper chips
        starter.options.forEach(optText => {
            const btn = document.createElement('button');
            btn.className = 'reply-chip';
            btn.textContent = optText;
            btn.addEventListener('click', () => {
                sendAppUserMessage(optText);
            });
            appQuickReplies.appendChild(btn);
        });
    }

    // Bind custom text input event listeners
    const appChatInput = document.getElementById('appChatInput');
    const appSendChatBtn = document.getElementById('appSendChatBtn');

    if (appSendChatBtn && appChatInput) {
        const handleSend = () => {
            const text = appChatInput.value;
            if (text.trim()) {
                sendAppUserMessage(text);
                appChatInput.value = '';
            }
        };

        appSendChatBtn.addEventListener('click', handleSend);
        appChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSend();
            }
        });
    }


    /* ---------------------------------------------------
     * LANDING PAGE CAROUSEL & ACCORDION (Fallback UI logic)
     * --------------------------------------------------- */
    const landingChatBody = document.getElementById('chatBody');
    const landingQuickReplies = document.getElementById('quickReplies');
    const landingTypingIndicator = document.getElementById('typingIndicator');
    const landingTopicBtns = document.querySelectorAll('.topic-btn');

    let landingTopic = 'food';
    let landingStep = 'start';

    function appendLandingMessage(text, sender, isCorrection = false, correctText = "") {
        if (!landingChatBody) return;
        const msg = document.createElement('div');
        msg.className = `message ${sender}`;
        msg.innerHTML = `<div class="message-text">${text}</div>`;

        if (isCorrection) {
            const correction = document.createElement('div');
            correction.className = 'correction-box';
            correction.innerHTML = `<i data-lucide="info" size="14"></i> <span>Совет ИИ: Рекомендуется <strong>"${correctText}"</strong></span>`;
            msg.appendChild(correction);
        }

        landingChatBody.appendChild(msg);
        landingChatBody.scrollTop = landingChatBody.scrollHeight;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    function loadLandingStep(stepKey) {
        landingStep = stepKey;
        const stepData = chatData[landingTopic][stepKey];
        if (!stepData) return;

        landingQuickReplies.innerHTML = '';
        landingTypingIndicator.style.display = 'flex';
        landingChatBody.scrollTop = landingChatBody.scrollHeight;

        setTimeout(() => {
            landingTypingIndicator.style.display = 'none';

            let isCorrection = false;
            let correctText = "";
            if (landingTopic === 'food' && stepKey === 'borsch') {
                isCorrection = true;
                correctText = "Я хочу заказать борщ";
            }

            appendLandingMessage(stepData.text, 'tutor', isCorrection, correctText);

            if (stepData.options && stepData.options.length > 0) {
                stepData.options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'reply-chip';
                    btn.textContent = opt.text;
                    btn.addEventListener('click', () => {
                        appendLandingMessage(opt.text, 'user');
                        loadLandingStep(opt.next);
                    });
                    landingQuickReplies.appendChild(btn);
                });
            } else {
                const restartBtn = document.createElement('button');
                restartBtn.className = 'reply-chip';
                restartBtn.innerHTML = '🔄 Начать сначала';
                restartBtn.addEventListener('click', () => {
                    resetLandingChat(landingTopic);
                });
                landingQuickReplies.appendChild(restartBtn);
            }
        }, 1100);
    }

    function resetLandingChat(topic) {
        landingTopic = topic;
        if (landingChatBody) landingChatBody.innerHTML = '';
        loadLandingStep('start');
    }

    landingTopicBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            landingTopicBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            resetLandingChat(btn.getAttribute('data-topic'));
        });
    });

    resetLandingChat('food');


    /* ---------------------------------------------------
     * Testimonials Slider logic (Landing page)
     * --------------------------------------------------- */
    const testimonialsSlider = document.getElementById('testimonialsSlider');
    const prevSlide = document.getElementById('prevSlide');
    const nextSlide = document.getElementById('nextSlide');
    const sliderDotsContainer = document.getElementById('sliderDots');
    const testimonialCards = document.querySelectorAll('.testimonial-card');
    
    let currentSlide = 0;
    const slidesCount = testimonialCards.length;

    if (testimonialsSlider && slidesCount > 0) {
        for (let i = 0; i < slidesCount; i++) {
            const dot = document.createElement('div');
            dot.className = `slider-dot ${i === 0 ? 'active' : ''}`;
            dot.addEventListener('click', () => goToSlide(i));
            sliderDotsContainer.appendChild(dot);
        }

        const dots = document.querySelectorAll('.slider-dot');

        function goToSlide(slideIndex) {
            currentSlide = slideIndex;
            if (currentSlide < 0) currentSlide = slidesCount - 1;
            if (currentSlide >= slidesCount) currentSlide = 0;

            testimonialsSlider.style.transform = `translateX(-${currentSlide * 100}%)`;
            
            dots.forEach((dot, idx) => {
                dot.classList.toggle('active', idx === currentSlide);
            });
        }

        prevSlide.addEventListener('click', () => goToSlide(currentSlide - 1));
        nextSlide.addEventListener('click', () => goToSlide(currentSlide + 1));

        let slideTimer = setInterval(() => goToSlide(currentSlide + 1), 6000);

        const resetSlideTimer = () => {
            clearInterval(slideTimer);
            slideTimer = setInterval(() => goToSlide(currentSlide + 1), 6000);
        };

        prevSlide.addEventListener('click', resetSlideTimer);
        nextSlide.addEventListener('click', resetSlideTimer);
    }


    /* ---------------------------------------------------
     * FAQ Accordion Panel Expand/Collapse (Landing)
     * --------------------------------------------------- */
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const trigger = item.querySelector('.faq-trigger');
        const content = item.querySelector('.faq-content');

        trigger.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            faqItems.forEach(i => {
                i.classList.remove('active');
                i.querySelector('.faq-content').style.maxHeight = null;
            });

            if (!isActive) {
                item.classList.add('active');
                content.style.maxHeight = `${content.scrollHeight}px`;
            }
        });
    });


    /* ---------------------------------------------------
     * Stats Count-Up Animation (Landing scroll observer)
     * --------------------------------------------------- */
    const statsNumbers = document.querySelectorAll('.stat-number');
    
    function animateCounters() {
        statsNumbers.forEach(counter => {
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 2000;
            const stepTime = 30;
            const totalSteps = duration / stepTime;
            const increment = target / totalSteps;
            let current = 0;

            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    counter.textContent = target.toLocaleString('ru-RU');
                    clearInterval(timer);
                } else {
                    counter.textContent = Math.floor(current).toLocaleString('ru-RU');
                }
            }, stepTime);
        });
    }

    const statsSection = document.getElementById('stats');
    if (statsSection) {
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounters();
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });
        observer.observe(statsSection);
    }


    // Landing page mobile app mockup switcher
    const appTabs = document.querySelectorAll('.app-tab');
    const appMockupScreen = document.getElementById('appMockupScreen');

    const appScreens = {
        lessons: `
            <div class="app-screen-body">
                <div class="screen-title">Мои уроки</div>
                <div class="lessons-screen-list">
                    <div class="lesson-row-card done">
                        <div class="lesson-row-icon" style="background: rgba(34, 197, 94, 0.2); color: var(--primary);">
                            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                        </div>
                        <div class="lesson-row-info">
                            <strong>1. Алфавит</strong>
                            <span>Пройдено • +25 XP</span>
                        </div>
                    </div>
                    <div class="lesson-row-card done">
                        <div class="lesson-row-icon" style="background: rgba(34, 197, 94, 0.2); color: var(--primary);">
                            <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                        </div>
                        <div class="lesson-row-info">
                            <strong>2. Слова</strong>
                            <span>Пройдено • +30 XP</span>
                        </div>
                    </div>
                    <div class="lesson-row-card active" style="border-color: var(--primary); background: rgba(34, 197, 94, 0.05);">
                        <div class="lesson-row-icon" style="background: var(--primary); color: #070B13;">
                            <i data-lucide="play" style="width: 14px; height: 14px; fill: currentColor;"></i>
                        </div>
                        <div class="lesson-row-info">
                            <strong>3. Фразы</strong>
                            <span style="color: var(--primary);">В процессе • +35 XP</span>
                        </div>
                    </div>
                    <div class="lesson-row-card locked" style="opacity: 0.5;">
                        <div class="lesson-row-icon" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">
                            <i data-lucide="lock" style="width: 14px; height: 14px;"></i>
                        </div>
                        <div class="lesson-row-info">
                            <strong>4. Диалоги</strong>
                            <span>Заблокировано</span>
                        </div>
                    </div>
                </div>
            </div>
        `,
        tasks: `
            <div class="app-screen-body">
                <div class="screen-title">Ежедневные квесты</div>
                <div style="display: flex; flex-direction: column; gap: 4px; flex-grow: 1;">
                    <div class="task-row done">
                        <div class="task-checkbox checked">
                            <i data-lucide="check" style="width: 12px; height: 12px;"></i>
                        </div>
                        <div class="task-text">Завершить 1 урок</div>
                    </div>
                    <div class="task-row done">
                        <div class="task-checkbox checked">
                            <i data-lucide="check" style="width: 12px; height: 12px;"></i>
                        </div>
                        <div class="task-text">Набрать 20 XP сегодня</div>
                    </div>
                    <div class="task-row">
                        <div class="task-checkbox"></div>
                        <div class="task-text">Поговорить с ИИ Анной</div>
                    </div>
                    <div class="task-row">
                        <div class="task-checkbox"></div>
                        <div class="task-text">Повторить 5 слов</div>
                    </div>
                </div>
            </div>
        `,
        achievements: `
            <div class="app-screen-body">
                <div class="screen-title">Достижения</div>
                <div class="badges-grid">
                    <div class="badge-item">
                        <div class="badge-img" style="color: #FBBF24;">
                            <i data-lucide="award" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div class="badge-name">Первые шаги</div>
                        <div class="badge-status" style="color: var(--primary);">Получено</div>
                    </div>
                    <div class="badge-item">
                        <div class="badge-img" style="color: #EF4444;">
                            <i data-lucide="flame" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div class="badge-name">Стабильность</div>
                        <div class="badge-status" style="color: var(--primary);">Получено</div>
                    </div>
                    <div class="badge-item">
                        <div class="badge-img" style="color: #3B82F6;">
                            <i data-lucide="gem" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div class="badge-name">Кладоискатель</div>
                        <div class="badge-status" style="color: var(--warning);">120 / 130</div>
                    </div>
                    <div class="badge-item" style="opacity: 0.5;">
                        <div class="badge-img" style="color: var(--text-muted);">
                            <i data-lucide="lock" style="width: 28px; height: 28px;"></i>
                        </div>
                        <div class="badge-name">Отличник</div>
                        <div class="badge-status">0 / 100 XP</div>
                    </div>
                </div>
            </div>
        `,
        streak: `
            <div class="app-screen-body">
                <div class="screen-title">Серия занятий</div>
                <div class="streak-wrapper">
                    <div class="streak-fire-container">
                        <div class="streak-big-icon" style="color: #EF4444;">
                            <i data-lucide="flame" style="width: 64px; height: 64px; fill: currentColor;"></i>
                        </div>
                    </div>
                    <div class="streak-count-big">7</div>
                    <div class="streak-label-big">Дней подряд!</div>
                    <div class="streak-days-row">
                        <div class="day-bubble active">Пн</div>
                        <div class="day-bubble active">Вт</div>
                        <div class="day-bubble active">Ср</div>
                        <div class="day-bubble active">Чт</div>
                        <div class="day-bubble active">Пт</div>
                        <div class="day-bubble active">Сб</div>
                        <div class="day-bubble active">Вс</div>
                    </div>
                </div>
            </div>
        `
    };

    function renderMockupScreen(tabName) {
        if (!appMockupScreen || !appScreens[tabName]) return;
        appMockupScreen.innerHTML = appScreens[tabName];
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    if (appTabs.length > 0) {
        appTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                appTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-app-tab');
                renderMockupScreen(target);
            });
        });
        // Initial render
        renderMockupScreen('lessons');
    }

    // Load initial user progress state on startup
    loadState();
});
