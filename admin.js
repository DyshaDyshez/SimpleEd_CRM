// ==========================================
// SIMPLEED CRM — АДМИН-ПАНЕЛЬ (отдельная авторизация)
// ==========================================

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Проверка сессии админа (localStorage)
const adminSession = localStorage.getItem('adminAuth');
if (!adminSession) {
    window.location.href = 'admin_login.html';
}

const adminData = JSON.parse(adminSession);

// DOM элементы
const teachersTbody = document.getElementById('teachersTableBody');
const adminNameSpan = document.getElementById('adminNameDisplay');
const adminAvatar = document.getElementById('adminAvatar');
const logoutBtn = document.getElementById('logoutAdminBtn');
const backToCrmBtn = document.getElementById('backToCrmBtn');

// Отображение имени админа
if (adminNameSpan) {
    adminNameSpan.textContent = adminData.name || 'Администратор';
    if (adminAvatar) adminAvatar.textContent = (adminData.name || 'A').charAt(0).toUpperCase();
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
                    <button class="btn-icon" onclick="editTeacher('${t.id}')" title="Редактировать имя"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon" onclick="extendAccess('${t.id}')" title="Продлить на 30 дней"><i class="fas fa-calendar-plus"></i></button>
                    <button class="btn-icon" onclick="toggleBlock('${t.id}', ${isActive})" title="${isActive ? 'Заблокировать' : 'Разблокировать'}">
                        <i class="fas fa-${isActive ? 'ban' : 'unlock'}"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Глобальные функции для кнопок действий
window.editTeacher = async (id) => {
    const newName = prompt('Введите новое имя учителя:');
    if (newName) {
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
};

window.extendAccess = async (id) => {
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
};

window.toggleBlock = async (id, currentlyActive) => {
    let newDate;
    if (currentlyActive) {
        newDate = new Date().toISOString();
    } else {
        const future = new Date();
        future.setDate(future.getDate() + 30);
        newDate = future.toISOString();
    }
    const { error } = await supabase
        .from('teacher_profiles')
        .update({ access_until: newDate })
        .eq('id', id);
    if (error) {
        alert('Ошибка изменения доступа: ' + error.message);
    } else {
        loadTeachers();
    }
};

// Выход из админки
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('adminAuth');
    window.location.href = 'admin_login.html';
});

// Переход в CRM (интерфейс учителя)
backToCrmBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Первоначальная загрузка данных
loadTeachers();
