// modules/groups.js
// ВРЕМЕННО: откат к стабильной версии с прямыми вызовами supabase

import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate } from './ui.js';
import { getCurrentUser } from './auth.js';

// --- Состояние ---
let groupsList = [];
let groupsCurrentView = 'cards';

// --- Инициализация ---
export async function initGroupsPage() {
  console.log("Инициализация страницы групп...");
  try {
    await fetchGroupsFull();
    renderGroupsView();
    bindGroupEvents();
    console.log("Страница групп инициализирована.");
  } catch (error) {
    console.error('Ошибка инициализации страницы групп:', error);
    alert('Ошибка загрузки данных групп');
  }
}

// --- Загрузка данных ---
async function fetchGroupsFull() {
  console.log("Загрузка данных групп...");
  const { data, error } = await supabase
    .from('student_groups')
    .select('*')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');

  if (error) throw error;

  groupsList = await Promise.all(data.map(async (group) => {
    // Ученики
    const { data: students } = await supabase
      .from('students')
      .select('id, child_name, child_age, parent_name, phone_number')
      .eq('group_id', group.id);
    group.students = students || [];

    // Все уроки
    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, lesson_date, topic')
      .eq('group_id', group.id)
      .order('lesson_date', { ascending: true });
    group.lessons = lessons || [];

    const now = new Date().toISOString();
    group.nextLesson = lessons?.find(l => l.lesson_date >= now) || null;

    return group;
  }));

  console.log("Данные групп загружены.");
}

// --- Рендеринг ---
function renderGroupsView() {
  const { contentArea } = getDOMElements();
  const container = contentArea.querySelector('#groupsViewContainer');
  if (!container) return;

  if (groupsCurrentView === 'cards') {
    renderGroupsAsCards(container);
  } else {
    renderGroupsAsTable(container);
  }
}

function renderGroupsAsCards(container) {
  container.innerHTML = '<div class="groups-grid"></div>';
  const grid = container.querySelector('.groups-grid');
  groupsList.forEach(group => {
    const card = createGroupCard(group);
    grid.appendChild(card);
  });
}

function renderGroupsAsTable(container) {
  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead><tr><th>Название</th><th>Предмет</th><th>Учеников</th><th></th></tr></thead>
        <tbody id="groupsTableBody"></tbody>
      </table>
    </div>
  `;
  loadGroupsTableBody();
}

function loadGroupsTableBody() {
  const tbody = document.getElementById('groupsTableBody');
  if (!tbody) return;
  tbody.innerHTML = groupsList.map(group => `
    <tr>
      <td>${group.group_name}</td>
      <td>${group.subject || '—'}</td>
      <td>${group.students.length}</td>
      <td>
        <button class="btn-icon delete-group" data-id="${group.id}" title="Удалить">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4">Нет групп</td></tr>';

  tbody.querySelectorAll('.delete-group').forEach(btn => {
    btn.addEventListener('click', () => deleteGroupById(btn.dataset.id));
  });
}

// --- Создание карточки группы (проверенная версия) ---
function createGroupCard(group) {
  const template = getTemplate('groupCard');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.group-card');
  card.dataset.id = group.id;

  card.querySelector('.group-name').textContent = group.group_name;
  card.querySelector('.group-subject').textContent = group.subject || 'Без предмета';
  card.querySelector('.students-count').textContent = group.students.length;

  const nextLessonEl = card.querySelector('.next-lesson');
  if (group.nextLesson) {
    nextLessonEl.textContent = new Date(group.nextLesson.lesson_date).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  } else {
    nextLessonEl.textContent = 'Нет занятий';
  }

  const preview = card.querySelector('.group-students-preview');
  preview.innerHTML = '';
  const studentsToShow = group.students.slice(0, 3);
  if (studentsToShow.length) {
    studentsToShow.forEach(s => {
      const item = document.createElement('div');
      item.className = 'student-preview-item';
      item.innerHTML = `<span>${s.child_name}</span><span>${s.child_age || '—'} лет</span>`;
      preview.appendChild(item);
    });
  } else {
    preview.innerHTML = '<div class="no-students">Нет учеников</div>';
  }

  // Привязка событий
  card.querySelector('.open-full-group').addEventListener('click', () => openFullGroupCard(group.id));
  card.querySelector('.delete-group').addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm(`Удалить группу "${group.group_name}"?`)) {
      deleteGroupById(group.id);
    }
  });
  card.querySelector('.schedule-lesson-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openScheduleLessonModal(group.id, group.group_name);
  });

  return card;
}

