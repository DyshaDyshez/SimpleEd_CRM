// modules/groups.js
import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate } from './ui.js';
import { getCurrentUser } from './auth.js';
import { openStudentCard } from './students.js';

let groupsList = [];
let groupsCurrentView = 'cards';
let groupsLoaded = false; // флаг кэширования

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initGroupsPage() {
  try {
    if (!groupsLoaded) {
      await fetchGroupsFull();
      groupsLoaded = true;
    }
    renderGroupsView();
    bindGroupEvents();
  } catch (error) {
    console.error(error);
    alert('Ошибка загрузки групп');
  }
}

// ==================== ЗАГРУЗКА ДАННЫХ ГРУПП ====================
async function fetchGroupsFull() {
  const { data, error } = await supabase
    .from('student_groups')
    .select('*')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  if (error) throw error;

  groupsList = await Promise.all(data.map(async (group) => {
    const { data: students } = await supabase
      .from('students')
      .select('id, child_name, child_age, parent_name, phone_number, status, parent_pain')
      .eq('group_id', group.id);
    group.students = students || [];

    const { data: lessons } = await supabase
      .from('lessons')
      .select('id, lesson_date, topic, status, notes')
      .eq('group_id', group.id)
      .order('lesson_date', { ascending: true });
    group.lessons = lessons || [];

    const now = new Date().toISOString();
    group.nextLesson = lessons?.find(l => l.lesson_date >= now) || null;

    await Promise.all(group.students.map(async (student) => {
      const [{ data: payments }, { data: studentLessons }] = await Promise.all([
        supabase.from('payments').select('lessons_paid').eq('student_id', student.id),
        supabase.from('lessons').select('id').eq('student_id', student.id).eq('status', 'completed')
      ]);
      const totalPaid = (payments || []).reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
      const totalCompleted = (studentLessons || []).length;
      student.paidLessons = totalPaid;
      student.completedLessons = totalCompleted;
      student.balance = totalPaid - totalCompleted;
    }));

    return group;
  }));
}

// Сброс кэша (вызывать после изменений)
export function resetGroupsCache() {
  groupsLoaded = false;
}

// ==================== РЕНДЕРИНГ ====================
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
  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead><tr><th>Название</th><th>Предмет</th><th>Учеников</th><th></th></tr></thead>
        <tbody>${groupsList.map(g => `<tr><td>${g.group_name}</td><td>${g.subject||'—'}</td><td>${g.students.length}</td>
          <td><button class="btn-icon delete-group" data-id="${g.id}"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="4">Нет групп</td></tr>'}</tbody>
      </table>
    </div>
  `;
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

// ==================== УДАЛЕНИЕ ГРУППЫ ====================
async function deleteGroupById(id) {
  if (!confirm('Удалить группу?')) return;
  await supabase.from('student_groups').delete().eq('id', id);
  resetGroupsCache();
  await fetchGroupsFull();
  renderGroupsView();
  // Сбрасываем кэш групп
if (typeof window.resetGroupsCache === 'function') {
  window.resetGroupsCache();
}
// Обновляем страницу учеников (могут измениться группы у учеников)
if (typeof window.resetStudentsCache === 'function') {
  window.resetStudentsCache();
}
// Обновляем таблицу уроков
if (window.updateAllLessonsTable) window.updateAllLessonsTable();
}

// ==================== ПОЛНАЯ КАРТОЧКА ГРУППЫ ====================
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
  const groupNotesEl = modal.querySelector('#groupNotes');
  if (groupNotesEl) groupNotesEl.value = group.notes || '';

  populateStudentsTab(modal, group);
  populateLessonsTab(modal, group);
  populateGroupLessonsTab(modal, group);

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
    const notes = modal.querySelector('#groupNotes')?.value.trim() || null;
    await supabase.from('student_groups').update({ group_name: name, subject, notes }).eq('id', groupId);
    modal.remove();
    resetGroupsCache();
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
    container.innerHTML = group.students.map(s => {
      const balance = s.balance || 0;
      const icon = balance > 0 ? '🟢' : balance < 0 ? '🔴' : '⚪';
      return `
        <div class="student-full-item" data-student-id="${s.id}">
          <div class="student-info">
            <strong>${icon} ${s.child_name}</strong> (${s.child_age||'—'} л.)<br>
            <small>Баланс: ${balance} урок(ов)</small><br>
            <small>${s.parent_name||''} ${s.phone_number||''}</small>
          </div>
          <div>
            <button class="btn-icon open-student-from-group" title="Открыть ученика"><i class="fas fa-eye"></i></button>
            <button class="btn-icon remove-student" title="Убрать из группы"><i class="fas fa-times"></i></button>
          </div>
        </div>
      `;
    }).join('');
    noMsg.style.display = 'none';
    
    // Открыть ученика
    container.querySelectorAll('.open-student-from-group').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.student-full-item').dataset.studentId;
        openStudentCard(id);
      });
    });
    
    // Удалить из группы
    container.querySelectorAll('.remove-student').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.closest('.student-full-item').dataset.studentId;
        
        // Обновляем в базе
        await supabase.from('students').update({ group_id: null }).eq('id', id);
        
        // Обновляем локальные данные
        group.students = group.students.filter(s => s.id !== id);
        
        // Перерисовываем вкладку
        populateStudentsTab(modal, group);
        
        // Сбрасываем кэш
        resetGroupsCache();
        
        // Обновляем карточки на странице
        renderGroupsView();
        
        // Сбрасываем кэш учеников
        if (typeof window.resetStudentsCache === 'function') {
          window.resetStudentsCache();
        }
      });
    });
  } else {
    container.innerHTML = '';
    noMsg.style.display = 'block';
  }
  
  modal.querySelector('#addStudentToGroupBtn').onclick = () => showAddStudentModal(group.id, modal);
}

