// modules/groups.js
import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate } from './ui.js';
import { getCurrentUser } from './auth.js';

let groupsList = [];
let groupsCurrentView = 'cards';

// === ИНИЦИАЛИЗАЦИЯ ===
export async function initGroupsPage() {
  try {
    await fetchGroupsFull();
    renderGroupsView();
    bindGroupEvents();
  } catch (error) {
    console.error(error);
    alert('Ошибка загрузки групп');
  }
}

// === ЗАГРУЗКА ДАННЫХ ===
async function fetchGroupsFull() {
  const { data, error } = await supabase
    .from('student_groups')
    .select('*')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  if (error) throw error;

  groupsList = await Promise.all(data.map(async (group) => {
    const [students, lessons] = await Promise.all([
      supabase.from('students').select('id, child_name, child_age, parent_name, phone_number').eq('group_id', group.id).then(r => r.data || []),
      supabase.from('lessons').select('id, lesson_date, topic').eq('group_id', group.id).order('lesson_date', { ascending: true }).then(r => r.data || [])
    ]);
    group.students = students;
    group.lessons = lessons;
    const now = new Date().toISOString();
    group.nextLesson = lessons.find(l => l.lesson_date >= now) || null;
    return group;
  }));
}

// === РЕНДЕРИНГ ===
function renderGroupsView() {
  const { contentArea } = getDOMElements();
  const container = contentArea.querySelector('#groupsViewContainer');
  if (!container) return;
  groupsCurrentView === 'cards' ? renderCards(container) : renderTable(container);
}

function renderCards(container) {
  container.innerHTML = '<div class="groups-grid"></div>';
  const grid = container.querySelector('.groups-grid');
  groupsList.forEach(g => grid.appendChild(createGroupCard(g)));
}

