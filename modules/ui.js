// ui.js
import supabase from './supabaseClient.js';
// modules/ui.js (в начале, после других импортов)
import { getTeacherProfile } from './auth.js';
// DOM-элементы — кэшируем при первом вызове

let _contentArea, _pageTitle, _teacherNameSpan, _userAvatar, _navLinks, _logoutBtn;

function getDOMElements() {
  if (!_contentArea) {
    _contentArea = document.getElementById('contentArea');
    _pageTitle = document.getElementById('pageTitle');
    _teacherNameSpan = document.getElementById('teacherNameDisplay');
    _userAvatar = document.getElementById('userAvatar');
    _navLinks = document.querySelectorAll('[data-page]');
    _logoutBtn = document.getElementById('logoutBtn');
  }
  return {
    contentArea: _contentArea,
    pageTitle: _pageTitle,
    teacherNameSpan: _teacherNameSpan,
    userAvatar: _userAvatar,
    navLinks: _navLinks,
    logoutBtn: _logoutBtn
  };
}

// Шаблоны — кэшируем один раз
const templates = {};
function getTemplate(name) {
  if (!templates[name]) {
    const el = document.getElementById(`${name}Template`);
    if (!el) throw new Error(`Шаблон "${name}Template" не найден`);
    templates[name] = el;
  }
  return templates[name];
}

// Рендер страницы
export function renderPage(pageName, contentHtml = '') {
  const { contentArea, pageTitle } = getDOMElements();

  // Очистка
  contentArea.innerHTML = '';
  pageTitle.textContent = getPageTitle(pageName);

  // Если есть шаблон — клонируем его
  if (pageName !== 'custom') {
    const template = getTemplate(pageName);
    const clone = template.content.cloneNode(true);
    contentArea.appendChild(clone);
  } else {
    contentArea.innerHTML = contentHtml;
  }

  // Обновляем имя учителя и аватар (если профиль загружен)
  updateUserInfo();
}

function getPageTitle(page) {
  const titles = {
    dashboard: 'Главная',
    students: 'Ученики',
    groups: 'Группы',
    schedule: 'Расписание',
    finance: 'Финансы',
    notes: 'Заметки'
  };
  return titles[page] || page;
}

function updateUserInfo() {
  const { teacherNameSpan, userAvatar } = getDOMElements();
  const profile = getTeacherProfile(); // из auth.js
  if (profile) {
    teacherNameSpan.textContent = profile.teacher_name || 'Учитель';
    userAvatar.textContent = (profile.teacher_name || 'У')[0].toUpperCase();
  }
}

// Уведомления и ошибки
export function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = message;
}

export function clearError(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = '';
}

// Навигация
export function bindNavigation(onPageChange) {
  const { navLinks, logoutBtn } = getDOMElements();

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      onPageChange(link.dataset.page);
    });
  });

  logoutBtn.addEventListener('click', async () => {
    await logout(); // из auth.js
  });
}

// Публичные экспорты
export { getDOMElements, getTemplate, updateUserInfo };