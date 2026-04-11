// Этот скрипт должен загружаться ПЕРВЫМ на всех закрытых страницах
async function checkSession() {
    const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    // Получаем текущего пользователя
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        // Если пользователя нет — выкидываем на страницу входа
        window.location.href = 'auth.html';
    } else {
        console.log("Доступ разрешен для:", user.email);
        // Здесь можно сохранить данные пользователя в глобальную переменную, 
        // чтобы использовать имя учителя в интерфейсе
        window.currentUser = user;
    }
}

if (!user) {
    window.location.href = 'auth.html';
} else {
    document.body.classList.add('authorized');
}

// Запускаем проверку сразу
checkSession();