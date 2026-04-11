// ==========================================
// SIMPLEED CRM — СТРАНИЦА ВХОДА
// Исправленная версия (без повторного объявления)
// ==========================================

// Проверяем, что конфиг загрузился
if (typeof CONFIG === 'undefined') {
    alert('Ошибка: Файл config.js не найден. Проверьте подключение.');
}

// Создаём клиент Supabase (используем let, чтобы не конфликтовать с глобальным)
const supabaseAuth = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Проверяем, не авторизован ли уже пользователь
async function checkAlreadyLoggedIn() {
    const { data } = await supabaseAuth.auth.getUser();
    if (data.user) {
        // Уже залогинен — сразу в CRM
        window.location.href = 'index.html';
    }
}

// Обработчик формы входа
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const phoneInput = document.getElementById('phone');
        const passwordInput = document.getElementById('password');
        
        // Очищаем номер от лишних символов (оставляем только + и цифры)
        let phone = phoneInput.value.trim().replace(/[^\d+]/g, '');
        const password = passwordInput.value;
        
        // Базовая валидация
        if (!phone || !password) {
            alert('Введите номер телефона и пароль');
            return;
        }
        
        // Показываем индикатор загрузки (опционально)
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Вход...';
        
        console.log('Попытка входа с номером:', phone);
        
        try {
            const { data, error } = await supabaseAuth.auth.signInWithPassword({
                email: phone,      // Supabase ожидает email, но мы храним там номер телефона
                password: password,
            });
            
            if (error) {
                console.error('Ошибка Supabase:', error);
                alert('Неверный номер телефона или пароль. Проверьте данные.');
            } else {
                console.log('Успешный вход!');
                // Сохраняем сессию и перенаправляем
                window.location.href = 'index.html';
            }
        } catch (err) {
            console.error('Критическая ошибка:', err);
            alert('Произошла ошибка соединения. Попробуйте позже.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

// При загрузке страницы проверяем, не авторизован ли уже
checkAlreadyLoggedIn();
