// admin_modules/admin-main.js
// Главный файл админ-панели. Подключает все модули.

import { checkAdminAuth, logoutAdmin } from './admin-auth.js';
import { setupTabs, showLoader, hideLoader } from './admin-ui.js';
import { initTeachersModule } from './admin-teachers.js';
import { initChatsModule } from './admin-chats.js';
import { initSettingsModule } from './admin-settings.js';
import { initStatsModule } from './admin-stats.js';
import { initSalesModule } from './admin-sales.js';

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
(async function() {
    // 1. Проверяем авторизацию
    const admin = checkAdminAuth();
    if (!admin) return;

    // 2. Инициализируем Supabase
    const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

    // 3. Отображаем имя админа
    document.getElementById('adminNameDisplay').textContent = admin.name || 'Админ';
    document.getElementById('adminAvatar').textContent = (admin.name || 'A')[0].toUpperCase();

    // 4. Настраиваем переключение вкладок
    setupTabs();

    // 5. Инициализируем все модули
    initTeachersModule(supabase);
    initChatsModule(supabase);
    initSettingsModule(supabase);
    initStatsModule(supabase);
    initSalesModule(supabase);

    // 6. Кнопка выхода
    document.getElementById('logoutAdminBtn')?.addEventListener('click', logoutAdmin);
    document.getElementById('backToCrmBtn')?.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

})();