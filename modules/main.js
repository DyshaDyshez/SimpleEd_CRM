// modules/main.js
import supabase from './supabaseClient.js';
import { initializeAuth, getCurrentUser, getTeacherProfile, logout } from './auth.js';
import { renderPage, bindNavigation, updateUserInfo } from './ui.js';
import { initGroupsPage } from './groups.js';
import { initStudentsPage } from './students.js';
import { initSchedulePage } from './schedule.js';
import { initFinancePage } from './finance.js';

let currentPage = 'dashboard';

async function initApp() {
  const authOk = await initializeAuth();
  if (!authOk) return;

  bindNavigation(async (page) => {
    currentPage = page;
    renderPage(page);

    if (page === 'groups') {
      await initGroupsPage();
    } else if (page === 'students') {
      await initStudentsPage();
    } else if (page === 'schedule') {
      await initSchedulePage();
    } else if (page === 'finance') {
      await initFinancePage();
    }
  });

  renderPage('dashboard');
  // Загружаем дашборд асинхронно, не блокируя основной поток
  import('./dashboard.js')
    .then(module => {
      if (module.initDashboard) module.initDashboard();
    })
    .catch(e => console.warn('Модуль dashboard не найден или содержит ошибку:', e));
}

document.addEventListener('DOMContentLoaded', initApp);