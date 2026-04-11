// Функция проверки сессии
async function checkSession() {
    // 1. Инициализируем клиент внутри функции
    const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    // 2. Получаем данные о сессии
    const { data, error } = await supabaseClient.auth.getUser();

    // 3. Если произошла ошибка или пользователя нет в сессии
    if (error || !data.user) {
        console.log("Доступ запрещен. Перенаправление на вход...");
        window.location.href = 'auth.html';
    } else {
        // 4. Если всё хорошо
        console.log("Доступ разрешен для:", data.user.email);
        window.currentUser = data.user; // Сохраняем данные для дальнейшего использования
        
        // Показываем страницу (убираем прозрачность)
        document.body.classList.add('authorized');
    }
}

// Запускаем
checkSession();
