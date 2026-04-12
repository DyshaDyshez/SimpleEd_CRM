// modules/schedule.js
import supabase from './supabaseClient.js';
import { getDOMElements, renderPage, showError, clearError } from './ui.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';

let calendar = null;
let groupsForLessons = [];
let studentsForLessons = [];
let editingLessonId = null;

export async function initSchedulePage() {
  [groupsForLessons, studentsForLessons] = await Promise.all([
    fetchGroupsForSelect(),
    fetchStudentsForSelect()
  ]);
  renderPage('schedule');

  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) {
    console.error('❌ Элемент #calendar не найден.');
    return;
  }

  initializeCalendar(calendarEl);
  bindScheduleEvents();
}

function initializeCalendar(calendarEl) {
  if (calendar) calendar.destroy();

  const isMobile = window.innerWidth < 768;
  const calendarHeight = isMobile ? 500 : 650;

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth',
    height: calendarHeight,
    contentHeight: 'auto',
    expandRows: false,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay'
    },
    locale: 'ru',
    editable: true,
    selectable: true,
    events: fetchAndFormatEvents,
    dateClick: handleDateClick,
    eventClick: handleEventClick,
    eventDrop: handleEventDropOrResize,
    eventResize: handleEventDropOrResize,
    windowResize: function() {
      const newHeight = window.innerWidth < 768 ? 500 : 650;
      calendar.setOption('height', newHeight);
    },
    loading: (isLoading) => console.log(isLoading ? 'Загрузка...' : 'Готово')
  });

  calendar.render();
}

async function fetchAndFormatEvents(fetchInfo, successCallback, failureCallback) {
  try {
    const { data: lessons, error } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, status, notes,
        group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .gte('lesson_date', fetchInfo.startStr)
      .lte('lesson_date', fetchInfo.endStr);

    if (error) throw error;

    const events = lessons.map(lesson => {
      const titleParts = [];
      if (lesson.student_groups?.group_name) {
        titleParts.push(lesson.student_groups.group_name);
      } else if (lesson.students?.child_name) {
        titleParts.push(lesson.students.child_name);
      } else {
        titleParts.push('Урок');
      }
      if (lesson.topic) titleParts.push(`(${lesson.topic})`);

      return {
        id: lesson.id,
        title: titleParts.join(' '),
        start: lesson.lesson_date,
        end: new Date(new Date(lesson.lesson_date).getTime() + 60 * 60 * 1000).toISOString(),
        backgroundColor: getStatusColor(lesson.status),
        borderColor: getStatusColor(lesson.status),
        extendedProps: {
          groupId: lesson.group_id,
          studentId: lesson.student_id,
          topic: lesson.topic,
          status: lesson.status,
          notes: lesson.notes
        }
      };
    });

    successCallback(events);
  } catch (error) {
    console.error('Ошибка загрузки событий:', error);
    failureCallback(error);
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'completed': return '#2C4C3B';
    case 'cancelled': return '#d32f2f';
    case 'rescheduled': return '#ff9800';
    default: return '#D4A373';
  }
}

