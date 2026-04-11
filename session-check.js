async function checkSession() {
    const isAuthPage = window.location.pathname.includes('auth.html');

    const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
        if (!isAuthPage) {
            window.location.href = 'auth.html';
        }
    } else {
        // Сохраняем пользователя глобально
        window.currentUser = data.user;
        
        if (isAuthPage) {
            window.location.href = 'index.html';
        } else {
            document.body.classList.add('authorized');
        }
    }
}

checkSession();
