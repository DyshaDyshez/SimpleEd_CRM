(function(){
    const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    let currentUser = window.currentUser;
    let teacherProfile = null;
    let groupsList = [];

    const contentArea = document.getElementById('contentArea');
    const pageTitle = document.getElementById('pageTitle');
    const teacherNameSpan = document.getElementById('teacherNameDisplay');
    const userAvatar = document.getElementById('userAvatar');
    const navLinks = document.querySelectorAll('[data-page]');
    const logoutBtn = document.getElementById('logoutBtn');

    const templates = {
        dashboard: document.getElementById('dashboardTemplate'),
        students: document.getElementById('studentsTemplate'),
        groups: document.getElementById('groupsTemplate'),
        schedule: document.getElementById('scheduleTemplate'),
        finance: document.getElementById('financeTemplate'),
        notes: document.getElementById('notesTemplate')
    };

    async function init() {
        if (!currentUser) {
            const { data } = await _supabase.auth.getUser();
            if (!data.user) { window.location.href = 'auth.html'; return; }
            currentUser = data.user;
        }
        await loadTeacherProfile();
        loadPage('dashboard');
    }

    async function loadTeacherProfile() {
        const { data } = await _supabase.from('teacher_profiles')
            .select('*').eq('id', currentUser.id).single();
        if (data) {
            teacherProfile = data;
            teacherNameSpan.textContent = data.teacher_name || 'Учитель';
            userAvatar.textContent = (data.teacher_name || 'У')[0].toUpperCase();
        }
    }

    function loadPage(page) {
        const template = templates[page];
        if (!template) return;
        contentArea.innerHTML = '';
        contentArea.appendChild(template.content.cloneNode(true));
        pageTitle.textContent = { dashboard:'Главная', students:'Ученики', groups:'Группы', schedule:'Расписание', finance:'Финансы', notes:'Заметки' }[page] || page;
        if (page === 'students') initStudentsPage();
        else if (page === 'groups') initGroupsPage();
    }

    // ===== УЧЕНИКИ =====
    let editingStudentId = null;

    async function initStudentsPage() {
        await fetchGroups();
        renderStudentForm();
        await loadStudentsTable();
        document.getElementById('addStudentBtn').addEventListener('click', () => {
            editingStudentId = null;
            renderStudentForm();
            document.getElementById('studentFormContainer').classList.remove('hidden');
        });
    }

    async function fetchGroups() {
        const { data } = await _supabase.from('student_groups').select('id, group_name').eq('teacher_id', currentUser.id);
        groupsList = data || [];
    }

    function renderStudentForm(student = null) {
        const container = document.getElementById('studentFormContainer');
        container.innerHTML = `
            <h3>${student ? 'Редактировать' : 'Добавить'} ученика</h3>
            <form id="studentForm">
                <div class="form-grid">
                    <div class="form-group"><label>Имя *</label><input id="childName" value="${student?.child_name || ''}" required></div>
                    <div class="form-group"><label>Родитель</label><input id="parentName" value="${student?.parent_name || ''}"></div>
                    <div class="form-group"><label>Телефон</label><input id="phone" value="${student?.phone_number || ''}"></div>
                    <div class="form-group"><label>Возраст</label><input type="number" id="age" value="${student?.child_age || ''}"></div>
                    <div class="form-group"><label>Группа</label><select id="groupId">
                        <option value="">Без группы</option>
                        ${groupsList.map(g => `<option value="${g.id}" ${student?.group_id===g.id?'selected':''}>${g.group_name}</option>`).join('')}
                    </select></div>
                    <div class="form-group"><label>Статус</label><select id="status">
                        <option value="active" ${student?.status==='active'?'selected':''}>Активен</option>
                        <option value="inactive" ${student?.status==='inactive'?'selected':''}>Неактивен</option>
                    </select></div>
                </div>
                <div class="form-group"><label>Заметка</label><textarea id="parentPain">${student?.parent_pain || ''}</textarea></div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-success">Сохранить</button>
                    <button type="button" class="btn btn-secondary" id="cancelStudentForm">Отмена</button>
                </div>
                <div id="studentFormError" class="error-message"></div>
            </form>
        `;
        document.getElementById('studentForm').addEventListener('submit', saveStudent);
        document.getElementById('cancelStudentForm').addEventListener('click', () => container.classList.add('hidden'));
    }

    async function saveStudent(e) {
        e.preventDefault();
        const childName = document.getElementById('childName').value.trim();
        if (!childName) return;
        const data = {
            teacher_id: currentUser.id,
            child_name: childName,
            parent_name: document.getElementById('parentName').value.trim() || null,
            phone_number: document.getElementById('phone').value.trim() || null,
            child_age: parseInt(document.getElementById('age').value) || null,
            group_id: document.getElementById('groupId').value || null,
            status: document.getElementById('status').value,
            parent_pain: document.getElementById('parentPain').value.trim() || null
        };
        let error;
        if (editingStudentId) {
            ({ error } = await _supabase.from('students').update(data).eq('id', editingStudentId));
        } else {
            ({ error } = await _supabase.from('students').insert(data));
        }
        if (!error) {
            document.getElementById('studentFormContainer').classList.add('hidden');
            loadStudentsTable();
        }
    }

    async function loadStudentsTable() {
        const tbody = document.getElementById('studentsTableBody');
        const { data } = await _supabase.from('students').select('*, student_groups(group_name)').eq('teacher_id', currentUser.id).order('child_name');
        if (!data?.length) { tbody.innerHTML = '<tr><td colspan="6">Нет учеников</td></tr>'; return; }
        tbody.innerHTML = data.map(s => `
            <tr>
                <td>${s.child_name}</td>
                <td>${s.parent_name || '—'}</td>
                <td>${s.phone_number || '—'}</td>
                <td>${s.student_groups?.group_name || '—'}</td>
                <td><span class="badge ${s.status}">${s.status==='active'?'Активен':'Неактивен'}</span></td>
                <td>
                    <button class="btn-icon edit-student" data-id="${s.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete-student" data-id="${s.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
        document.querySelectorAll('.edit-student').forEach(b => b.addEventListener('click', async () => {
            const id = b.dataset.id;
            const { data } = await _supabase.from('students').select('*').eq('id', id).single();
            editingStudentId = id;
            renderStudentForm(data);
            document.getElementById('studentFormContainer').classList.remove('hidden');
        }));
        document.querySelectorAll('.delete-student').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Удалить?')) return;
            await _supabase.from('students').delete().eq('id', b.dataset.id);
            loadStudentsTable();
        }));
    }

    // ===== ГРУППЫ (аналогично) =====
    





// ========== СТРАНИЦА ГРУПП ==========
async function initGroupsPage() {
    await loadGroupsTable();

    const addBtn = document.getElementById('addGroupBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const container = document.getElementById('groupFormContainer');
            if (!container) return;
            
            container.innerHTML = `
                <h3>Новая группа</h3>
                <form id="groupForm">
                    <div class="form-grid">
                        <div class="form-group"><label>Название *</label><input type="text" id="groupName" required></div>
                        <div class="form-group"><label>Предмет</label><input type="text" id="groupSubject"></div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-success">Создать</button>
                        <button type="button" class="btn btn-secondary" id="cancelGroupForm">Отмена</button>
                    </div>
                </form>
            `;
            container.classList.remove('hidden');

            document.getElementById('groupForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const name = document.getElementById('groupName').value.trim();
                if (!name) return;

                await _supabase.from('student_groups').insert({
                    teacher_id: currentUser.id,
                    group_name: name,
                    subject: document.getElementById('groupSubject').value.trim() || null
                });
                container.classList.add('hidden');
                await loadGroupsTable();
            });

            document.getElementById('cancelGroupForm').addEventListener('click', () => {
                container.classList.add('hidden');
            });
        });
    }
}

async function loadGroupsTable() {
    const tbody = document.getElementById('groupsTableBody');
    if (!tbody) return;

    const { data: groups, error } = await _supabase
        .from('student_groups')
        .select('*')
        .eq('teacher_id', currentUser.id)
        .order('group_name');

    if (error) {
        tbody.innerHTML = `<tr><td colspan="4">Ошибка загрузки</td></tr>`;
        return;
    }

    // Получаем количество учеников в каждой группе
    const { data: students } = await _supabase
        .from('students')
        .select('group_id')
        .eq('teacher_id', currentUser.id);

    const counts = {};
    students?.forEach(s => { if (s.group_id) counts[s.group_id] = (counts[s.group_id] || 0) + 1; });

    if (!groups?.length) {
        tbody.innerHTML = `<tr><td colspan="4">Нет групп</td></tr>`;
        return;
    }

    tbody.innerHTML = groups.map(g => `
        <tr>
            <td>${g.group_name}</td>
            <td>${g.subject || '—'}</td>
            <td>${counts[g.id] || 0}</td>
            <td>
                <button class="btn-icon delete-group" data-id="${g.id}"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.delete-group').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить группу? Ученики останутся без группы.')) return;
            await _supabase.from('student_groups').delete().eq('id', btn.dataset.id);
            await loadGroupsTable();
            // Обновим список групп для формы учеников
            await fetchGroups();
        });
    });
}


















    // Выход
    logoutBtn.addEventListener('click', async () => {
        await _supabase.auth.signOut();
        window.location.href = 'auth.html';
    });

    navLinks.forEach(link => link.addEventListener('click', e => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        loadPage(link.dataset.page);
    }));

    init();
})();