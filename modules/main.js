// modules/main.js
import supabase from './supabaseClient.js';
import { initializeAuth, getCurrentUser, getTeacherProfile, logout } from './auth.js';
import { renderPage, bindNavigation, updateUserInfo } from './ui.js';
import { initGroupsPage } from './groups.js';
import { initStudentsPage } from './students.js';
import { initSchedulePage } from './schedule.js';
import { initFinancePage } from './finance.js';
import { initDashboard } from './dashboard.js';
import { initNotesPage } from './notes.js';
import { openProfileModal } from './profile.js';
import { initNotifications } from './notifications.js';
import { initStatsPage } from './stats.js';
import { initLessonsPage } from './lessons.js';
import { checkFirstTimeOnboarding, startOnboarding } from './onboarding.js';
import { initSupportChat } from './chat.js';


let currentPage = 'dashboard';

async function initApp() {
  // 1. Авторизация
  const authOk = await initializeAuth();
  if (!authOk) return;

   // 2. Инициализация чата
  initSupportChat();

  // 2. Инициализация уведомлений
  await initNotifications();

  // 3. Проверка первого входа (запуск обучалки)
  await checkFirstTimeOnboarding();

  // 4. Привязка клика по профилю
  const userProfileEl = document.querySelector('.user-profile');
  if (userProfileEl) {
    userProfileEl.style.cursor = 'pointer';
    userProfileEl.addEventListener('click', openProfileModal);
  }

  // 5. Привязка кнопки "Помощь" (если есть)
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      startOnboarding();
    });
  }

  // 6. Привязка кнопки "Выйти" (на всякий случай)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await logout();
    });
  }

  // 7. Навигация по страницам
  bindNavigation(async (page) => {
    currentPage = page;
    renderPage(page);

    try {
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
      } else if (page === 'lessons') {
        await initLessonsPage();
      }
    } catch (err) {
      console.error(`Ошибка инициализации страницы ${page}:`, err);
    }
  });

  // 8. Первичная загрузка главной
  renderPage('dashboard');
  await initDashboard();
}

// Запуск приложения после полной загрузки DOM
document.addEventListener('DOMContentLoaded', initApp);