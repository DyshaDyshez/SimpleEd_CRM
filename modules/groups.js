// modules/groups.js

import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate, renderPage, showError, clearError } from './ui.js';
import { getCurrentUser } from './auth.js';

// --- Состояние ---
let groupsList = [];
let groupsCurrentView = 'cards'; // 'cards' или 'table'

// --- Инициализация ---
export async function initGroupsPage() {
  console.log("Инициализация страницы групп...");
  try {
    await fetchGroupsFull();
    renderGroupsView();
    bindGroupEvents(); // Привязываем события *после* рендера
    console.log("Страница групп инициализирована.");
  } catch (error) {
    console.error('Ошибка инициализации страницы групп:', error);
    showError('contentArea', `Ошибка загрузки данных групп: ${error.message}`);
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

  // Дополнительно загрузим информацию для карточек (ученики, след. урок)
  groupsList = await Promise.all(data.map(async (group) => {
    // Загрузка учеников
    const {  students } = await supabase
      .from('students')
      .select('id, child_name, child_age, parent_name, phone_number')
      .eq('group_id', group.id);
    group.students = students || [];

    // Загрузка следующего урока
    const now = new Date().toISOString();
    const {  lessons } = await supabase
      .from('lessons')
      .select('id, lesson_date, topic')
      .eq('group_id', group.id)
      .gte('lesson_date', now)
      .order('lesson_date', { ascending: true })
      .limit(1);
    group.nextLesson = lessons?.[0] || null; // Теперь это объект урока или null

    return group;
  }));

  console.log("Данные групп загружены и обогащены.");
}

// --- Рендеринг ---
function renderGroupsView() {
  console.log("Рендеринг представления групп...");
  const { contentArea } = getDOMElements();
  const container = contentArea.querySelector('#groupsViewContainer');
  if (!container) {
    console.error("Контейнер #groupsViewContainer не найден!");
    return;
  }

  if (groupsCurrentView === 'cards') {
    renderGroupsAsCards(container);
  } else {
    renderGroupsAsTable(container);
  }
}

function renderGroupsAsCards(container) {
  console.log("Рендеринг карточек групп...");
  container.innerHTML = '<div class="groups-grid"></div>';
  const grid = container.querySelector('.groups-grid');

  groupsList.forEach(group => {
    const cardElement = createGroupCard(group);
    grid.appendChild(cardElement);
  });
}

function renderGroupsAsTable(container) {
  console.log("Рендеринг таблицы групп...");
  container.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Название</th>
            <th>Предмет</th>
            <th>Учеников</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody id="groupsTableBody"></tbody>
      </table>
    </div>
  `;
  loadGroupsTableIntoExistingTbody();
}

async function loadGroupsTableIntoExistingTbody() {
  const tbody = document.getElementById('groupsTableBody');
  if (!tbody) return;

  tbody.innerHTML = groupsList
    .map(group => `
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
    `)
    .join('') || '<tr><td colspan="4">Нет групп</td></tr>';

  // Привязка событий удаления к НОВОМУ содержимому tbody
  tbody.querySelectorAll('.delete-group').forEach(btn => {
    btn.removeEventListener('click', handleDeleteGroupClickFromTable); // Удаляем старый обработчик
    btn.addEventListener('click', handleDeleteGroupClickFromTable); // Добавляем новый
  });
}

function handleDeleteGroupClickFromTable(e) {
    const id = e.target.closest('button').dataset.id;
    deleteGroupById(id);
}

// --- Создание карточки ---
function createGroupCard(group) {
  console.log("Создание карточки для группы:", group.group_name);
  const template = getTemplate('groupCard');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.group-card');
  card.dataset.id = group.id; // Храним ID в data-атрибуте

  // Заполняем карточку данными
  card.querySelector('.group-name').textContent = group.group_name;
  card.querySelector('.group-subject').textContent = group.subject || 'Без предмета';
  card.querySelector('.students-count').textContent = group.students.length;

  const nextLessonEl = card.querySelector('.next-lesson');
  if (group.nextLesson) {
    nextLessonEl.textContent = new Date(group.nextLesson.lesson_date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    nextLessonEl.textContent = 'Нет занятий';
  }

  // Заполняем превью учеников
  const preview = card.querySelector('.group-students-preview');
  preview.innerHTML = ''; // Очищаем "Нет учеников"
  const studentsToShow = group.students.slice(0, 3);
  if (studentsToShow.length > 0) {
    studentsToShow.forEach(student => {
      const item = document.createElement('div');
      item.className = 'student-preview-item';
      item.innerHTML = `<span>${student.child_name}</span><span>${student.child_age || '—'} лет</span>`;
      preview.appendChild(item);
    });
  } else {
    preview.innerHTML = '<div class="no-students">Нет учеников</div>';
  }

  // --- Привязка событий к элементам карточки ---
  // Используем replaceWith для "обнуления" обработчиков, как раньше
  const openBtn = card.querySelector('.open-full-group');
  openBtn.replaceWith(openBtn.cloneNode(true));
  card.querySelector('.open-full-group').addEventListener('click', () => openFullGroupCard(group.id));

  const deleteBtn = card.querySelector('.delete-group');
  deleteBtn.replaceWith(deleteBtn.cloneNode(true));
  card.querySelector('.delete-group').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm('Удалить группу "' + group.group_name + '"?')) {
      await deleteGroupById(group.id);
      await fetchGroupsFull();
      renderGroupsView();
    }
  });

  const scheduleBtn = card.querySelector('.schedule-lesson-btn');
  scheduleBtn.replaceWith(scheduleBtn.cloneNode(true));
  card.querySelector('.schedule-lesson-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    openScheduleLessonModal(group.id, group.group_name);
  });

  return card;
}

// --- Взаимодействие ---

// Удаление группы
async function deleteGroupById(id) {
  console.log("Удаление группы с ID:", id);
  const { error } = await supabase.from('student_groups').delete().eq('id', id);
  if (error) {
    console.error('Ошибка удаления группы:', error);
    alert(`Ошибка удаления: ${error.message}`);
    return;
  }
  console.log("Группа удалена.");
  // Обновить список после удаления
  await fetchGroupsFull();
  renderGroupsView();
}

// Открытие модального окна полной карточки
export async function openFullGroupCard(groupId) {
  console.log("Открытие полной карточки для группы ID:", groupId);
  // Проверка, открыто ли уже окно
  if (document.querySelector('.modal.group-full-details')) {
      console.warn("Модальное окно уже открыто.");
      return;
  }

  try {
    const group = groupsList.find(g => g.id === groupId);
    if (!group) {
      alert('Группа не найдена в кэше. Перезагрузите страницу.');
      return;
    }

    const template = getTemplate('groupFullCard'); // <-- ПРАВИЛЬНО
    const clone = template.content.cloneNode(true);
    const modal = clone.querySelector('.modal');
    modal.classList.add('group-full-details');
    document.body.appendChild(modal);

    // Заполнение заголовка
    document.getElementById('fullGroupName').textContent = group.group_name;

    // --- Заполнение вкладок ---
    await populateTabInfo(modal, group);
    await populateTabStudents(modal, groupId);
    await populateTabLessons(modal, groupId);

    // --- Инициализация переключения вкладок ---
    initializeTabSwitching(modal);

    // --- Обработчик сохранения ---
    const saveBtn = modal.querySelector('#saveFullGroup');
    saveBtn.replaceWith(saveBtn.cloneNode(true)); // Обнулить
    modal.querySelector('#saveFullGroup').addEventListener('click', async () => {
        await saveGroupInfo(modal, groupId);
    });

    // --- Обработчики закрытия ---
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  } catch (error) {
    console.error('Ошибка открытия полной карточки:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

async function populateTabInfo(modal, group) {
  const infoTab = modal.querySelector('#tabGroupInfo');
  // Форма уже в шаблоне, просто заполняем поля
  modal.querySelector('#editGroupName').value = group.group_name;
  modal.querySelector('#editGroupSubject').value = group.subject || '';
}

async function populateTabStudents(modal, groupId) {
  const studentsTab = modal.querySelector('#tabGroupStudents');
  const group = groupsList.find(g => g.id === groupId);
  const studentsListDiv = studentsTab.querySelector('.students-list-full');
  const noStudentsP = studentsTab.querySelector('.no-students-tab');

  if (group && group.students && group.students.length > 0) {
    studentsListDiv.innerHTML = group.students.map(s => `
      <div class="student-full-item" data-student-id="${s.id}">
        <div class="student-info">
            <strong>${s.child_name}</strong> (${s.child_age || '—'} л.)
            <br>
            <small>${s.parent_name || ''} ${s.phone_number || ''}</small>
        </div>
        <button class="btn-icon remove-from-group" title="Убрать из группы">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');
    noStudentsP.classList.add('hidden'); // Скрываем сообщение "Нет учеников"
    // Привязка обработчиков удаления
    studentsListDiv.querySelectorAll('.remove-from-group').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true)); // Обнулить
        btn = studentsListDiv.querySelector(`.student-full-item[data-student-id="${btn.closest('.student-full-item').dataset.studentId}"] .remove-from-group`); // Найти заново
        btn.addEventListener('click', async (e) => {
            const studentId = e.target.closest('.student-full-item').dataset.studentId;
            await removeFromGroup(studentId, groupId);
            // Перезагрузить вкладку после удаления
            await populateTabStudents(modal, groupId);
        });
    });
  } else {
    studentsListDiv.innerHTML = '';
    noStudentsP.classList.remove('hidden'); // Показываем сообщение "Нет учеников"
  }

  // Привязка кнопки добавления
  const addBtn = modal.querySelector('#addStudentToGroupBtn');
  addBtn.replaceWith(addBtn.cloneNode(true)); // Обнулить
  modal.querySelector('#addStudentToGroupBtn').addEventListener('click', () => showAddStudentModal(groupId, modal));
}

