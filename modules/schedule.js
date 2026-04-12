// modules/schedule.js
import supabase from './supabaseClient.js';
import { getDOMElements, renderPage, showError, clearError } from './ui.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js'; // Импортируем для списка групп

let calendar = null;
let groupsForLessons = []; // Для селекта в форме
let editingLessonId = null; // Для редактирования

export async function initSchedulePage() {
  // Загружаем группы для формы
  groupsForLessons = await fetchGroupsForSelect();

  // Рендерим шаблон
  renderPage('schedule');

  // Ждём, пока DOM для #calendar будет готов
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) {
    console.error('❌ Элемент #calendar не найден в шаблоне scheduleTemplate.');
    return;
  }

  // Инициализируем календарь
  initializeCalendar(calendarEl);
}

function initializeCalendar(calendarEl) {
  // Уничтожаем предыдущий календарь, если он был
  if (calendar) {
    calendar.destroy();
  }

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth', // Вид по умолчанию
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'ru', // Локализация
    editable: true, // Позволяет перетаскивать и изменять время
    selectable: true, // Позволяет выделять интервалы для создания
    events: fetchAndFormatEvents, // Функция для загрузки событий
    dateClick: handleDateClick, // Обработчик клика по дню
    eventClick: handleEventClick, // Обработчик клика по событию
    eventDrop: handleEventDropOrResize, // Обработчик перетаскивания
    eventResize: handleEventDropOrResize, // Обработчик изменения длительности
    loading: function(isLoading) {
      // Можно показать/скрыть индикатор загрузки
      if (isLoading) {
        console.log('Загрузка событий календаря...');
      } else {
        console.log('События календаря загружены.');
      }
    }
  });

  calendar.render();
}

