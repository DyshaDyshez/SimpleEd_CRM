// ==========================================
// SIMPLEED CRM — СТРАНИЦА ВХОДА (С ПРОВЕРКОЙ СТАТУСА)
// ==========================================

if (typeof CONFIG === 'undefined') {
    alert('Ошибка: Файл config.js не найден.');
}

const supabaseAuth = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Дождёмся загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Сразу скрываем модальное окно (на всякий случай)
    const modal = document.getElementById('blockedModal');
    if (modal) modal.classList.add('hidden');

    // Проверяем, не авторизован ли уже
    checkAlreadyLoggedIn();

    // Обработчик формы входа
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
                    alert('Неверный email или пароль. Проверьте введённые данные.');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                } else {
                    // Успешный вход — проверяем статус
                    await checkTeacherStatus(data.user.id, data.user.email);
                }
            } catch (err) {
                console.error(err);
                alert('Ошибка соединения. Попробуйте позже.');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    // Закрытие модалки по крестику и клику вне
    const closeBtn = document.getElementById('closeBlockedModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('blockedModal').classList.add('hidden');
        });
    }
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('blockedModal');
        if (e.target === modal) modal.classList.add('hidden');
    });
});

// Проверяем, не авторизован ли уже
async function checkAlreadyLoggedIn() {
    const { data } = await supabaseAuth.auth.getUser();
    if (data.user) {
        await checkTeacherStatus(data.user.id, data.user.email);
    }
}

// Проверка статуса учителя
async function checkTeacherStatus(userId, email) {
    try {
        const { data, error } = await supabaseAuth
            .from('teacher_profiles')
            .select('activity_status, access_until, teacher_name')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('Ошибка получения статуса:', error);
            window.location.href = 'index.html';
            return;
        }

        const now = new Date();
        const accessUntil = data.access_until ? new Date(data.access_until) : null;
        const isBlocked = data.activity_status === 'blocked';
        const isInactive = data.activity_status === 'inactive';
        const isExpired = accessUntil && accessUntil < now;

        if (isBlocked || isInactive || isExpired) {
            showBlockedModal(data.teacher_name || 'Учитель', email);
        } else {
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error('Ошибка проверки статуса:', err);
        window.location.href = 'index.html';
    }
}

// Показать модальное окно блокировки
function showBlockedModal(teacherName, teacherEmail) {
    const modal = document.getElementById('blockedModal');
    const teacherNameSpan = document.getElementById('blockedTeacherName');
    const supportBtn = document.getElementById('blockedSupportBtn');
    const logoutBtn = document.getElementById('blockedLogoutBtn');

    if (teacherNameSpan) teacherNameSpan.textContent = teacherName;
    if (modal) modal.classList.remove('hidden');

    // Кнопка поддержки — отправка email
    if (supportBtn) {
        // Удаляем старые обработчики
        const newSupportBtn = supportBtn.cloneNode(true);
        supportBtn.parentNode.replaceChild(newSupportBtn, supportBtn);
        
        newSupportBtn.addEventListener('click', () => {
            const subject = encodeURIComponent('Проблема с доступом к SimpleEd');
            const body = encodeURIComponent(
                `Здравствуйте!\n\n` +
                `Мой email: ${teacherEmail}\n` +
                `Имя: ${teacherName}\n\n` +
                `Опишите проблему:\n\n` +
                `Со мной удобно связаться: `
            );
            window.location.href = `mailto:Andrew02563@gmail.com?subject=${subject}&body=${body}`;
        });
    }

    // Кнопка выхода
    if (logoutBtn) {
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        newLogoutBtn.addEventListener('click', async () => {
            await supabaseAuth.auth.signOut();
            window.location.reload();
        });
    }
}

export async function updateTeacherProfile(updates) {
    const user = getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return await supabase
      .from('teacher_profiles')
      .update(updates)
      .eq('id', user.id);
  }
  
  export async function fetchTeacherProfile() {
    const user = getCurrentUser();
    if (!user) return null;
    const { data } = await supabase
      .from('teacher_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    return data;
  }