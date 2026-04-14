// admin_modules/admin-ui.js
// Общие функции для интерфейса админ-панели.

// Показать глобальный лоадер
export function showLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.remove('hidden');
}

// Скрыть глобальный лоадер
export function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('hidden');
}

// Форматирование даты в русский формат
export function formatDate(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('ru-RU');
}

// Форматирование даты и времени
export function formatDateTime(dateString) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Настройка переключения вкладок
export function setupTabs() {
    const tabs = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Убираем активный класс со всех вкладок
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Активируем выбранную вкладку
            tab.classList.add('active');
            const tabId = tab.dataset.tab;
            document.getElementById(tabId + 'Tab')?.classList.add('active');
        });
    });
}

// Показать модальное окно
export function showModal(modalId) {
    document.getElementById(modalId)?.classList.remove('hidden');
}

// Скрыть модальное окно
export function hideModal(modalId) {
    document.getElementById(modalId)?.classList.add('hidden');
}