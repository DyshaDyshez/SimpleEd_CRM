// modules/students.js

// Импортируем зависимости
import supabase from './supabaseClient.js';
import { getDOMElements, getTemplate, renderPage, showError, clearError } from './ui.js';
import { getCurrentUser } from './auth.js';
// Импортируем функцию получения групп из groups.js
import { fetchGroupsForSelect } from './groups.js';

// Глобальное состояние для модуля учеников
let editingStudentId = null;
let groupsList = []; // Список групп для селекта

/**
 * Инициализирует страницу учеников: загружает группы, рендерит форму и таблицу.
 */
export async function initStudentsPage() {
  try {
    // Загружаем список групп для селекта в форме
    groupsList = await fetchGroupsForSelect();

    // Рендерим пустую или предзаполненную форму (в случае редактирования)
    renderStudentForm();

    // Загружаем и отображаем таблицу учеников
    await loadStudentsTable();

    // Привязываем обработчик к кнопке "Добавить ученика"
    bindAddStudentButton();
  } catch (error) {
    console.error('Ошибка инициализации страницы учеников:', error);
    showError('contentArea', 'Ошибка загрузки данных учеников.');
  }
}

/**
 * Привязывает событие к кнопке "Добавить ученика".
 */
function bindAddStudentButton() {
  const addBtn = document.getElementById('addStudentBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      editingStudentId = null; // Сбрасываем ID редактируемого ученика
      renderStudentForm(); // Рендерим форму для добавления
      document.getElementById('studentFormContainer').classList.remove('hidden');
    });
  }
}

/**
 * Рендерит форму для добавления или редактирования ученика.
 * @param {Object|null} student - Объект ученика для редактирования. Если null, форма для добавления.
 */
