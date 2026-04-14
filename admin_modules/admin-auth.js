// admin_modules/admin-auth.js
// Проверяет, авторизован ли админ. Если нет — отправляет на страницу входа.

export function checkAdminAuth() {
    const session = localStorage.getItem('adminAuth');
    if (!session) {
        // Не авторизован — уходим на логин
        window.location.href = 'admin_login.html';
        return null;
    }
    
    // Возвращаем данные админа
    return JSON.parse(session);
}

// Получить данные текущего админа
export function getAdminData() {
    const session = localStorage.getItem('adminAuth');
    return session ? JSON.parse(session) : null;
}

// Выйти из админки
export function logoutAdmin() {
    localStorage.removeItem('adminAuth');
    window.location.href = 'admin_login.html';
}