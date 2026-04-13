// modules/main.js
import supabase from './supabaseClient.js';
import { initializeAuth, getCurrentUser, getTeacherProfile, logout } from './auth.js';
import { renderPage, bindNavigation, updateUserInfo } from './ui.js';
import { initGroupsPage } from './groups.js';
import { initStudentsPage } from './students.js';
import { initSchedulePage } from './schedule.js';
import { initFinancePage } from './finance.js';
import { initDashboard } from './dashboard.js'; // статический импорт
import { initNotesPage } from './notes.js';
import { openProfileModal } from './profile.js';
import { initNotifications } from './notifications.js';
import { initStatsPage } from './stats.js';

let currentPage = 'dashboard';

async function initApp() {
  const authOk = await initializeAuth();
  if (!authOk) return;

  await initNotifications();

    // После успешной авторизации (после initializeAuth)
const userProfileEl = document.querySelector('.user-profile');
if (userProfileEl) {
  userProfileEl.style.cursor = 'pointer';
  userProfileEl.addEventListener('click', openProfileModal);
}



  bindNavigation(async (page) => {
    currentPage = page;
    renderPage(page);

    // Всегда вызываем инициализацию страницы (модуль сам решит, грузить данные или взять из кэша)
    if (page === 'dashboard') {
      await initDashboard();
    } else if (page === 'groups') {
      await initGroupsPage();
    } else if (page === 'students') {
      await initStudentsPage();
    } else if (page === 'schedule') {
      await initSchedulePage();
    } else if (page === 'finance') {
      await initFinancePage();
    } else if (page === 'notes') {
      await initNotesPage();
    } else if (page === 'stats') {
      await initStatsPage();
  }
  });

  // Первичная загрузка главной
  renderPage('dashboard');
  await initDashboard();
}

document.addEventListener('DOMContentLoaded', initApp);