function renderStudentForm(student = null) {
  const container = document.getElementById('studentFormContainer');
  if (!container) return;

  const isEditing = !!student;
  const title = isEditing ? 'Редактировать ученика' : 'Добавить ученика';
  const submitButtonText = isEditing ? 'Сохранить изменения' : 'Создать ученика';

  // Генерируем HTML формы
  container.innerHTML = `
    <div class="form-card">
      <h3>${title}</h3>
      <form id="studentForm">
        <div class="form-grid">
          <div class="form-group">
            <label for="childName">Имя *</label>
            <input type="text" id="childName" value="${student?.child_name || ''}" required>
          </div>
          <div class="form-group">
            <label for="parentName">Родитель</label>
            <input type="text" id="parentName" value="${student?.parent_name || ''}">
          </div>
          <div class="form-group">
            <label for="phoneNumber">Телефон</label>
            <input type="tel" id="phoneNumber" value="${student?.phone_number || ''}">
          </div>
          <div class="form-group">
            <label for="childAge">Возраст</label>
            <input type="number" id="childAge" value="${student?.child_age || ''}" min="0" max="100">
          </div>
          <div class="form-group">
            <label for="groupId">Группа</label>
            <select id="groupId">
              <option value="">Без группы</option>
              ${groupsList.map(g => `<option value="${g.id}" ${student?.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="status">Статус</label>
            <select id="status">
              <option value="active" ${student?.status === 'active' ? 'selected' : ''}>Активен</option>
              <option value="inactive" ${student?.status === 'inactive' ? 'selected' : ''}>Неактивен</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="parentPain">Заметка</label>
          <textarea id="parentPain" rows="3">${student?.parent_pain || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${submitButtonText}</button>
          <button type="button" class="btn btn-secondary" id="cancelStudentForm">Отмена</button>
        </div>
        <div id="studentFormError" class="error-message"></div>
      </form>
    </div>
  `;

  // Привязываем обработчик отправки формы
  const form = document.getElementById('studentForm');
  if (form) {
    form.addEventListener('submit', saveStudent);
  }

  // Привязываем обработчик отмены
  const cancelBtn = document.getElementById('cancelStudentForm');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      container.classList.add('hidden');
      clearError('studentFormError'); // Очищаем ошибки при отмене
    });
  }
}

/**
 * Обрабатывает отправку формы (создание или обновление ученика).
 * @param {Event} e - Событие submit формы.
 */
async function saveStudent(e) {
  e.preventDefault();
  clearError('studentFormError'); // Очищаем предыдущие ошибки

  const errorDiv = document.getElementById('studentFormError');
  if (!errorDiv) return;

  // Собираем данные из формы
  const childName = document.getElementById('childName').value.trim();
  const parentName = document.getElementById('parentName').value.trim() || null;
  const phoneNumber = document.getElementById('phoneNumber').value.trim() || null;
  const childAgeInput = document.getElementById('childAge').value;
  const groupId = document.getElementById('groupId').value || null;
  const status = document.getElementById('status').value;
  const parentPain = document.getElementById('parentPain').value.trim() || null;

  // Валидация
  if (!childName) {
    showError('studentFormError', 'Введите имя ученика.');
    return;
  }

  // Преобразование возраста
  let childAge = null;
  if (childAgeInput) {
    const ageNum = parseInt(childAgeInput, 10);
    if (isNaN(ageNum) || ageNum <= 0) {
      showError('studentFormError', 'Введите корректный возраст.');
      return;
    }
    childAge = ageNum;
  }

  // Подготовка данных для сохранения
  const studentData = {
    teacher_id: getCurrentUser().id, // Убедимся, что ученик привязан к текущему учителю
    child_name: childName,
    parent_name: parentName,
    phone_number: phoneNumber,
    child_age: childAge,
    group_id: groupId,
    status: status,
    parent_pain: parentPain,
  };

  let res;
  if (editingStudentId) {
    // Обновление существующего ученика
    res = await supabase
      .from('students')
      .update(studentData)
      .eq('id', editingStudentId);
  } else {
    // Создание нового ученика
    res = await supabase
      .from('students')
      .insert(studentData);
  }

  if (res.error) {
    showError('studentFormError', `Ошибка: ${res.error.message}`);
    return;
  }

  // Успешно сохранено
  document.getElementById('studentFormContainer').classList.add('hidden');
  editingStudentId = null; // Сбрасываем ID редактируемого ученика
  await loadStudentsTable(); // Обновляем таблицу
  clearError('studentFormError'); // Очищаем ошибки
}

/**
 * Загружает список учеников текущего учителя и отображает их в таблице.
 */
async function loadStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  // Показываем индикатор загрузки
  tbody.innerHTML = '<tr><td colspan="6">Загрузка...</td></tr>';

  try {
    // Запрашиваем данные учеников с именами групп (через JOIN)
    const { data, error } = await supabase
      .from('students')
      .select(`
        id,
        child_name,
        parent_name,
        phone_number,
        child_age,
        group_id,
        status,
        parent_pain,
        student_groups ( group_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .order('child_name', { ascending: true });

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6">Нет учеников</td></tr>';
      return;
    }

    // Генерируем строки таблицы
    tbody.innerHTML = data.map(student => {
      // Получаем имя группы из связанной таблицы
      const groupName = student.student_groups?.group_name || '—';
      // Определяем класс бейджа статуса
      const statusClass = student.status === 'active' ? 'badge active' : 'badge inactive';
      const statusText = student.status === 'active' ? 'Активен' : 'Неактивен';

      return `
        <tr>
          <td>${student.child_name}</td>
          <td>${student.parent_name || '—'}</td>
          <td>${student.phone_number || '—'}</td>
          <td>${groupName}</td>
          <td><span class="${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn-icon edit-student" data-id="${student.id}" title="Редактировать">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon" style="color: #d32f2f;" data-id="${student.id}" title="Удалить" onclick="confirmAndDeleteStudent('${student.id}')">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Привязываем обработчики к кнопкам "Редактировать" и "Удалить"
    document.querySelectorAll('.edit-student').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        await loadAndEditStudent(id);
      });
    });

    // Глобальная функция для подтверждения удаления (из-за inline onclick)
    window.confirmAndDeleteStudent = async (id) => {
        if (confirm('Удалить этого ученика?')) {
            await deleteStudentById(id);
        }
    };

  } catch (error) {
    console.error('Ошибка загрузки таблицы учеников:', error);
    tbody.innerHTML = `<tr><td colspan="6">Ошибка: ${error.message}</td></tr>`;
  }
}

/**
 * Загружает данные ученика по ID и открывает форму для редактирования.
 * @param {string} id - ID ученика.
 */
async function loadAndEditStudent(id) {
  try {
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', id)
      .single(); // single() т.к. ожидаем одну запись

    if (error) throw error;

    if (!student) {
      alert('Ученик не найден.');
      return;
    }

    // Проверяем, принадлежит ли ученик текущему учителю
    if (student.teacher_id !== getCurrentUser().id) {
      alert('У вас нет прав для редактирования этого ученика.');
      return;
    }

    editingStudentId = id;
    renderStudentForm(student); // Передаём данные ученика в форму
    document.getElementById('studentFormContainer').classList.remove('hidden');

  } catch (error) {
    console.error('Ошибка загрузки данных ученика для редактирования:', error);
    alert(`Ошибка: ${error.message}`);
  }
}

/**
 * Удаляет ученика по ID и обновляет таблицу.
 * @param {string} id - ID ученика для удаления.
 */
async function deleteStudentById(id) {
  try {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Обновляем таблицу после успешного удаления
    await loadStudentsTable();

  } catch (error) {
    console.error('Ошибка удаления ученика:', error);
    alert(`Ошибка при удалении: ${error.message}`);
  }
}

// Экспортируем fetchGroupsForSelect, чтобы groups.js мог импортировать его.
// Эта функция теперь находится в groups.js, но если вы хотите, чтобы она была здесь,
// то уберите импорт сверху и раскомментируйте следующую строку:
// export { fetchGroupsForSelect };

// Если вы хотите использовать fetchGroupsForSelect из этого файла, закомментируйте
// импорт в начале и раскомментируйте функцию ниже:
/*
async function fetchGroupsForSelect() {
  const { data } = await supabase
    .from('student_groups')
    .select('id, group_name')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  return data || [];
}
*/