function handleDateClick(info) {
  const selectedDateTime = new Date(info.date.getTime() - info.date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
  editingLessonId = null;
  renderLessonForm(null, selectedDateTime);
  document.getElementById('lessonFormContainer').classList.remove('hidden');
}

function handleEventClick(info) {
  const lessonId = info.event.id;
  loadAndEditLesson(lessonId);
}

async function handleEventDropOrResize(info) {
  const newStart = info.event.start.toISOString();
  const eventId = info.event.id;
  try {
    const { error } = await supabase
      .from('lessons')
      .update({ lesson_date: newStart })
      .eq('id', eventId)
      .eq('teacher_id', getCurrentUser().id);
    if (error) throw error;
  } catch (err) {
    console.error(err);
    info.revert();
    alert(`Ошибка: ${err.message}`);
  }
}

// ========== ФОРМА УРОКА ==========
function renderLessonForm(lesson = null, prefillDate = null) {
  const container = document.getElementById('lessonFormContainer');
  const isEditing = !!lesson;
  const title = isEditing ? 'Редактировать урок' : 'Назначить урок';
  const submitText = isEditing ? 'Сохранить' : 'Создать';

  const dateValue = lesson?.lesson_date
    ? new Date(lesson.lesson_date).toISOString().slice(0, 16)
    : (prefillDate || '');

  const groupName = lesson?.student_groups?.group_name || '';
  const studentName = lesson?.students?.child_name || '';
  const relatedName = groupName || studentName || 'Не указано';
  const hasGroup = !!lesson?.group_id;
  const hasStudent = !!lesson?.student_id;

  const typeOptions = !isEditing ? `
    <div class="form-group">
      <label>Тип занятия</label>
      <select id="lessonTypeSelect">
        <option value="group">Группа</option>
        <option value="student">Индивидуально</option>
      </select>
    </div>
    <div class="form-group" id="groupSelectWrapper">
      <label>Группа</label>
      <select id="lessonGroupSelect">
        <option value="">Выберите группу</option>
        ${groupsForLessons.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group hidden" id="studentSelectWrapper">
      <label>Ученик</label>
      <select id="lessonStudentSelect">
        <option value="">Выберите ученика</option>
        ${studentsForLessons.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}
      </select>
    </div>
  ` : '';

  const deleteButton = isEditing ? `
    <button type="button" class="btn btn-danger" id="deleteLessonBtn">Удалить урок</button>
  ` : '';

  container.innerHTML = `
    <div class="form-card">
      <h3>${title}</h3>
      <form id="lessonForm">
        <div class="form-grid">
          <div class="form-group">
            <label>Дата и время *</label>
            <input type="datetime-local" id="lessonDate" value="${dateValue}" required>
          </div>
          <div class="form-group">
            <label>Связано с</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" value="${relatedName}" disabled style="flex:1;">
              ${hasGroup ? `<button type="button" class="btn btn-sm btn-secondary" id="openGroupFromLesson">Открыть группу</button>` : ''}
              ${hasStudent ? `<button type="button" class="btn btn-sm btn-secondary" id="openStudentFromLesson">Открыть ученика</button>` : ''}
            </div>
          </div>
        </div>
        ${typeOptions}
        <div class="form-group">
          <label>Тема</label>
          <input type="text" id="lessonTopic" value="${lesson?.topic || ''}">
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select id="lessonStatus">
            <option value="planned" ${lesson?.status === 'planned' ? 'selected' : ''}>Запланирован</option>
            <option value="completed" ${lesson?.status === 'completed' ? 'selected' : ''}>Проведён</option>
            <option value="cancelled" ${lesson?.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
            <option value="rescheduled" ${lesson?.status === 'rescheduled' ? 'selected' : ''}>Перенесён</option>
          </select>
        </div>
        <div class="form-group">
          <label>Заметки</label>
          <textarea id="lessonNotes" rows="3">${lesson?.notes || ''}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-success">${submitText}</button>
          <button type="button" class="btn btn-secondary" id="cancelLessonForm">Отмена</button>
          ${deleteButton}
        </div>
        <div id="lessonFormError" class="error-message"></div>
      </form>
    </div>
  `;

  if (!isEditing) {
    const typeSelect = document.getElementById('lessonTypeSelect');
    const groupWrapper = document.getElementById('groupSelectWrapper');
    const studentWrapper = document.getElementById('studentSelectWrapper');
    typeSelect.addEventListener('change', () => {
      if (typeSelect.value === 'group') {
        groupWrapper.classList.remove('hidden');
        studentWrapper.classList.add('hidden');
      } else {
        groupWrapper.classList.add('hidden');
        studentWrapper.classList.remove('hidden');
      }
    });
  }

  document.getElementById('lessonForm').addEventListener('submit', saveLesson);
  document.getElementById('cancelLessonForm').addEventListener('click', () => {
    container.classList.add('hidden');
    clearError('lessonFormError');
  });

  if (isEditing) {
    document.getElementById('deleteLessonBtn').addEventListener('click', () => deleteCurrentLesson());
  }

  if (hasGroup) {
    document.getElementById('openGroupFromLesson').addEventListener('click', async () => {
      const { openFullGroupCard } = await import('./groups.js');
      openFullGroupCard(lesson.group_id);
    });
  }
  if (hasStudent) {
    document.getElementById('openStudentFromLesson').addEventListener('click', async () => {
      const { openStudentCard } = await import('./students.js');
      openStudentCard(lesson.student_id);
    });
  }
}

async function saveLesson(e) {
  e.preventDefault();
  clearError('lessonFormError');
  const errorDiv = document.getElementById('lessonFormError');

  const lessonDate = document.getElementById('lessonDate').value;
  const topic = document.getElementById('lessonTopic').value.trim() || null;
  const status = document.getElementById('lessonStatus').value;
  const notes = document.getElementById('lessonNotes').value.trim() || null;

  if (!lessonDate) {
    showError('lessonFormError', 'Выберите дату и время.');
    return;
  }

  const localDate = new Date(lessonDate);
  const utcDate = localDate.toISOString();

  const lessonData = {
    teacher_id: getCurrentUser().id,
    lesson_date: utcDate,
    topic,
    status,
    notes
  };

  if (!editingLessonId) {
    const typeSelect = document.getElementById('lessonTypeSelect');
    if (typeSelect) {
      if (typeSelect.value === 'group') {
        const groupSelect = document.getElementById('lessonGroupSelect');
        lessonData.group_id = groupSelect.value || null;
      } else {
        const studentSelect = document.getElementById('lessonStudentSelect');
        lessonData.student_id = studentSelect.value || null;
      }
    }
  }

  let res;
  if (editingLessonId) {
    res = await supabase
      .from('lessons')
      .update(lessonData)
      .eq('id', editingLessonId)
      .eq('teacher_id', getCurrentUser().id);
  } else {
    res = await supabase.from('lessons').insert(lessonData);
  }

  if (res.error) {
    showError('lessonFormError', `Ошибка: ${res.error.message}`);
    return;
  }

  document.getElementById('lessonFormContainer').classList.add('hidden');
  editingLessonId = null;
  if (calendar) calendar.refetchEvents();
  clearError('lessonFormError');
}

async function deleteCurrentLesson() {
  if (!editingLessonId) return;
  if (!confirm('Удалить этот урок?')) return;

  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', editingLessonId)
    .eq('teacher_id', getCurrentUser().id);

  if (error) {
    alert(`Ошибка удаления: ${error.message}`);
    return;
  }

  document.getElementById('lessonFormContainer').classList.add('hidden');
  editingLessonId = null;
  if (calendar) calendar.refetchEvents();
}

async function loadAndEditLesson(id) {
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select(`
      *,
      student_groups ( group_name ),
      students ( child_name )
    `)
    .eq('id', id)
    .eq('teacher_id', getCurrentUser().id)
    .single();

  if (error) {
    console.error('Ошибка загрузки урока:', error);
    alert(`Ошибка: ${error.message}`);
    return;
  }

  editingLessonId = id;
  renderLessonForm(lesson);
  document.getElementById('lessonFormContainer').classList.remove('hidden');
}

function bindScheduleEvents() {
  const assignBtn = document.getElementById('assignLessonBtn');
  if (assignBtn) {
    assignBtn.addEventListener('click', () => {
      editingLessonId = null;
      renderLessonForm();
      document.getElementById('lessonFormContainer').classList.remove('hidden');
    });
  }
}