// --- Удаление группы ---
async function deleteGroupById(id) {
  const { error } = await supabase.from('student_groups').delete().eq('id', id);
  if (error) {
    alert(`Ошибка удаления: ${error.message}`);
    return;
  }
  await fetchGroupsFull();
  renderGroupsView();
}

// --- Открытие полной карточки ---
export async function openFullGroupCard(groupId) {
  if (document.querySelector('.modal.group-full-details')) return;

  const group = groupsList.find(g => g.id === groupId);
  if (!group) {
    alert('Группа не найдена');
    return;
  }

  const template = getTemplate('groupFullCard');
  const clone = template.content.cloneNode(true);
  const modal = clone.querySelector('.modal');
  modal.classList.add('group-full-details');
  document.body.appendChild(modal);

  document.getElementById('fullGroupName').textContent = group.group_name;

  populateInfoTab(modal, group);
  populateStudentsTab(modal, group);
  populateLessonsTab(modal, group);

  // Вкладки
  modal.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      modal.querySelector(`#tabGroup${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
    });
  });

  // Сохранение
  modal.querySelector('#saveFullGroup').addEventListener('click', async () => {
    const name = modal.querySelector('#editGroupName').value.trim();
    if (!name) return alert('Введите название');
    const subject = modal.querySelector('#editGroupSubject').value.trim() || null;
    const { error } = await supabase
      .from('student_groups')
      .update({ group_name: name, subject })
      .eq('id', groupId);
    if (error) return alert(`Ошибка: ${error.message}`);
    modal.remove();
    await fetchGroupsFull();
    renderGroupsView();
  });

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function populateInfoTab(modal, group) {
  modal.querySelector('#editGroupName').value = group.group_name;
  modal.querySelector('#editGroupSubject').value = group.subject || '';
}

function populateStudentsTab(modal, group) {
  const container = modal.querySelector('#tabGroupStudents .students-list-full');
  const noMsg = modal.querySelector('#tabGroupStudents .no-students-tab');

  if (group.students.length) {
    container.innerHTML = group.students.map(s => `
      <div class="student-full-item" data-student-id="${s.id}">
        <div class="student-info"><strong>${s.child_name}</strong> (${s.child_age || '—'} л.)<br><small>${s.parent_name || ''} ${s.phone_number || ''}</small></div>
        <button class="btn-icon remove-student"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
    noMsg.classList.add('hidden');

    container.querySelectorAll('.remove-student').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.closest('.student-full-item').dataset.studentId;
        await supabase.from('students').update({ group_id: null }).eq('id', id);
        group.students = group.students.filter(s => s.id !== id);
        populateStudentsTab(modal, group);
      });
    });
  } else {
    container.innerHTML = '';
    noMsg.classList.remove('hidden');
  }

  modal.querySelector('#addStudentToGroupBtn').onclick = () => showAddStudentModal(group.id, modal);
}

