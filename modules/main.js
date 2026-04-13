// main.js
import supabase from './supabaseClient.js';
import { initializeAuth, getCurrentUser, getTeacherProfile, logout } from './auth.js';
import { renderPage, bindNavigation, updateUserInfo } from './ui.js';
import { initGroupsPage } from './groups.js';
import { initStudentsPage } from './students.js'; // Импортируем
import { initSchedulePage } from './schedule.js'; // Импортируем
import { initFinancePage } from './finance.js';

// Глобальный state для текущей страницы
let currentPage = 'dashboard';

// Инициализация приложения
async function initApp() {
  const authOk = await initializeAuth();
  if (!authOk) return;

  // Привязываем навигацию
  bindNavigation(async (page) => {
    currentPage = page;
    renderPage(page);

    // Вызов инициализации соответствующей страницы
    if (page === 'groups') {
      await initGroupsPage();
    } else if (page === 'students') { // Новый блок
      await initStudentsPage();
    } else if (page === 'schedule') { // Новый блок
      await initSchedulePage();
    }
    // Здесь можно добавить другие страницы: finance, notes и т.д.
    else if (page === 'finance') {
    await initFinancePage();
    }



  });

  // Рендерим главную страницу
  renderPage('dashboard');



  
}




// Запуск
document.addEventListener('DOMContentLoaded', initApp);