function renderTable(container) {
  container.innerHTML = `<div class="table-responsive"><table>
    <thead><tr><th>Название</th><th>Предмет</th><th>Учеников</th><th></th></tr></thead>
    <tbody>${groupsList.map(g => `<tr><td>${g.group_name}</td><td>${g.subject||'—'}</td><td>${g.students.length}</td>
      <td><button class="btn-icon delete-group" data-id="${g.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="4">Нет групп</td></tr>'}</tbody>
  </table></div>`;
  container.querySelectorAll('.delete-group').forEach(b => b.addEventListener('click', () => deleteGroupById(b.dataset.id)));
}

function createGroupCard(group) {
  const template = getTemplate('groupCard');
  const card = template.content.cloneNode(true).querySelector('.group-card');
  card.dataset.id = group.id;
  card.querySelector('.group-name').textContent = group.group_name;
  card.querySelector('.group-subject').textContent = group.subject || 'Без предмета';
  card.querySelector('.students-count').textContent = group.students.length;
  const nextEl = card.querySelector('.next-lesson');
  if (group.nextLesson) {
    nextEl.textContent = new Date(group.nextLesson.lesson_date).toLocaleString('ru-RU', { day:'numeric', month:'long', hour:'2-digit', minute:'2-digit' });
  } else {
    nextEl.textContent = 'Нет занятий';
  }
  const preview = card.querySelector('.group-students-preview');
  preview.innerHTML = '';
  group.students.slice(0,3).forEach(s => {
    const div = document.createElement('div');
    div.className = 'student-preview-item';
    div.innerHTML = `<span>${s.child_name}</span><span>${s.child_age||'—'} лет</span>`;
    preview.appendChild(div);
  });
  if (!group.students.length) preview.innerHTML = '<div class="no-students">Нет учеников</div>';
  card.querySelector('.open-full-group').addEventListener('click', () => openFullGroupCard(group.id));
  card.querySelector('.delete-group').addEventListener('click', (e) => { e.stopPropagation(); deleteGroupById(group.id); });
  card.querySelector('.schedule-lesson-btn').addEventListener('click', (e) => { e.stopPropagation(); openScheduleLessonModal(group.id, group.group_name); });
  return card;
}

// === ДЕЙСТВИЯ ===
async function deleteGroupById(id) {
  if (!confirm('Удалить группу?')) return;
  await supabase.from('student_groups').delete().eq('id', id);
  await fetchGroupsFull();
  renderGroupsView();
}

// === ПОЛНАЯ КАРТОЧКА ===
export async function openFullGroupCard(groupId) {
  if (document.querySelector('.modal.group-full-details')) return;
  const group = groupsList.find(g => g.id === groupId);
  if (!group) return alert('Группа не найдена');
  const template = getTemplate('groupFullCard');
  const modal = template.content.cloneNode(true).querySelector('.modal');
  modal.classList.add('group-full-details');
  document.body.appendChild(modal);

  document.getElementById('fullGroupName').textContent = group.group_name;
  document.getElementById('editGroupName').value = group.group_name;
  document.getElementById('editGroupSubject').value = group.subject || '';

  populateStudentsTab(modal, group);
  populateLessonsTab(modal, group);

  // вкладки
  modal.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector(`#tabGroup${tabName.charAt(0).toUpperCase()+tabName.slice(1)}`).classList.add('active');
    });
  });

  modal.querySelector('#saveFullGroup').addEventListener('click', async () => {
    const name = document.getElementById('editGroupName').value.trim();
    if (!name) return alert('Введите название');
    const subject = document.getElementById('editGroupSubject').value.trim() || null;
    await supabase.from('student_groups').update({ group_name: name, subject }).eq('id', groupId);
    modal.remove();
    await fetchGroupsFull();
    renderGroupsView();
  });

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function populateStudentsTab(modal, group) {
  const container = modal.querySelector('#tabGroupStudents .students-list-full');
  const noMsg = modal.querySelector('.no-students-tab');
  if (group.students.length) {
    container.innerHTML = group.students.map(s => `
      <div class="student-full-item" data-student-id="${s.id}">
        <div class="student-info"><strong>${s.child_name}</strong> (${s.child_age||'—'} л.)<br><small>${s.parent_name||''} ${s.phone_number||''}</small></div>
        <button class="btn-icon remove-student"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
    noMsg.style.display = 'none';
    container.querySelectorAll('.remove-student').forEach(btn => btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.closest('.student-full-item').dataset.studentId;
      await supabase.from('students').update({ group_id: null }).eq('id', id);
      group.students = group.students.filter(s => s.id !== id);
      populateStudentsTab(modal, group);
    }));
  } else {
    container.innerHTML = '';
    noMsg.style.display = 'block';
  }
  modal.querySelector('#addStudentToGroupBtn').onclick = () => showAddStudentModal(group.id, modal);
}

function populateLessonsTab(modal, group) {
  const container = modal.querySelector('#tabGroupLessons .lessons-list-full');
  const noMsg = modal.querySelector('.no-lessons-tab');
  if (group.lessons.length) {
    container.innerHTML = group.lessons.map(l => `
      <div class="lesson-full-item" data-lesson-id="${l.id}">
        <div class="lesson-info"><strong>${new Date(l.lesson_date).toLocaleString('ru-RU')}</strong><br><small>${l.topic||'—'}</small></div>
        <button class="btn-icon delete-lesson"><i class="fas fa-trash"></i></button>
      </div>
    `).join('');
    noMsg.style.display = 'none';
    container.querySelectorAll('.delete-lesson').forEach(btn => btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.closest('.lesson-full-item').dataset.lessonId;
      if (!confirm('Удалить урок?')) return;
      await supabase.from('lessons').delete().eq('id', id);
      group.lessons = group.lessons.filter(l => l.id !== id);
      populateLessonsTab(modal, group);
    }));
  } else {
    container.innerHTML = '';
    noMsg.style.display = 'block';
  }
  modal.querySelector('#scheduleLessonInGroupBtn').onclick = () => openScheduleLessonModal(group.id, group.group_name);
}

async function showAddStudentModal(groupId, parentModal) {
  const { data: students } = await supabase.from('students').select('id, child_name').eq('teacher_id', getCurrentUser().id).is('group_id', null);
  if (!students?.length) return alert('Нет свободных учеников');
  const modal = document.createElement('div');
  modal.className = 'modal add-student';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Добавить ученика</h3>
      <select id="studentSelect">${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}</select>
      <div class="modal-actions">
        <button class="btn btn-primary" id="confirmAddStudent">Добавить</button>
        <button class="btn btn-secondary close-modal">Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#confirmAddStudent').addEventListener('click', async () => {
    const select = modal.querySelector('#studentSelect');
    await supabase.from('students').update({ group_id: groupId }).eq('id', select.value);
    modal.remove();
    parentModal.remove();
    await fetchGroupsFull();
    openFullGroupCard(groupId);
  });
}

function openScheduleLessonModal(groupId, groupName) {
    if (document.querySelector('.modal.schedule-lesson')) return;
    const modal = document.createElement('div');
    modal.className = 'modal schedule-lesson';
    modal.innerHTML = `
      <div class="modal-card">
        <h3>Назначить урок для "${groupName}"</h3>
        <form id="quickLessonForm">
          <div class="form-group"><label>Дата и время *</label><input type="datetime-local" id="lessonDate" required></div>
          <div class="form-group"><label>Тема</label><input id="lessonTopic" placeholder="Например: Уравнения"></div>
          <div id="quickLessonFormError" class="error-message"></div>
          <div class="modal-actions">
            <button type="submit" class="btn btn-success">Создать урок</button>
            <button type="button" class="btn btn-secondary close-modal">Отмена</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.querySelector('#quickLessonForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dateInput = modal.querySelector('#lessonDate').value;
      const topic = modal.querySelector('#lessonTopic').value.trim() || null;
      const errDiv = modal.querySelector('#quickLessonFormError');
      if (!dateInput) { errDiv.textContent = 'Выберите дату'; return; }
  
      // === ИСПРАВЛЕНИЕ ЧАСОВОГО ПОЯСА ===
      const localDate = new Date(dateInput); // Интерпретируется как локальное время
      const utcDate = localDate.toISOString(); // Конвертируется в UTC для Supabase
  
      try {
        await supabase.from('lessons').insert({
          teacher_id: getCurrentUser().id,
          group_id: groupId,
          lesson_date: utcDate,
          topic
        });
        modal.remove();
        await fetchGroupsFull();
        renderGroupsView();
        const openModal = document.querySelector('.modal.group-full-details');
        if (openModal) {
          const updated = groupsList.find(g => g.id === groupId);
          if (updated) populateLessonsTab(openModal, updated);
        }
      } catch (err) { errDiv.textContent = err.message; }
    });
  }

function showCreateGroupModal() {
  const modal = document.createElement('div');
  modal.className = 'modal create-group';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Создать группу</h3>
      <form id="createGroupForm">
        <div class="form-group"><label>Название *</label><input id="newGroupName" required></div>
        <div class="form-group"><label>Предмет</label><input id="newGroupSubject"></div>
        <div id="createGroupError" class="error-message"></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Создать</button>
          <button type="button" class="btn btn-secondary close-modal">Отмена</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#createGroupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = modal.querySelector('#newGroupName').value.trim();
    if (!name) return modal.querySelector('#createGroupError').textContent = 'Введите название';
    const subject = modal.querySelector('#newGroupSubject').value.trim() || null;
    try {
      await supabase.from('student_groups').insert({ teacher_id: getCurrentUser().id, group_name: name, subject });
      modal.remove();
      await fetchGroupsFull();
      renderGroupsView();
    } catch (err) { modal.querySelector('#createGroupError').textContent = err.message; }
  });
}

function bindGroupEvents() {
  const { contentArea } = getDOMElements();
  contentArea.querySelector('#addGroupBtn')?.addEventListener('click', showCreateGroupModal);
  contentArea.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', (e) => {
    groupsCurrentView = e.target.dataset.view;
    contentArea.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderGroupsView();
  }));
}

export async function fetchGroupsForSelect() {
  const { data } = await supabase.from('student_groups').select('id, group_name').eq('teacher_id', getCurrentUser().id).order('group_name');
  return data || [];
}