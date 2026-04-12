// modules/groups.js
import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate, renderPage, showError, clearError } from './ui.js';
import { getCurrentUser } from './auth.js';

// Глобальное состояние для модуля групп
let groupsList = [];
let groupsCurrentView = 'cards'; // 'cards' или 'table'

/**
 * Инициализирует страницу групп: загружает группы, рендерит вид и привязывает события.
 */
export async function initGroupsPage() {
  try {
    await fetchGroupsFull();
    renderGroupsView();
    bindGroupEvents();
  } catch (error) {
    console.error('Ошибка инициализации страницы групп:', error);
    showError('contentArea', 'Ошибка загрузки данных групп.');
  }
}

/**
 * Загружает полные данные всех групп текущего учителя.
 */
async function fetchGroupsFull() {
  const { data, error } = await supabase
    .from('student_groups')
    .select('*')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');

  if (error) throw error;

  groupsList = data || [];
}

/**
 * Рендерит текущий вид (карточки или таблицу) в контейнер.
 */
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

/**
 * Рендерит группы в виде карточек.
 * @param {HTMLElement} container - Контейнер для вставки карточек.
 */
async function renderGroupsAsCards(container) {
  // Загружаем детали для каждой группы (ученики, след. занятие)
  const groupsWithDetails = await enrichGroupsData(groupsList);

  // Создаём или находим .groups-grid
  let grid = container.querySelector('.groups-grid');
  if (!grid) {
    container.innerHTML = '<div class="groups-grid"></div>'; // Очищаем и создаём сетку
    grid = container.querySelector('.groups-grid');
  } else {
    grid.innerHTML = ''; // Если сетка уже есть, очищаем только её содержимое
  }

  groupsWithDetails.forEach(group => {
    const cardElement = createGroupCard(group);
    grid.appendChild(cardElement);
  });
}

/**
 * Рендерит группы в виде таблицы.
 * @param {HTMLElement} container - Контейнер для вставки таблицы.
 */
async function renderGroupsAsTable(container) {
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
  await loadGroupsTable();
}

/**
 * Загружает и отображает данные в таблице групп.
 */
async function loadGroupsTable() {
  const tbody = document.getElementById('groupsTableBody');
  if (!tbody) return;

  try {
    // Загружаем количество учеников в каждой группе
    const { data: studentCountsData, error } = await supabase
      .from('students')
      .select('group_id')
      .eq('teacher_id', getCurrentUser().id);

    if (error) throw error;

    // Подсчитываем
    const counts = {};
    studentCountsData?.forEach(row => {
      if (row.group_id) {
        counts[row.group_id] = (counts[row.group_id] || 0) + 1;
      }
    });

    // Генерируем строки таблицы
    tbody.innerHTML = groupsList
      .map(group => `
        <tr>
          <td>${group.group_name}</td>
          <td>${group.subject || '—'}</td>
          <td>${counts[group.id] || 0}</td>
          <td>
            <button class="btn-icon delete-group" data-id="${group.id}" title="Удалить">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `)
      .join('') || '<tr><td colspan="4">Нет групп</td></tr>';

    // Привязываем обработчики удаления
    document.querySelectorAll('.delete-group').forEach(btn =>
      btn.addEventListener('click', async e => {
        const id = e.target.closest('button').dataset.id;
        if (confirm('Удалить группу?')) {
          await deleteGroupById(id);
          await fetchGroupsFull(); // Обновляем список
          renderGroupsView(); // Обновляем отображение
        }
      })
    );

  } catch (error) {
    console.error('Ошибка загрузки таблицы групп:', error);
    tbody.innerHTML = `<tr><td colspan="4">Ошибка: ${error.message}</td></tr>`;
  }
}

/**
 * Удаляет группу по ID.
 * @param {string} id - ID группы.
 */