function populateGroupLessonsTab(modal, group) {
  const container = modal.querySelector('#tabGroupLessons .lessons-list-full');
  const noMsg = modal.querySelector('.no-lessons-tab');
  const completedLessons = (group.lessons || []).filter(l => l.status === 'completed');
  if (completedLessons.length) {
    container.innerHTML = completedLessons.map(l => `
      <div class="lesson-full-item" data-lesson-id="${l.id}">
        <div class="lesson-info"><strong>${new Date(l.lesson_date).toLocaleString('ru-RU')}</strong><br><small>${l.topic||'—'}</small><br><small>${l.notes||''}</small></div>
      </div>
    `).join('');
    noMsg.style.display = 'none';
  } else {
    container.innerHTML = '';
    noMsg.style.display = 'block';
  }
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
    container.querySelectorAll('.delete-lesson').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.closest('.lesson-full-item').dataset.lessonId;
        if (!confirm('Удалить урок?')) return;
        await supabase.from('lessons').delete().eq('id', id);
        group.lessons = group.lessons.filter(l => l.id !== id);
        populateLessonsTab(modal, group);
        populateGroupLessonsTab(modal, group);
        resetGroupsCache();
      });
    });
  } else {
    container.innerHTML = '';
    noMsg.style.display = 'block';
  }
  modal.querySelector('#scheduleLessonInGroupBtn').onclick = () => openScheduleLessonModal(group.id, group.group_name);
}



// ==================== ДОБАВЛЕНИЕ УЧЕНИКА В ГРУППУ ====================
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
    const select = modal.querySelector('#studentSelect');
    const studentId = select.value;
    
    // 1. Обновляем ученика в базе
    await supabase.from('students').update({ group_id: groupId }).eq('id', studentId);
    
    // 2. Закрываем модалку выбора ученика
    modal.remove();
    
    // 3. Закрываем родительскую модалку (карточку группы)
    parentModal.remove();
    
    // 4. Сбрасываем кэш и перезагружаем данные групп
    resetGroupsCache();
    await fetchGroupsFull();
    
    // 5. Обновляем карточки на странице групп
    renderGroupsView();
    
    // 6. Открываем карточку группы заново (с обновлёнными данными)
    // Небольшая задержка, чтобы DOM обновился
    setTimeout(() => {
      openFullGroupCard(groupId);
    }, 50);
    
    // 7. Сбрасываем кэш учеников
    if (typeof window.resetStudentsCache === 'function') {
      window.resetStudentsCache();
    }
  });
}

// ==================== НАЗНАЧЕНИЕ УРОКА ====================
import { openLessonForm } from './lessonForm.js';

// Вместо openScheduleLessonModal:
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
        <div class="form-group"><label>Заметки</label><textarea id="lessonNotes" rows="2"></textarea></div>
        <div id="quickLessonFormError" class="error-message"></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">Создать</button>
          <button type="button" class="btn btn-secondary close-modal">Отмена</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());

  modal.querySelector('#quickLessonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = modal.querySelector('#lessonDate').value;
    const topic = modal.querySelector('#lessonTopic').value.trim() || null;
    const notes = modal.querySelector('#lessonNotes').value.trim() || null;
    const errDiv = modal.querySelector('#quickLessonFormError');
    
    if (!date) {
      errDiv.textContent = 'Выберите дату';
      return;
    }

    const localDate = new Date(date);
    const adjustedDate = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000));
    const utcDate = adjustedDate.toISOString();

    try {
      // Создаём урок
      const { data: newLesson, error } = await supabase
        .from('lessons')
        .insert({
          teacher_id: getCurrentUser().id,
          group_id: groupId,
          lesson_date: utcDate,
          topic,
          notes,
          status: 'planned'
        })
        .select()
        .single();

      if (error) throw error;

      modal.remove();

      // Обновляем кэш групп
      await fetchGroupsFull();
      renderGroupsView();

      // Обновляем открытую карточку группы
      const openModal = document.querySelector('.modal.group-full-details');
      if (openModal) {
        const updatedGroup = groupsList.find(g => g.id === groupId);
        if (updatedGroup) {
          populateLessonsTab(openModal, updatedGroup);
          populateGroupLessonsTab(openModal, updatedGroup);
        }
      }
    } catch (err) {
      errDiv.textContent = err.message;
    }
  });
}

// ==================== СОЗДАНИЕ ГРУППЫ ====================
function showCreateGroupModal() {
  const modal = document.createElement('div');
  modal.className = 'modal create-group';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Создать группу</h3>
      <form id="createGroupForm">
        <div class="form-group"><label>Название *</label><input id="newGroupName" required></div>
        <div class="form-group"><label>Предмет</label><input id="newGroupSubject"></div>
        <div class="form-group"><label>Заметки</label><textarea id="newGroupNotes"></textarea></div>
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
    const notes = modal.querySelector('#newGroupNotes').value.trim() || null;
    try {
      await supabase.from('student_groups').insert({
        teacher_id: getCurrentUser().id,
        group_name: name,
        subject,
        notes
      });
      modal.remove();
      resetGroupsCache();
      await fetchGroupsFull();
      renderGroupsView();
    } catch (err) { modal.querySelector('#createGroupError').textContent = err.message; }
  });
}

// ==================== ПРИВЯЗКА СОБЫТИЙ ====================
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