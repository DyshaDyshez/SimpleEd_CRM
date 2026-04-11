// ==========================================
// SIMPLEED CRM — СТРАНИЦА ВХОДА (EMAIL)
// ==========================================

if (typeof CONFIG === 'undefined') {
    alert('Ошибка: Файл config.js не найден.');
}

const supabaseAuth = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Проверяем, не авторизован ли уже
async function checkAlreadyLoggedIn() {
    const { data } = await supabaseAuth.auth.getUser();
    if (data.user) {
        window.location.href = 'index.html';
    }
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            alert('Введите email и пароль');
            return;
        }
        
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Вход...';
        
        try {
            const { data, error } = await supabaseAuth.auth.signInWithPassword({
                email: email,
                password: password,
            });
            
            if (error) {
                console.error('Ошибка входа:', error);
                alert('Неверный email или пароль.');
            } else {
                window.location.href = 'index.html';
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка соединения.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
}

checkAlreadyLoggedIn();
