// Проверяем, что конфиг загрузился
if (typeof CONFIG === 'undefined') {
    alert("Ошибка: Файл config.js не найден или не подключен!");
}

// Инициализация Supabase
const supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('phone').value; // Твой логин (email) из Auth
        const password = document.getElementById('password').value;

        console.log("Попытка входа...", email);

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Ошибка Supabase: " + error.message);
            console.error(error);
        } else {
            alert("Успешный вход!");
            window.location.href = 'index.html';
        }
    });
}