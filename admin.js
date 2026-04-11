// ==========================================
// SIMPLEED CRM — АДМИН-ПАНЕЛЬ
// ==========================================

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Элементы
const teachersTbody = document.getElementById('teachersTableBody');
const addTeacherBtn = document.getElementById('addTeacherBtn');
const addFormDiv = document.getElementById('addTeacherForm');
const newTeacherForm = document.getElementById('newTeacherForm');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const logoutBtn = document.getElementById('logoutAdminBtn');
const backToCrmBtn = document.getElementById('backToCrmBtn');
const adminNameSpan = document.getElementById('adminNameDisplay');
const adminAvatar = document.getElementById('adminAvatar');

let currentAdmin = null;

// Проверка доступа
async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'auth.html';
        return false;
    }

    // Проверяем, есть ли пользователь в platform_admins
    const { data: admin, error } = await supabase
        .from('platform_admins')
        .select('full_name, email, plain_password')
        .eq('id', user.id)
        .single();

    if (error || !admin) {
        alert('Доступ запрещён. Вы не администратор.');
        window.location.href = 'index.html';
        return false;
    }

    currentAdmin = admin;
    adminNameSpan.textContent = admin.full_name || 'Администратор';
    adminAvatar.textContent = (admin.full_name || 'A').charAt(0).toUpperCase();
    
    // Показываем пароль админа где-нибудь (например, в консоли или можно в интерфейс)
    console.log(`Ваш пароль администратора: ${admin.plain_password}`);
    
    return true;
}

// Загрузка списка учителей
async function loadTeachers() {
    const { data, error } = await supabase
        .from('teacher_profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        teachersTbody.innerHTML = `<tr><td colspan="7">Ошибка загрузки: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        teachersTbody.innerHTML = `<tr><td colspan="7">Нет преподавателей</td></tr>`;
        return;
    }

    const now = new Date();
    teachersTbody.innerHTML = data.map(t => {
        const accessUntil = t.access_until ? new Date(t.access_until) : null;
        const isActive = accessUntil && accessUntil > now;
        const statusBadge = isActive 
            ? '<span class="badge active">Активен</span>' 
            : '<span class="badge blocked">Заблокирован</span>';
        
        return `
            <tr>
                <td>${t.teacher_name || '—'}</td>
                <td>${t.email}</td>
                <td><code>${t.plain_password || 'не задан'}</code></td>
                <td><span class="badge plan-${t.subscription_plan}">${t.subscription_plan}</span></td>
                <td>${accessUntil ? accessUntil.toLocaleDateString('ru-RU') : '—'}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-icon" onclick="editTeacher('${t.id}')" title="Редактировать"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="extendAccess('${t.id}')" title="Продлить на 30 дней"><i class="fas fa-calendar-plus"></i></button>
                    <button class="btn-icon" onclick="toggleBlock('${t.id}', ${isActive})" title="${isActive ? 'Заблокировать' : 'Разблокировать'}">
                        <i class="fas fa-${isActive ? 'ban' : 'unlock'}"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Функции действий (будут доступны глобально для onclick)
window.editTeacher = async (id) => {
    const newName = prompt('Введите новое имя учителя:');
    if (newName) {
        await supabase.from('teacher_profiles').update({ teacher_name: newName }).eq('id', id);
        loadTeachers();
    }
};

window.extendAccess = async (id) => {
    const { data } = await supabase.from('teacher_profiles').select('access_until').eq('id', id).single();
    const current = data?.access_until ? new Date(data.access_until) : new Date();
    current.setDate(current.getDate() + 30);
    await supabase.from('teacher_profiles').update({ access_until: current.toISOString() }).eq('id', id);
    loadTeachers();
};

window.toggleBlock = async (id, currentlyActive) => {
    if (currentlyActive) {
        // Блокируем: ставим access_until = now()
        await supabase.from('teacher_profiles').update({ access_until: new Date().toISOString() }).eq('id', id);
    } else {
        // Разблокируем: ставим +30 дней от сейчас
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + 30);
        await supabase.from('teacher_profiles').update({ access_until: newDate.toISOString() }).eq('id', id);
    }
    loadTeachers();
};

// Добавление нового учителя
newTeacherForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('newEmail').value.trim();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const plan = document.getElementById('newPlan').value;
    let accessUntil = document.getElementById('newAccessUntil').value;
    
    if (!email || !name || !password) {
        alert('Email, имя и пароль обязательны');
        return;
    }
    
    // Вычисляем дату доступа (по умолчанию +14 дней для trial)
    let accessDate;
    if (accessUntil) {
        accessDate = new Date(accessUntil);
    } else {
        accessDate = new Date();
        accessDate.setDate(accessDate.getDate() + (plan === 'trial' ? 14 : 30));
    }
    
    // Используем Admin API для создания пользователя? Но у нас нет сервисной роли в браузере.
    // Безопаснее выполнить через Supabase Edge Function или использовать прямой вызов auth.signUp()
    // Но signUp требует подтверждения email, если включено. Лучше создать через SQL?
    // Покажем альтернативу: используем вызов RPC функции, которую создадим в SQL.
    
    try {
        // Вызов хранимой процедуры create_teacher (создадим её ниже)
        const { error } = await supabase.rpc('create_teacher', {
            teacher_email: email,
            teacher_name: name,
            teacher_password: password,
            plan_name: plan,
            access_date: accessDate.toISOString()
        });
        
        if (error) throw error;
        
        alert('Учитель успешно создан!');
        newTeacherForm.reset();
        addFormDiv.classList.add('hidden');
        loadTeachers();
    } catch (err) {
        alert('Ошибка создания: ' + err.message);
        console.error(err);
    }
});

// Показать/скрыть форму добавления
addTeacherBtn.addEventListener('click', () => {
    addFormDiv.classList.toggle('hidden');
});

cancelAddBtn.addEventListener('click', () => {
    addFormDiv.classList.add('hidden');
});

// Выход
logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'auth.html';
});

backToCrmBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Инициализация
(async () => {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;
    
    await loadTeachers();
})();
