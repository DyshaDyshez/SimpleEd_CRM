// schedule.js
import supabase from './supabaseClient.js';
import { getDOMElements, renderPage } from './ui.js';
import { getCurrentUser } from './auth.js';

// Инициализация страницы расписания
export async function initSchedulePage() {
  renderPage('schedule'); // Рендерим шаблон "Расписание"

  // Здесь будет ваша логика для расписания.
  // Пока что просто выводим сообщение, что функционал в разработке.
  const { contentArea } = getDOMElements();
  const scheduleList = contentArea.querySelector('.schedule-list');
  if (scheduleList) {
    scheduleList.innerHTML = `
      <p>Функционал расписания находится в разработке.</p>
      <p>Здесь можно будет:</p>
      <ul>
        <li>Планировать уроки</li>
        <li>Назначать темы</li>
        <li>Просматривать занятость</li>
        <li>Отправлять уведомления родителям</li>
      </ul>
    `;
  }

  // Пример привязки кнопки "Назначить урок" (пока пустая)
  const assignBtn = contentArea.querySelector('#assignLessonBtn');
  if (assignBtn) {
    assignBtn.addEventListener('click', () => {
      alert('Функция "Назначить урок" в разработке.');
      // Здесь будет открытие модального окна для создания урока
    });
  }
}

// Пример функции получения расписания (заглушка)
export async function fetchSchedule() {
  // const { data, error } = await supabase
  //   .from('lessons')
  //   .select('*')
  //   .eq('teacher_id', getCurrentUser().id)
  //   .order('lesson_date');
  // return data || [];
  return []; // Пока возвращаем пустой массив
}