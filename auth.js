// Инициализация Supabase клиента
const supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('phone').value; // Пока используем как логин
        const password = document.getElementById('password').value;

        // 1. Пытаемся войти
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Ошибка входа: " + error.message);
        } else {
            console.log("Успешный вход:", data);
            
            // 2. Проверяем, админ ли это (твой номер)
            // Мы это сделаем чуть позже, когда создадим твой профиль
            
            window.location.href = 'index.html'; // Переходим в CRM
        }
    });
}