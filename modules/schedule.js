// modules/schedule.js
import supabase from './supabaseClient.js';
import { renderPage } from './ui.js';
import { getCurrentUser } from './auth.js';
import { openLessonForm } from './lessonForm.js';

let calendar = null;
let scheduleLoaded = false;

export async function initSchedulePage() {
  if (!scheduleLoaded) {
    scheduleLoaded = true;
  }
  renderPage('schedule');
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  initializeCalendar(calendarEl);
  bindScheduleEvents();
}

function initializeCalendar(calendarEl) {
  if (calendar) calendar.destroy();
  const isMobile = window.innerWidth < 768;
  const calendarHeight = isMobile ? 500 : 650;
  calendar = new FullCalendar.Calendar(calendarEl, {
    timeZone: 'UTC',
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
        id, lesson_date, lesson_end, topic, status, notes,
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
      if (lesson.student_groups?.group_name) titleParts.push(lesson.student_groups.group_name);
      else if (lesson.students?.child_name) titleParts.push(lesson.students.child_name);
      else titleParts.push('Урок');
      if (lesson.topic) titleParts.push(`(${lesson.topic})`);
      return {
        id: lesson.id,
        title: titleParts.join(' '),
        start: lesson.lesson_date,
        end: lesson.lesson_end || new Date(new Date(lesson.lesson_date).getTime() + 60 * 60 * 1000).toISOString(),
        allDay: false,
        display: 'block',
        backgroundColor: getStatusColor(lesson.status),
        borderColor: getStatusColor(lesson.status),
        extendedProps: { groupId: lesson.group_id, studentId: lesson.student_id, topic: lesson.topic, status: lesson.status, notes: lesson.notes }
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
  const selectedDateTime = new Date(info.date.getTime() - info.date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  openLessonForm({
    prefillDate: selectedDateTime,
    onSuccess: () => calendar.refetchEvents()
  });
}

function handleEventClick(info) {
  openLessonForm({
    lessonId: info.event.id,
    onSuccess: () => calendar.refetchEvents()
  });
}

async function handleEventDropOrResize(info) {
  const newStart = info.event.start.toISOString();
  const newEnd = info.event.end ? info.event.end.toISOString() : null;
  const eventId = info.event.id;
  try {
    const updates = { lesson_date: newStart };
    if (newEnd) updates.lesson_end = newEnd;
    const { error } = await supabase.from('lessons').update(updates).eq('id', eventId).eq('teacher_id', getCurrentUser().id);
    if (error) throw error;
  } catch (err) {
    console.error(err);
    info.revert();
    alert(`Ошибка: ${err.message}`);
  }
}

function bindScheduleEvents() {
  const assignBtn = document.getElementById('assignLessonBtn');
  if (assignBtn) {
    assignBtn.addEventListener('click', () => {
      openLessonForm({ onSuccess: () => calendar?.refetchEvents() });
    });
  }
}