async function checkSession() {
    const isAuthPage = window.location.pathname.includes('auth.html');
    const isAdminPage = window.location.pathname.includes('admin.html');

    const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data.user) {
        if (!isAuthPage) window.location.href = 'auth.html';
        return;
    }

    window.currentUser = data.user;

    // Проверяем, админ ли пользователь
    const { data: adminData } = await supabaseClient
        .from('platform_admins')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle();

    const isAdmin = !!adminData;

    if (isAuthPage) {
        // После входа направляем админа в админку, остальных в CRM
        window.location.href = isAdmin ? 'admin.html' : 'index.html';
    } else if (isAdminPage) {
        // Если не админ, но пытается зайти на admin.html — выкидываем
        if (!isAdmin) {
            alert('Доступ запрещён');
            window.location.href = 'index.html';
        } else {
            document.body.classList.add('authorized');
        }
    } else {
        // Обычная страница CRM
        document.body.classList.add('authorized');
    }
}

checkSession();
