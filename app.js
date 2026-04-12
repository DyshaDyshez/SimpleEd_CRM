(function(){


    
    // Инициализация Supabase (только один раз!)
    const _supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    
    // Экспорт глобальных переменных
    window._supabase = _supabase;
    window.currentUser = null;
    
    let currentUser = window.currentUser;
    let teacherProfile = null;
    let groupsList = [];
    let groupsCurrentView = 'cards';

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

    // ===== ИНИЦИАЛИЗАЦИЯ =====
    async function init() {
        if (!currentUser) {
            const { data } = await _supabase.auth.getUser();
            if (!data.user) { window.location.href = 'auth.html'; return; }
            currentUser = data.user;
        }
        await loadTeacherProfile();
        // В функции init(), после loadTeacherProfile():
        window._supabase = _supabase;
        window.currentUser = currentUser;
        loadPage('dashboard');
    }

    async function loadTeacherProfile() {
        const { data } = await _supabase.from('teacher_profiles').select('*').eq('id', currentUser.id).single();
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
        pageTitle.textContent = {
            dashboard:'Главная', students:'Ученики', groups:'Группы',
            schedule:'Расписание', finance:'Финансы', notes:'Заметки'
        }[page] || page;
        
        if (page === 'students') {
            initStudentsPage();
        } else if (page === 'groups') {
            initGroupsPage();
        } else if (page === 'schedule') {
            // ===== ВЫЗОВ МОДУЛЯ РАСПИСАНИЯ =====
            if (typeof window.initSchedulePage === 'function') {
                window.initSchedulePage();
            } else {
                console.error('❌ Функция initSchedulePage не найдена. Проверьте, загружен ли schedule.js');
            }
            // =================================
        }
    }

    // ===== УЧЕНИКИ =====
    let editingStudentId = null;

    async function initStudentsPage() {
        await fetchGroupsForSelect();
        renderStudentForm();
        await loadStudentsTable();
        document.getElementById('addStudentBtn').addEventListener('click', () => {
            editingStudentId = null;
            renderStudentForm();
            document.getElementById('studentFormContainer').classList.remove('hidden');
        });
    }

    async function fetchGroupsForSelect() {
        const { data } = await _supabase.from('student_groups').select('id, group_name').eq('teacher_id', currentUser.id).order('group_name');
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
                    <div class="form-group"><label>Телефон</label><input id="phoneNumber" value="${student?.phone_number || ''}"></div>
                    <div class="form-group"><label>Возраст</label><input type="number" id="childAge" value="${student?.child_age || ''}"></div>
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
        const errorDiv = document.getElementById('studentFormError');
        errorDiv.textContent = '';
        const childName = document.getElementById('childName').value.trim();
        if (!childName) { errorDiv.textContent = 'Введите имя'; return; }
        const studentData = {
            teacher_id: currentUser.id,
            child_name: childName,
            parent_name: document.getElementById('parentName').value.trim() || null,
            phone_number: document.getElementById('phoneNumber').value.trim() || null,
            child_age: parseInt(document.getElementById('childAge').value) || null,
            group_id: document.getElementById('groupId').value || null,
            status: document.getElementById('status').value,
            parent_pain: document.getElementById('parentPain').value.trim() || null
        };
        let error;
        if (editingStudentId) {
            ({ error } = await _supabase.from('students').update(studentData).eq('id', editingStudentId));
        } else {
            ({ error } = await _supabase.from('students').insert(studentData));
        }
        if (error) { errorDiv.textContent = error.message; return; }
        document.getElementById('studentFormContainer').classList.add('hidden');
        editingStudentId = null;
        await loadStudentsTable();
    }

    async function loadStudentsTable() {
        const tbody = document.getElementById('studentsTableBody');
        const { data, error } = await _supabase.from('students').select('*, student_groups(group_name)').eq('teacher_id', currentUser.id).order('child_name');
        if (error) { tbody.innerHTML = '<tr><td colspan="6">Ошибка</td></tr>'; return; }
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
            await loadStudentsTable();
        }));
    }

    // ===== ГРУППЫ =====
    async function initGroupsPage() {
        await fetchGroupsFull();
        renderGroupsView();
        document.getElementById('addGroupBtn').addEventListener('click', () => {
            const container = document.getElementById('groupFormContainer');
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
                await _supabase.from('student_groups').insert({ teacher_id: currentUser.id, group_name: name, subject: document.getElementById('groupSubject').value.trim() || null });
                container.classList.add('hidden');
                await fetchGroupsFull();
                renderGroupsView();
            });
            document.getElementById('cancelGroupForm').addEventListener('click', () => container.classList.add('hidden'));
        });
        document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
            groupsCurrentView = btn.dataset.view;
            document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGroupsView();
        }));
    }

    async function fetchGroupsFull() {
        const { data } = await _supabase.from('student_groups').select('*').eq('teacher_id', currentUser.id).order('group_name');
        groupsList = data || [];
    }

    async function renderGroupsView() {
        const container = document.getElementById('groupsViewContainer');
        if (groupsCurrentView === 'cards') {
            const groups = await fetchGroupsWithDetails();
            container.innerHTML = '<div class="groups-grid"></div>';
            const grid = container.querySelector('.groups-grid');
            groups.forEach(g => grid.appendChild(createGroupCard(g)));
        } else {
            container.innerHTML = `<div class="table-responsive"><table><thead><tr><th>Название</th><th>Предмет</th><th>Учеников</th><th></th></tr></thead><tbody id="groupsTableBody"></tbody></table></div>`;
            await loadGroupsTable();
        }
    }

    async function fetchGroupsWithDetails() {
        const enriched = await Promise.all(groupsList.map(async (group) => {
            const { data: students } = await _supabase.from('students').select('id, child_name, child_age').eq('group_id', group.id);
            const { data: lessons } = await _supabase.from('lessons').select('lesson_date').eq('group_id', group.id).gte('lesson_date', new Date().toISOString()).order('lesson_date', { ascending: true }).limit(1);
            return { ...group, students: students || [], studentsCount: students?.length || 0, nextLesson: lessons?.[0]?.lesson_date || null };
        }));
        return enriched;
    }

    function createGroupCard(group) {
        const template = document.getElementById('groupCardTemplate');
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.group-card');
        card.dataset.id = group.id;
        card.querySelector('.group-name').textContent = group.group_name;
        card.querySelector('.group-subject').textContent = group.subject || 'Без предмета';
        card.querySelector('.students-count').textContent = group.studentsCount;
        const nextSpan = card.querySelector('.next-lesson');
        if (group.nextLesson) nextSpan.textContent = new Date(group.nextLesson).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
        else nextSpan.textContent = 'Нет занятий';
        const preview = card.querySelector('.group-students-preview');
        preview.innerHTML = group.students.slice(0,3).map(s => `<div class="student-preview-item"><span>${s.child_name}</span><span>${s.child_age ? s.child_age+' лет' : ''}</span></div>`).join('') || '<div>Нет учеников</div>';
        card.querySelector('.open-full-group').addEventListener('click', () => openFullGroupCard(group.id));
        card.querySelector('.delete-group').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Удалить группу?')) return;
            await _supabase.from('student_groups').delete().eq('id', group.id);
            await fetchGroupsFull();
            renderGroupsView();
        });
        return card;
    }

    async function loadGroupsTable() {
        const tbody = document.getElementById('groupsTableBody');
        const counts = {}; (await _supabase.from('students').select('group_id').eq('teacher_id', currentUser.id)).data?.forEach(s => { if (s.group_id) counts[s.group_id] = (counts[s.group_id]||0)+1; });
        tbody.innerHTML = groupsList.map(g => `<tr><td>${g.group_name}</td><td>${g.subject||'—'}</td><td>${counts[g.id]||0}</td><td><button class="btn-icon delete-group" data-id="${g.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="4">Нет групп</td></tr>';
        document.querySelectorAll('.delete-group').forEach(b => b.addEventListener('click', async () => {
            if (!confirm('Удалить?')) return;
            await _supabase.from('student_groups').delete().eq('id', b.dataset.id);
            await fetchGroupsFull();
            renderGroupsView();
        }));
    }

    // ===== ПОЛНАЯ КАРТОЧКА ГРУППЫ =====
    async function openFullGroupCard(groupId) {
        const { data: group } = await _supabase.from('student_groups').select('*').eq('id', groupId).single();
        if (!group) return;
        const template = document.getElementById('groupFullCardTemplate');
        const clone = template.content.cloneNode(true);
        document.body.appendChild(clone);
        const modal = document.querySelector('.modal:not(.hidden)');
        document.getElementById('fullGroupName').textContent = group.group_name;
        // Вкладки
        const infoTab = document.getElementById('tabGroupInfo');
        infoTab.innerHTML = `<form id="groupInfoForm"><div class="form-grid"><div class="form-group"><label>Название</label><input id="editGroupName" value="${group.group_name}"></div><div class="form-group"><label>Предмет</label><input id="editGroupSubject" value="${group.subject||''}"></div></div></form>`;
        const studentsTab = document.getElementById('tabGroupStudents');
        const { data: students } = await _supabase.from('students').select('*').eq('group_id', groupId).order('child_name');
        studentsTab.innerHTML = `<div class="students-list-full">${students?.map(s => `<div class="student-full-item"><span><strong>${s.child_name}</strong> (${s.child_age||'—'} л.)</span><span>${s.parent_name||''} ${s.phone_number||''}</span><button class="btn-icon remove-from-group" data-id="${s.id}"><i class="fas fa-times"></i></button></div>`).join('') || '<p>Нет учеников</p>'}</div><button class="btn btn-primary mt-2" id="addStudentToGroupBtn"><i class="fas fa-plus"></i> Добавить ученика</button>`;
        studentsTab.querySelectorAll('.remove-from-group').forEach(b => b.addEventListener('click', async () => { await _supabase.from('students').update({ group_id: null }).eq('id', b.dataset.id); modal.remove(); openFullGroupCard(groupId); }));
        studentsTab.querySelector('#addStudentToGroupBtn').addEventListener('click', () => showAddStudentModal(groupId, modal));
        const lessonsTab = document.getElementById('tabGroupLessons');
        const { data: lessons } = await _supabase.from('lessons').select('*').eq('group_id', groupId).order('lesson_date', { ascending: true });
        lessonsTab.innerHTML = `<table><thead><tr><th>Дата</th><th>Тема</th></tr></thead><tbody>${lessons?.map(l => `<tr><td>${new Date(l.lesson_date).toLocaleString('ru-RU')}</td><td>${l.topic||'—'}</td></tr>`).join('') || '<tr><td colspan="2">Нет занятий</td></tr>'}</tbody></table>`;
        // Переключение вкладок
        modal.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
            modal.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
            modal.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            document.getElementById('tabGroup' + t.dataset.tab.split('-')[1].charAt(0).toUpperCase() + t.dataset.tab.split('-')[1].slice(1)).classList.add('active');
        }));
        document.getElementById('saveFullGroup').addEventListener('click', async () => {
            const newName = document.getElementById('editGroupName').value;
            const newSubject = document.getElementById('editGroupSubject').value;
            await _supabase.from('student_groups').update({ group_name: newName, subject: newSubject || null }).eq('id', groupId);
            modal.remove();
            await fetchGroupsFull();
            renderGroupsView();
        });
        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    async function showAddStudentModal(groupId, parentModal) {
        const { data: students } = await _supabase.from('students').select('id, child_name').eq('teacher_id', currentUser.id).is('group_id', null);
        if (!students?.length) { alert('Нет свободных учеников'); return; }
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-card"><h3>Добавить ученика</h3><select id="studentSelect">${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}</select><button class="btn btn-primary mt-2" id="confirmAdd">Добавить</button><button class="btn btn-secondary mt-2 close-modal">Отмена</button></div>`;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
        modal.querySelector('#confirmAdd').addEventListener('click', async () => {
            const studentId = document.getElementById('studentSelect').value;
            await _supabase.from('students').update({ group_id: groupId }).eq('id', studentId);
            modal.remove();
            parentModal.remove();
            openFullGroupCard(groupId);
        });
    }

    // ===== ВЫХОД =====
    logoutBtn.addEventListener('click', async () => { await _supabase.auth.signOut(); window.location.href = 'auth.html'; });
    navLinks.forEach(link => link.addEventListener('click', e => { e.preventDefault(); navLinks.forEach(l => l.classList.remove('active')); link.classList.add('active'); loadPage(link.dataset.page); }));

    init();
})();