function populateLessonsTab(modal, group) {
  const container = modal.querySelector('#tabGroupLessons .lessons-list-full');
  const noMsg = modal.querySelector('#tabGroupLessons .no-lessons-tab');

  if (group.lessons.length) {
    container.innerHTML = group.lessons.map(l => `
      <div class="lesson-full-item" data-lesson-id="${l.id}">
        <div class="lesson-info"><strong>${new Date(l.lesson_date).toLocaleString('ru-RU')}</strong><br><small>${l.topic || '—'}</small></div>
        <button class="btn-icon delete-lesson"><i class="fas fa-trash"></i></button>
      </div>
    `).join('');
    noMsg.classList.add('hidden');

    container.querySelectorAll('.delete-lesson').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const lessonId = e.currentTarget.closest('.lesson-full-item').dataset.lessonId;
        if (!confirm('Удалить урок?')) return;
        await supabase.from('lessons').delete().eq('id', lessonId);
        group.lessons = group.lessons.filter(l => l.id !== lessonId);
        populateLessonsTab(modal, group);
      });
    });
  } else {
    container.innerHTML = '';
    noMsg.classList.remove('hidden');
  }

  modal.querySelector('#scheduleLessonInGroupBtn').onclick = () => openScheduleLessonModal(group.id, group.group_name);
}

// --- Добавление ученика ---
async function showAddStudentModal(groupId, parentModal) {
  const { data: students } = await supabase
    .from('students')
    .select('id, child_name')
    .eq('teacher_id', getCurrentUser().id)
    .is('group_id', null);

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
    const studentId = modal.querySelector('#studentSelect').value;
    await supabase.from('students').update({ group_id: groupId }).eq('id', studentId);
    modal.remove();
    parentModal.remove();
    await fetchGroupsFull();
    openFullGroupCard(groupId);
  });
}

// --- Назначение урока (ИСПРАВЛЕНО) ---
function openScheduleLessonModal(groupId, groupName) {
  if (document.querySelector('.modal.schedule-lesson')) return;

  const modal = document.createElement('div');
  modal.className = 'modal schedule-lesson';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Назначить урок для "${groupName}"</h3>
      <form id="quickLessonForm">
        <div class="form-group">
          <label>Дата и время *</label>
          <input type="datetime-local" id="lessonDate" required>
        </div>
        <div class="form-group">
          <label>Тема</label>
          <input type="text" id="lessonTopic" placeholder="Например: Уравнения">
        </div>
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
    const errorDiv = modal.querySelector('#quickLessonFormError');
    const lessonDate = modal.querySelector('#lessonDate').value;
    const topic = modal.querySelector('#lessonTopic').value.trim() || null;

    if (!lessonDate) {
      errorDiv.textContent = 'Выберите дату и время';
      return;
    }

    try {
      const { error } = await supabase
        .from('lessons')
        .insert({
          teacher_id: getCurrentUser().id,
          group_id: groupId,
          lesson_date: lessonDate,
          topic
        });
      if (error) throw error;
      modal.remove();
      await fetchGroupsFull();
      renderGroupsView();

      // Обновить открытую карточку, если есть
      const openModal = document.querySelector('.modal.group-full-details');
      if (openModal) {
        const updatedGroup = groupsList.find(g => g.id === groupId);
        if (updatedGroup) populateLessonsTab(openModal, updatedGroup);
      }
    } catch (err) {
      errorDiv.textContent = `Ошибка: ${err.message}`;
    }
  });
}

// --- Создание группы (упрощённо) ---
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
    const subject = modal.querySelector('#newGroupSubject').value.trim() || null;
    const errorDiv = modal.querySelector('#createGroupError');
    if (!name) {
      errorDiv.textContent = 'Введите название';
      return;
    }
    try {
      await supabase.from('student_groups').insert({
        teacher_id: getCurrentUser().id,
        group_name: name,
        subject
      });
      modal.remove();
      await fetchGroupsFull();
      renderGroupsView();
    } catch (err) {
      errorDiv.textContent = `Ошибка: ${err.message}`;
    }
  });
}

// --- Привязка событий страницы ---
function bindGroupEvents() {
  const { contentArea } = getDOMElements();
  contentArea.querySelector('#addGroupBtn')?.addEventListener('click', showCreateGroupModal);
  contentArea.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      groupsCurrentView = e.target.dataset.view;
      contentArea.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderGroupsView();
    });
  });
}

// --- Экспорт для других модулей ---
export async function fetchGroupsForSelect() {
  const { data } = await supabase
    .from('student_groups')
    .select('id, group_name')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  return data || [];
}