async function deleteGroupById(id) {
  const { error } = await supabase
    .from('student_groups')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Обогащает список групп информацией о количестве учеников и следующем занятии.
 * @param {Array} groups - Список групп.
 * @returns {Promise<Array>} - Список групп с дополнительными полями.
 */
async function enrichGroupsData(groups) {
  return await Promise.all(
    groups.map(async (group) => {
      // Загружаем учеников
      const { data: students } = await supabase
        .from('students')
        .select('id, child_name, child_age')
        .eq('group_id', group.id);

      // Загружаем следующее занятие (ближайшее в будущем)
      const now = new Date().toISOString();
      const { data: lessons } = await supabase
        .from('lessons')
        .select('lesson_date')
        .eq('group_id', group.id)
        .gte('lesson_date', now)
        .order('lesson_date', { ascending: true })
        .limit(1);

      return {
        ...group,
        students: students || [],
        studentsCount: students?.length || 0,
        nextLesson: lessons?.[0]?.lesson_date || null,
      };
    })
  );
}

/**
 * Создаёт DOM-элемент карточки группы.
 * @param {Object} group - Объект группы с обогащёнными данными.
 * @returns {HTMLElement} - Элемент карточки.
 */
function createGroupCard(group) {
  const template = getTemplate('groupCard');
  const clone = template.content.cloneNode(true);
  const card = clone.querySelector('.group-card');
  card.dataset.id = group.id;

  card.querySelector('.group-name').textContent = group.group_name;
  card.querySelector('.group-subject').textContent = group.subject || 'Без предмета';
  card.querySelector('.students-count').textContent = group.studentsCount;

  // Следующее занятие
  const nextLessonEl = card.querySelector('.next-lesson');
  if (group.nextLesson) {
    nextLessonEl.textContent = new Date(group.nextLesson).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    nextLessonEl.textContent = 'Нет занятий';
  }

  // Превью учеников
  const preview = card.querySelector('.group-students-preview');
  const students = group.students.slice(0, 3); // Только первые 3
  if (students.length > 0) {
    preview.innerHTML = students
      .map(s => `
        <div class="student-preview-item">
          <span>${s.child_name}</span>
          <span>${s.child_age ? s.child_age + ' лет' : ''}</span>
        </div>
      `)
      .join('');
  } else {
    preview.innerHTML = '<div class="no-students">Нет учеников</div>';
  }

  // Привязываем события
  card.querySelector('.open-full-group').addEventListener('click', () => openFullGroupCard(group.id));
  card.querySelector('.delete-group').addEventListener('click', async e => {
    e.stopPropagation(); // Чтобы карточка не открывалась при клике на кнопку
    if (confirm('Удалить группу?')) {
      await deleteGroupById(group.id);
      await fetchGroupsFull(); // Обновляем список
      renderGroupsView(); // Обновляем отображение
    }
  });

  return card;
}

/**
 * Открывает модальное окно с полной информацией о группе.
 * @param {string} groupId - ID группы.
 */
export async function openFullGroupCard(groupId) {
  try {
    const { data: group, error } = await supabase
      .from('student_groups')
      .select('*')
      .eq('id', groupId)
      .single();

    if (error) throw error;
    if (!group) {
      alert('Группа не найдена.');
      return;
    }

    const template = getTemplate('groupFullCard');
    const clone = template.content.cloneNode(true);
    document.body.appendChild(clone);

    const modal = document.querySelector('.modal');
    document.getElementById('fullGroupName').textContent = group.group_name;

    // --- Вкладка "Информация" ---
    const infoTab = document.getElementById('tabGroupInfo');
    infoTab.innerHTML = `
      <form id="groupInfoForm" class="form-card">
        <div class="form-grid">
          <div class="form-group">
            <label for="editGroupName">Название</label>
            <input type="text" id="editGroupName" value="${group.group_name}">
          </div>
          <div class="form-group">
            <label for="editGroupSubject">Предмет</label>
            <input type="text" id="editGroupSubject" value="${group.subject || ''}">
          </div>
        </div>
      </form>
    `;

    // --- Вкладка "Ученики" ---
    const studentsTab = document.getElementById('tabGroupStudents');
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select('*')
      .eq('group_id', groupId)
      .order('child_name');

    if (studentsError) throw studentsError;

    studentsTab.innerHTML = `
      <div class="students-list-full">
        ${students?.map(s => `
          <div class="student-full-item">
            <span><strong>${s.child_name}</strong> (${s.child_age || '—'} л.)</span>
            <span>${s.parent_name || ''} ${s.phone_number || ''}</span>
            <button class="btn-icon remove-from-group" data-id="${s.id}" title="Убрать из группы">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `).join('') || '<p>Нет учеников</p>'}
      </div>
      <button class="btn btn-primary mt-2" id="addStudentToGroupBtn">
        <i class="fas fa-plus"></i> Добавить ученика
      </button>
    `;

    // Обработчики для "Убрать из группы"
    studentsTab.querySelectorAll('.remove-from-group').forEach(btn =>
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await supabase.from('students').update({ group_id: null }).eq('id', id);
        modal.remove(); // Закрываем текущее модальное окно
        openFullGroupCard(groupId); // И открываем заново, чтобы обновить список
      })
    );

    // Обработчик "Добавить ученика"
    studentsTab.querySelector('#addStudentToGroupBtn').addEventListener('click', () => showAddStudentModal(groupId, modal));

    // --- Вкладка "Расписание" ---
    const lessonsTab = document.getElementById('tabGroupLessons');
    const { data: lessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('*')
      .eq('group_id', groupId)
      .order('lesson_date', { ascending: true });

    if (lessonsError) throw lessonsError;

    lessonsTab.innerHTML = `
      <table>
        <thead><tr><th>Дата</th><th>Тема</th></tr></thead>
        <tbody>
          ${lessons?.map(l => `
            <tr>
              <td>${new Date(l.lesson_date).toLocaleString('ru-RU')}</td>
              <td>${l.topic || '—'}</td>
            </tr>
          `).join('') || '<tr><td colspan="2">Нет занятий</td></tr>'}
        </tbody>
      </table>
    `;

    // --- Переключение вкладок ---
    modal.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        // Используем правильный ID целевого контента
        const targetId = `tabGroup${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
        document.getElementById(targetId).classList.add('active');
      });
    });

    // --- Сохранение информации о группе ---
    document.getElementById('saveFullGroup').addEventListener('click', async () => {
      const newName = document.getElementById('editGroupName').value.trim();
      const newSubject = document.getElementById('editGroupSubject').value.trim() || null;

      const { error } = await supabase
        .from('student_groups')
        .update({ group_name: newName, subject: newSubject })
        .eq('id', groupId);

      if (error) {
        alert(`Ошибка сохранения: ${error.message}`);
        return;
      }

      modal.remove();
      await fetchGroupsFull(); // Обновляем список
      renderGroupsView(); // Обновляем отображение
    });

    // --- Закрытие модального окна ---
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  } catch (error) {
    console.error('Ошибка открытия полной карточки группы:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

/**
 * Отображает модальное окно для добавления ученика в группу.
 * @param {string} groupId - ID группы.
 * @param {HTMLElement} parentModal - Родительское модальное окно.
 */
async function showAddStudentModal(groupId, parentModal) {
  try {
    const { data: students, error } = await supabase
      .from('students')
      .select('id, child_name')
      .eq('teacher_id', getCurrentUser().id)
      .is('group_id', null); // Только ученики без группы

    if (error) throw error;

    if (!students?.length) {
      alert('Нет свободных учеников для добавления.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-card">
        <h3>Добавить ученика в группу</h3>
        <select id="studentSelect">
          ${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}
        </select>
        <div class="modal-actions">
          <button class="btn btn-primary" id="confirmAdd">Добавить</button>
          <button class="btn btn-secondary close-modal">Отмена</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.querySelector('#confirmAdd').addEventListener('click', async () => {
      const studentId = document.getElementById('studentSelect').value;
      if (!studentId) return;

      const { error } = await supabase
        .from('students')
        .update({ group_id: groupId })
        .eq('id', studentId);

      if (error) {
        alert(`Ошибка добавления: ${error.message}`);
        return;
      }

      modal.remove();
      parentModal.remove(); // Закрываем оба окна
      openFullGroupCard(groupId); // Открываем заново, чтобы обновить список учеников
    });
  } catch (error) {
    console.error('Ошибка открытия модального окна добавления ученика:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

/**
 * Привязывает события к элементам управления на странице групп.
 */
function bindGroupEvents() {
  const { contentArea } = getDOMElements();

  // Кнопка "Создать группу"
  const addGroupBtn = contentArea.querySelector('#addGroupBtn');
  if (addGroupBtn) {
    addGroupBtn.addEventListener('click', () => {
      const container = contentArea.querySelector('#groupFormContainer');
      container.innerHTML = `
        <div class="form-card">
          <h3>Новая группа</h3>
          <form id="groupForm">
            <div class="form-grid">
              <div class="form-group">
                <label for="groupName">Название *</label>
                <input type="text" id="groupName" required>
              </div>
              <div class="form-group">
                <label for="groupSubject">Предмет</label>
                <input type="text" id="groupSubject">
              </div>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Создать</button>
              <button type="button" class="btn btn-secondary" id="cancelGroupForm">Отмена</button>
            </div>
          </form>
        </div>
      `;
      container.classList.remove('hidden');

      document.getElementById('groupForm').addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('groupName').value.trim();
        const subject = document.getElementById('groupSubject').value.trim() || null;

        if (!name) return;

        try {
          const { error } = await supabase
            .from('student_groups')
            .insert({
              teacher_id: getCurrentUser().id,
              group_name: name,
              subject: subject
            });

          if (error) throw error;

          container.classList.add('hidden');
          await fetchGroupsFull(); // Обновляем список
          renderGroupsView(); // Обновляем отображение
        } catch (err) {
          console.error('Ошибка создания группы:', err);
          alert(`Ошибка: ${err.message}`);
        }
      });

      document.getElementById('cancelGroupForm').addEventListener('click', () => {
        container.classList.add('hidden');
      });
    });
  }

  // Переключение вида (карточки/таблица)
  const viewSwitchers = contentArea.querySelectorAll('[data-view]');
  viewSwitchers.forEach(btn => {
    btn.addEventListener('click', () => {
      groupsCurrentView = btn.dataset.view;
      viewSwitchers.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGroupsView();
    });
  });
}

/**
 * Функция для получения списка групп (для селекта в форме ученика).
 * Экспортируется как именованный экспорт.
 * @returns {Promise<Array>} - Список групп [{ id, group_name }, ...].
 */
export async function fetchGroupsForSelect() {
  const { data } = await supabase
    .from('student_groups')
    .select('id, group_name')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  return data || [];
}
