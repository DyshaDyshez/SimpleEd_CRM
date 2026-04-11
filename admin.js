// ==========================================
// SIMPLEED CRM — АДМИН-ПАНЕЛЬ (admin.js)
// ==========================================

// Проверка авторизации админа
const adminSession = localStorage.getItem('adminAuth');
if (!adminSession) {
    window.location.href = 'admin_login.html';
}
const adminData = JSON.parse(adminSession);

// Инициализация Supabase
const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// DOM элементы
const teachersTbody = document.getElementById('teachersTableBody');
const adminNameSpan = document.getElementById('adminNameDisplay');
const adminAvatar = document.getElementById('adminAvatar');
const logoutBtn = document.getElementById('logoutAdminBtn');
const backToCrmBtn = document.getElementById('backToCrmBtn');
const addTeacherBtn = document.getElementById('addTeacherBtn');
const addFormDiv = document.getElementById('addTeacherForm');
const newTeacherForm = document.getElementById('newTeacherForm');
const cancelAddBtn = document.getElementById('cancelAddBtn');
const formError = document.getElementById('formError');

// Отображение имени админа
if (adminNameSpan) {
    adminNameSpan.textContent = adminData.name || 'Администратор';
    if (adminAvatar) adminAvatar.textContent = (adminData.name || 'A').charAt(0).toUpperCase();
}

// ========== ЗАГРУЗКА СПИСКА УЧИТЕЛЕЙ ==========
async function loadTeachers() {
    try {
        const { data, error } = await supabase
            .from('teacher_profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

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
                        <button class="btn-icon" data-action="edit" data-id="${t.id}" title="Редактировать имя"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="extend" data-id="${t.id}" title="Продлить на 30 дней"><i class="fas fa-calendar-plus"></i></button>
                        <button class="btn-icon" data-action="toggle" data-id="${t.id}" data-active="${isActive}" title="${isActive ? 'Заблокировать' : 'Разблокировать'}">
                            <i class="fas fa-${isActive ? 'ban' : 'unlock'}"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Навешиваем обработчики на кнопки
        document.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => editTeacher(btn.dataset.id));
        });
        document.querySelectorAll('[data-action="extend"]').forEach(btn => {
            btn.addEventListener('click', () => extendAccess(btn.dataset.id));
        });
        document.querySelectorAll('[data-action="toggle"]').forEach(btn => {
            btn.addEventListener('click', () => toggleBlock(btn.dataset.id, btn.dataset.active === 'true'));
        });

    } catch (err) {
        console.error('Ошибка загрузки учителей:', err);
        teachersTbody.innerHTML = `<tr><td colspan="7">Ошибка загрузки: ${err.message}</td></tr>`;
    }
}

// ========== ДЕЙСТВИЯ С УЧИТЕЛЯМИ ==========
async function editTeacher(id) {
    const newName = prompt('Введите новое имя учителя:');
    if (!newName) return;

    const { error } = await supabase
        .from('teacher_profiles')
        .update({ teacher_name: newName })
        .eq('id', id);

    if (error) {
        alert('Ошибка: ' + error.message);
    } else {
        loadTeachers();
    }
}

async function extendAccess(id) {
    const { data, error: fetchError } = await supabase
        .from('teacher_profiles')
        .select('access_until')
        .eq('id', id)
        .single();

    if (fetchError) {
        alert('Ошибка получения данных: ' + fetchError.message);
        return;
    }

    const current = data?.access_until ? new Date(data.access_until) : new Date();
    current.setDate(current.getDate() + 30);

    const { error: updateError } = await supabase
        .from('teacher_profiles')
        .update({ access_until: current.toISOString() })
        .eq('id', id);

    if (updateError) {
        alert('Ошибка продления: ' + updateError.message);
    } else {
        loadTeachers();
    }
}

async function toggleBlock(id, currentlyActive) {
    const newDate = currentlyActive ? new Date().toISOString() : (() => {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        return future.toISOString();
    })();

    const { error } = await supabase
        .from('teacher_profiles')
        .update({ access_until: newDate })
        .eq('id', id);

    if (error) {
        alert('Ошибка изменения доступа: ' + error.message);
    } else {
        loadTeachers();
    }
}

// ========== ДОБАВЛЕНИЕ УЧИТЕЛЯ ==========
newTeacherForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';

    const email = document.getElementById('newEmail').value.trim();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const plan = document.getElementById('newPlan').value;
    const accessUntilInput = document.getElementById('newAccessUntil').value;

    if (!email || !name || !password) {
        formError.textContent = 'Email, имя и пароль обязательны';
        return;
    }

    let accessDate;
    if (accessUntilInput) {
        accessDate = new Date(accessUntilInput);
        accessDate.setHours(23, 59, 59);
    } else {
        accessDate = new Date();
        accessDate.setDate(accessDate.getDate() + (plan === 'trial' ? 14 : 30));
    }

    try {
        const { error } = await supabase.rpc('create_teacher', {
            teacher_email: email,
            teacher_name: name,
            teacher_password: password,
            plan_name: plan,
            access_date: accessDate.toISOString()
        });

        if (error) throw error;

        newTeacherForm.reset();
        addFormDiv.classList.add('hidden');
        loadTeachers();
        alert('Учитель успешно создан!');
    } catch (err) {
        console.error(err);
        formError.textContent = 'Ошибка: ' + err.message;
    }
});

// ========== ИНТЕРФЕЙС ==========
addTeacherBtn?.addEventListener('click', () => {
    addFormDiv.classList.toggle('hidden');
});

cancelAddBtn?.addEventListener('click', () => {
    addFormDiv.classList.add('hidden');
    formError.textContent = '';
});

logoutBtn?.addEventListener('click', () => {
    localStorage.removeItem('adminAuth');
    window.location.href = 'admin_login.html';
});

backToCrmBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Переключение вкладок (если есть)
document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = tab.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(tabId + 'Tab').classList.add('active');
        document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
        tab.classList.add('active');
    });
});

// Старт загрузки
loadTeachers();