// Загружает уроки из Supabase и форматирует для FullCalendar
async function fetchAndFormatEvents(fetchInfo, successCallback, failureCallback) {
  try {
    // Опционально: фильтруем по диапазону дат fetchInfo.start, fetchInfo.end
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select(`
        id,
        lesson_date,
        topic,
        group_id,
        student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id) // Только уроки текущего учителя
      .gte('lesson_date', fetchInfo.startStr) // Уроки в пределах видимого диапазона
      .lte('lesson_date', fetchInfo.endStr);

    if (error) throw error;

    // Форматирование событий для FullCalendar
    const events = lessons.map(lesson => {
      const titleParts = [];
      // Добавляем имя группы или ученика
      if (lesson.student_groups?.group_name) {
        titleParts.push(lesson.student_groups.group_name);
      } else if (lesson.students?.child_name) {
        titleParts.push(lesson.students.child_name);
      } else {
        titleParts.push("Урок"); // Резерв
      }

      // Добавляем тему, если есть
      if (lesson.topic) {
        titleParts.push(`(${lesson.topic})`);
      }

      return {
        id: lesson.id,
        title: titleParts.join(' '), // "10А (Уравнения)" или "Иванов (Интегралы)"
        start: lesson.lesson_date,
        end: new Date(new Date(lesson.lesson_date).getTime() + 60 * 60 * 1000).toISOString(), // Пример: +1 час
        extendedProps: { // Дополнительные данные
          groupId: lesson.group_id,
          studentId: lesson.student_id,
          topic: lesson.topic,
        }
      };
    });

    successCallback(events);
  } catch (error) {
    console.error('Ошибка загрузки событий календаря:', error);
    failureCallback(error);
    // В реальном приложении стоит показать пользователю сообщение
  }
}


// Обработчик клика по дате - создание урока
function handleDateClick(info) {
  // info.date - объект Date, на который кликнули
  // info.allDay - boolean
  // info.jsEvent - MouseEvent
  // info.view - объект View

  // Преобразуем Date в формат datetime-local (ISO 8601, без Z, с локальным временем)
  const selectedDateTime = new Date(info.date.getTime() - info.date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  editingLessonId = null; // Режим создания
  renderLessonForm(null, selectedDateTime); // Передаём выбранное время
  document.getElementById('lessonFormContainer').classList.remove('hidden');
}

// Обработчик клика по событию - редактирование
function handleEventClick(info) {
  // info.event - объект Event FullCalendar
  // info.jsEvent - MouseEvent
  // info.view - объект View

  // Извлекаем ID урока из FullCalendar event
  const lessonId = info.event.id;

  // Загружаем данные урока из Supabase для редактирования
  loadAndEditLesson(lessonId);
}

// Обработчик перетаскивания/изменения размера события
async function handleEventDropOrResize(info) {
  // info.event - объект Event после изменения
  // info.oldEvent - объект Event до изменения
  // info.delta - разница времени (для drag/drop)
  // info.revert - функция для отката изменений при ошибке

  const newStartDate = info.event.start.toISOString();
  const eventId = info.event.id;

  try {
    const { error } = await supabase
      .from('lessons')
      .update({ lesson_date: newStartDate }) // Обновляем только дату/время
      .eq('id', eventId)
      .eq('teacher_id', getCurrentUser().id); // Защита

    if (error) throw error;

    console.log('Урок успешно перемещён/изменён в календаре.');
    // FullCalendar автоматически отображает новую дату
  } catch (err) {
    console.error('Ошибка обновления урока после drag-n-drop:', err);
    // Откатываем изменение в календаре
    info.revert();
    alert(`Ошибка обновления: ${err.message}`);
  }
}


// --- Форма урока (аналогично в groups.js, но адаптировано для календаря) ---
function renderLessonForm(lesson = null, prefillDate = null) {
  const container = document.getElementById('lessonFormContainer');
  const isEditing = !!lesson;
  const title = isEditing ? 'Редактировать урок' : 'Назначить урок';
  const submitText = isEditing ? 'Сохранить изменения' : 'Создать урок';

  // Определяем дату для input (редактирование или предзаполнение)
  const dateTimeValue = lesson ? new Date(lesson.lesson_date).toISOString().slice(0, 16) : prefillDate || '';

  container.innerHTML = `
    <div class="form-card">
      <h3>${title}</h3>
      <form id="lessonForm">
        <div class="form-grid">
          <div class="form-group">
            <label for="lessonDate">Дата и время *</label>
            <input type="datetime-local" id="lessonDate" value="${dateTimeValue}" required>
          </div>
          <div class="form-group">
            <label for="lessonGroupId">Группа (оставьте пустым для индивидуального)</label>
            <select id="lessonGroupId">
              <option value="">Индивидуальный</option>
              ${groupsForLessons.map(g => `<option value="${g.id}" ${lesson?.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="lessonTopic">Тема</label>
          <input type="text" id="lessonTopic" value="${lesson?.topic || ''}" placeholder="Например: Уравнения...">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-success">${submitText}</button>
          <button type="button" class="btn btn-secondary" id="cancelLessonForm">Отмена</button>
        </div>
        <div id="lessonFormError" class="error-message"></div>
      </form>
    </div>
  `;

  document.getElementById('lessonForm').addEventListener('submit', saveLesson);
  document.getElementById('cancelLessonForm').addEventListener('click', () => {
    container.classList.add('hidden');
    clearError('lessonFormError');
  });
}

async function saveLesson(e) {
  e.preventDefault();
  clearError('lessonFormError');
  const errorDiv = document.getElementById('lessonFormError');

  const lessonDate = document.getElementById('lessonDate').value;
  const groupId = document.getElementById('lessonGroupId').value || null; // Может быть null
  const topic = document.getElementById('lessonTopic').value.trim() || null;

  if (!lessonDate) { // groupId может быть null для индивидуального
    showError('lessonFormError', 'Выберите дату и время.');
    return;
  }

  const lessonData = {
    teacher_id: getCurrentUser().id,
    lesson_date: lessonDate,
    group_id: groupId,
    // student_id: null, // Пока не поддерживаем индивидуальные через эту форму
    topic: topic,
  };

  let res;
  if (editingLessonId) {
    res = await supabase.from('lessons').update(lessonData).eq('id', editingLessonId).eq('teacher_id', getCurrentUser().id);
  } else {
    res = await supabase.from('lessons').insert(lessonData);
  }

  if (res.error) {
    showError('lessonFormError', `Ошибка: ${res.error.message}`);
    return;
  }

  document.getElementById('lessonFormContainer').classList.add('hidden');
  editingLessonId = null;
  // Перезагружаем календарь
  if (calendar) {
    calendar.refetchEvents();
  }
  clearError('lessonFormError');
}

async function loadAndEditLesson(id) {
  const { data: lesson, error } = await supabase.from('lessons').select('*').eq('id', id).eq('teacher_id', getCurrentUser().id).single();
  if (error) {
    console.error('Ошибка загрузки урока для редактирования:', error);
    alert(`Ошибка: ${error.message}`);
    return;
  }

  editingLessonId = id;
  renderLessonForm(lesson); // Передаём данные урока
  document.getElementById('lessonFormContainer').classList.remove('hidden');
}

// Привязка кнопки "Назначить урок" на странице (опционально, можно и без неё через календарь)
function bindScheduleEvents() {
  // Кнопка "Назначить урок" (открывает форму без предзаполнения даты)
  const assignBtn = document.getElementById('assignLessonBtn');
  if (assignBtn) {
     assignBtn.addEventListener('click', () => {
        editingLessonId = null;
        renderLessonForm(); // Без аргументов - пустая форма
        document.getElementById('lessonFormContainer').classList.remove('hidden');
     });
  }
}

// Экспортируем для main.js
// export { initSchedulePage }; // Уже экспортировано выше