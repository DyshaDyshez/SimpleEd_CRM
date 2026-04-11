async function checkSession() {
    // Проверяем, на какой странице мы находимся
    const isAuthPage = window.location.pathname.includes('auth.html');

    const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
        // Если мы НЕ на странице входа и НЕ залогинены — отправляем на вход
        if (!isAuthPage) {
            window.location.href = 'auth.html';
        }
    } else {
        // Если залогинены
        if (isAuthPage) {
            // Если залогиненный юзер зашел на страницу входа — кидаем его в CRM
            window.location.href = 'index.html';
        } else {
            // Если на любой другой странице — показываем контент
            document.body.classList.add('authorized');
            window.currentUser = data.user;
        }
    }
}

checkSession();