async function populateTabLessons(modal, groupId) {
  const lessonsTab = modal.querySelector('#tabGroupLessons');
  const group = groupsList.find(g => g.id === groupId);
  const lessonsListDiv = lessonsTab.querySelector('.lessons-list-full');
  const noLessonsP = lessonsTab.querySelector('.no-lessons-tab');

  if (group && group.lessons && group.lessons.length > 0) {
    lessonsListDiv.innerHTML = group.lessons.map(l => `
      <div class="lesson-full-item" data-lesson-id="${l.id}">
        <div class="lesson-info">
            <strong>${new Date(l.lesson_date).toLocaleString('ru-RU')}</strong>
            <br>
            <small>Тема: ${l.topic || '—'}</small>
        </div>
        <button class="btn-icon delete-lesson" title="Удалить урок">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `).join('');
    noLessonsP.classList.add('hidden'); // Скрываем сообщение "Нет уроков"
    // Привязка обработчиков удаления урока
    lessonsListDiv.querySelectorAll('.delete-lesson').forEach(btn => {
        btn.replaceWith(btn.cloneNode(true)); // Обнулить
        btn = lessonsListDiv.querySelector(`.lesson-full-item[data-lesson-id="${btn.closest('.lesson-full-item').dataset.lessonId}"] .delete-lesson`); // Найти заново
        btn.addEventListener('click', async (e) => {
            const lessonId = e.target.closest('.lesson-full-item').dataset.lessonId;
            await deleteLesson(lessonId, groupId);
            // Перезагрузить вкладку после удаления
            await populateTabLessons(modal, groupId);
        });
    });
  } else {
    lessonsListDiv.innerHTML = '';
    noLessonsP.classList.remove('hidden'); // Показываем сообщение "Нет уроков"
  }

  // Привязка кнопки планирования
  const scheduleBtn = modal.querySelector('#scheduleLessonInGroupBtn');
  scheduleBtn.replaceWith(scheduleBtn.cloneNode(true)); // Обнулить
  modal.querySelector('#scheduleLessonInGroupBtn').addEventListener('click', () => openScheduleLessonModal(groupId, modal.querySelector('#fullGroupName').textContent));
}

function initializeTabSwitching(modal) {
    const tabs = modal.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.replaceWith(tab.cloneNode(true)); // Обнулить
        tab = modal.querySelector(`.tab[data-tab="${tab.dataset.tab}"]`); // Найти заново
        tab.addEventListener('click', () => {
            // Убираем активные классы
            tabs.forEach(t => t.classList.remove('active'));
            modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            // Добавляем активный класс нажатой вкладке
            tab.classList.add('active');

            // Показываем соответствующий контент
            const tabName = tab.dataset.tab;
            const targetId = `tabGroup${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
            const targetContent = modal.querySelector(`#${targetId}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

async function saveGroupInfo(modal, groupId) {
  const name = modal.querySelector('#editGroupName').value.trim();
  const subject = modal.querySelector('#editGroupSubject').value.trim() || null;

  if (!name) {
     alert("Введите название группы.");
     return;
  }

  try {
    const { error } = await supabase
      .from('student_groups')
      .update({ group_name: name, subject: subject })
      .eq('id', groupId);

    if (error) throw error;

    modal.remove(); // Закрываем окно
    await fetchGroupsFull(); // Обновляем данные
    renderGroupsView(); // Перерисовываем список
    console.log("Информация о группе сохранена.");
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    alert(`Ошибка сохранения: ${error.message}`);
  }
}

async function removeFromGroup(studentId, groupId) {
  try {
    const { error } = await supabase
      .from('students')
      .update({ group_id: null })
      .eq('id', studentId);

    if (error) throw error;
    console.log("Ученик удалён из группы.");

    // Обновить кэш
    const group = groupsList.find(g => g.id === groupId);
    if (group) {
        group.students = group.students.filter(s => s.id !== studentId);
    }
  } catch (error) {
    console.error('Ошибка удаления из группы:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

async function deleteLesson(lessonId, groupId) {
  try {
    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', lessonId);

    if (error) throw error;
    console.log("Урок удалён.");

    // Обновить кэш
    const group = groupsList.find(g => g.id === groupId);
    if (group) {
        group.lessons = group.lessons.filter(l => l.id !== lessonId);
        // Обновить nextLesson, если удалили ближайший
        if (group.nextLesson && group.nextLesson.id === lessonId) {
             group.nextLesson = group.lessons
                .filter(l => new Date(l.lesson_date) >= new Date())
                .sort((a, b) => new Date(a.lesson_date) - new Date(b.lesson_date))[0] || null;
        }
    }
  } catch (error) {
    console.error('Ошибка удаления урока:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

async function showAddStudentModal(groupId, parentModal) {
  // Проверка на дублирование
  if (document.querySelector('.modal.add-student')) {
      console.warn("Модальное окно добавления ученика уже открыто.");
      return;
  }

  try {
    const {  students } = await supabase
      .from('students')
      .select('id, child_name')
      .eq('teacher_id', getCurrentUser().id)
      .is('group_id', null); // Только свободные

    if (!students || students.length === 0) {
        alert("Нет свободных учеников для добавления.");
        return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal add-student';
    modal.innerHTML = `
      <div class="modal-card">
        <h3>Добавить ученика в группу</h3>
        <select id="studentSelect">
          ${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}
        </select>
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
        if (!studentId) return;

        try {
          const { error } = await supabase
            .from('students')
            .update({ group_id: groupId })
            .eq('id', studentId);

          if (error) throw error;

          modal.remove();
          parentModal.remove(); // Закрываем оба окна
          openFullGroupCard(groupId); // Открываем заново для обновления
          console.log("Ученик добавлен в группу.");
        } catch (error) {
          console.error('Ошибка добавления ученика:', error);
          alert(`Ошибка: ${error.message}`);
        }
    });

  } catch (error) {
    console.error('Ошибка загрузки учеников для добавления:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

// --- Модальное окно быстрого планирования (для карточки и вкладки) ---
function openScheduleLessonModal(groupId, groupName) {
  console.log("Открытие модального окна планирования для группы:", groupName);
  // Проверка на дублирование
  if (document.querySelector('.modal.schedule-lesson')) {
      console.warn("Модальное окно планирования уже открыто.");
      return;
  }

  const modal = document.createElement('div');
  modal.className = 'modal schedule-lesson';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Назначить урок для "${groupName}"</h3>
      <form id="quickLessonForm">
        <div class="form-group">
          <label for="lessonDate">Дата и время *</label>
          <input type="datetime-local" id="lessonDate" required>
        </div>
        <div class="form-group">
          <label for="lessonTopic">Тема</label>
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
    errorDiv.textContent = ''; // Очистить предыдущие ошибки

    const lessonDateValue = modal.querySelector('#lessonDate').value;
    const topicValue = modal.querySelector('#lessonTopic').value.trim();

    if (!lessonDateValue) {
      errorDiv.textContent = 'Выберите дату и время.';
      return;
    }

    const lessonData = {
      teacher_id: getCurrentUser().id,
      group_id: groupId,
      lesson_date: lessonDateValue,
      topic: topicValue || null,
    };

    try {
      const { data: insertedLesson, error } = await supabase.from('lessons').insert(lessonData).select().single();
      if (error) throw error;

      modal.remove();

      // Обновить кэш для открытой группы (если модальное окно открыто из неё)
      const group = groupsList.find(g => g.id === groupId);
      if (group) {
          group.lessons = group.lessons || [];
          group.lessons.push(insertedLesson);
          // Обновить nextLesson, если новый урок ближайший
          if (!group.nextLesson || new Date(insertedLesson.lesson_date) < new Date(group.nextLesson.lesson_date)) {
              group.nextLesson = insertedLesson;
          }
      }

      // Обновить список групп, чтобы отразилось "Следующее занятие"
      renderGroupsView(); // Перерисовываем карточки

      // Если модальное окно было открыто из вкладки "Расписание" полной карточки, обновим и её
      const openGroupModal = document.querySelector('.modal.group-full-details');
      if (openGroupModal && openGroupModal.querySelector('.tab.active[data-tab="lessons"]')) {
          const currentGroupId = Array.from(document.querySelectorAll('.group-card')).find(card => card.contains(openGroupModal.closest('body') ? openGroupModal : null))?.dataset.id;
          if (currentGroupId == groupId) { // Проверяем, что открыта карточка той же группы
              await populateTabLessons(openGroupModal, groupId);
          }
      }

      console.log("Урок создан.");
    } catch (err) {
      console.error('Ошибка создания урока:', err);
      errorDiv.textContent = `Ошибка: ${err.message}`;
    }
  });
}


// --- Обработчики событий ---
function handleCreateGroupClick() {
    // Логика создания группы (открытие формы, отправка данных в Supabase)
    // ...
    console.log("Кнопка 'Создать группу' нажата.");
    alert("Создание группы пока не реализовано в этом сниппете.");
}

function handleViewSwitchClick(e) {
    groupsCurrentView = e.target.dataset.view;
    // Обновляем активные кнопки
    const viewSwitchers = e.currentTarget.parentElement.querySelectorAll('[data-view]');
    viewSwitchers.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    // Перерисовываем представление
    renderGroupsView();
    console.log("Вид изменён на:", groupsCurrentView);
}

// Привязка основных событий (вызывается один раз при инициализации)
function bindGroupEvents() {
  console.log("Привязка событий на странице групп...");
  const { contentArea } = getDOMElements();

  // Кнопка "Создать группу"
  const addGroupBtn = contentArea.querySelector('#addGroupBtn');
  if (addGroupBtn) {
    addGroupBtn.removeEventListener('click', handleCreateGroupClick); // Удаляем старый
    addGroupBtn.addEventListener('click', handleCreateGroupClick);
  }

  // Переключение вида
  const viewSwitchers = contentArea.querySelectorAll('[data-view]');
  viewSwitchers.forEach(btn => {
    btn.removeEventListener('click', handleViewSwitchClick); // Удаляем старый
    btn.addEventListener('click', handleViewSwitchClick);
  });
}

// --- Экспорт ---
export async function fetchGroupsForSelect() {
  const { data } = await supabase
    .from('student_groups')
    .select('id, group_name')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  return data || [];
}