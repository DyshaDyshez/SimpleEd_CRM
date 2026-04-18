// modules/dashboard.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { isPageCached, setPageCached } from './cache.js';
import { openLessonForm } from './lessonForm.js';
import { openAvailabilityModal } from './availability.js';

document.getElementById('openAvailabilityBtn')?.addEventListener('click', openAvailabilityModal);


// --- КЭШ ДАННЫХ ДЛЯ ДАШБОРДА ---
let cachedStats = null;          // { totalLessons, totalEarningsRUB, totalEarningsKZT }
let cachedUpcoming = null;       // массив ближайших уроков
let cachedCompleted = null;      // массив проведённых уроков

// ==================== ИНИЦИАЛИЗАЦИЯ ГЛАВНОЙ ====================
export async function initDashboard() {
  try {
    if (!isPageCached('dashboard')) {
      await loadAllDataFromSupabase();
      setPageCached('dashboard');
    }
    renderStats();
    renderUpcomingLessons();
    renderCompletedLessons();
    bindDashboardEvents();
  } catch (err) {
    console.error('Ошибка в initDashboard:', err);
  }
}

// ==================== ЗАГРУЗКА ВСЕХ ДАННЫХ ИЗ SUPABASE ====================
async function loadAllDataFromSupabase() {
  try {
    // 1. Статистика: количество завершённых уроков
    const { count: lessonsCount, error: lessonsError } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'completed');

    if (lessonsError) throw lessonsError;

    // 2. Загружаем все оплаты с информацией о валюте ученика
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        amount,
        student_id,
        students ( currency )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'paid');

    if (paymentsError) throw paymentsError;

    // 3. Считаем доходы по валютам
    let totalEarningsRUB = 0;
    let totalEarningsKZT = 0;

    (payments || []).forEach(p => {
      const amount = parseFloat(p.amount) || 0;
      const currency = p.students?.currency || 'RUB'; // по умолчанию RUB
      
      if (currency === 'KZT') {
        totalEarningsKZT += amount;
      } else {
        totalEarningsRUB += amount;
      }
    });

    cachedStats = {
      totalLessons: lessonsCount || 0,
      totalEarningsRUB,
      totalEarningsKZT
    };

    // 4. Ближайшие уроки (неделя или 5 ближайших)
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(now.getDate() + 7);
    
    const nowISO = now.toISOString();
    const nextWeekISO = nextWeek.toISOString();

    let { data: upcoming } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'planned')
      .gte('lesson_date', nowISO)
      .lte('lesson_date', nextWeekISO)
      .order('lesson_date', { ascending: true });

    // Если на неделе пусто — берём 5 ближайших
    if (!upcoming || upcoming.length === 0) {
      const res = await supabase
        .from('lessons')
        .select(`
          id, lesson_date, topic, group_id, student_id,
          student_groups ( group_name ),
          students ( child_name )
        `)
        .eq('teacher_id', getCurrentUser().id)
        .eq('status', 'planned')
        .gte('lesson_date', nowISO)
        .order('lesson_date', { ascending: true })
        .limit(5);
      upcoming = res.data;
    }
    cachedUpcoming = upcoming || [];

    // 5. Проведённые уроки (7 дней или 5 последних)
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const weekAgoISO = weekAgo.toISOString();

    let { data: completed } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, notes, group_id, student_id, payment_id, is_free,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'completed')
      .gte('lesson_date', weekAgoISO)
      .lte('lesson_date', nowISO)
      .order('lesson_date', { ascending: false });

    // Если за неделю пусто — берём 5 последних
    if (!completed || completed.length === 0) {
      const res = await supabase
        .from('lessons')
        .select(`
          id, lesson_date, topic, notes, group_id, student_id, payment_id, is_free,
          student_groups ( group_name ),
          students ( child_name )
        `)
        .eq('teacher_id', getCurrentUser().id)
        .eq('status', 'completed')
        .order('lesson_date', { ascending: false })
        .limit(5);
      completed = res.data;
    }
    cachedCompleted = completed || [];
    
  } catch (e) {
    console.error('Ошибка загрузки данных дашборда:', e);
  }
}

// ==================== РЕНДЕРИНГ ====================
function renderStats() {
  const totalLessonsEl = document.getElementById('totalLessonsCount');
  const totalEarningsRUBEl = document.getElementById('totalEarningsRUB');
  const totalEarningsKZTEl = document.getElementById('totalEarningsKZT');
  
  if (totalLessonsEl) {
    totalLessonsEl.textContent = cachedStats?.totalLessons || 0;
  }
  if (totalEarningsRUBEl) {
    totalEarningsRUBEl.textContent = (cachedStats?.totalEarningsRUB || 0).toFixed(0);
  }
  if (totalEarningsKZTEl) {
    totalEarningsKZTEl.textContent = (cachedStats?.totalEarningsKZT || 0).toFixed(0);
  }
}

function renderUpcomingLessons() {
  const container = document.getElementById('upcomingLessonsList');
  if (!container) return;
  
  if (!cachedUpcoming || cachedUpcoming.length === 0) {
    container.innerHTML = '<p class="text-muted">Нет запланированных уроков</p>';
    return;
  }
  
  container.innerHTML = cachedUpcoming.map(l => {
    const name = l.student_groups?.group_name || l.students?.child_name || 'Урок';
    const date = new Date(l.lesson_date).toLocaleString('ru-RU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `
      <div class="lesson-item" data-lesson-id="${l.id}">
        <span class="time">${date}</span>
        <div class="info">
          <strong>${name}</strong>
          ${l.topic ? `<span>${l.topic}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Обработчики клика для открытия модалки редактирования
  container.querySelectorAll('.lesson-item').forEach(el => {
    el.addEventListener('click', () => openLessonModal(el.dataset.lessonId));
  });
}

function renderCompletedLessons() {
  const container = document.getElementById('completedLessonsList');
  if (!container) return;
  
  if (!cachedCompleted || cachedCompleted.length === 0) {
    container.innerHTML = '<p class="text-muted">Нет проведённых уроков</p>';
    return;
  }
  
  container.innerHTML = cachedCompleted.map(l => {
    const name = l.student_groups?.group_name || l.students?.child_name || 'Урок';
    const date = new Date(l.lesson_date).toLocaleString('ru-RU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
    const notes = l.notes ? `<small>${l.notes.substring(0, 50)}${l.notes.length > 50 ? '…' : ''}</small>` : '';
    return `
      <div class="lesson-item" data-lesson-id="${l.id}">
        <span class="time">${date}</span>
        <div class="info">
          <strong>${name}</strong>
          ${l.topic ? `<span>${l.topic}</span>` : ''}
          ${notes}
        </div>
      </div>
    `;
  }).join('');

  // Обработчики клика для открытия модалки редактирования
  container.querySelectorAll('.lesson-item').forEach(el => {
    el.addEventListener('click', () => openLessonModal(el.dataset.lessonId));
  });
}

// ==================== СБРОС КЭША ====================
export function resetDashboardCache() {
  setPageCached('dashboard', false);
  cachedStats = null;
  cachedUpcoming = null;
  cachedCompleted = null;
}

// ==================== МОДАЛКА ДОБАВЛЕНИЯ ПРОВЕДЁННОГО УРОКА ====================
export async function showAddCompletedLessonModal() {
  openLessonForm({
    initialStatus: 'completed',
    onSuccess: () => {
      resetDashboardCache();
      initDashboard();
      if (window.updateAllLessonsTable) window.updateAllLessonsTable();
    }
  });
}

// ==================== МОДАЛКА БЫСТРОГО НАЗНАЧЕНИЯ УРОКА ====================
async function showQuickAssignLessonModal() {
  // Переключаемся на страницу расписания и открываем форму
  document.querySelector('[data-page="schedule"]')?.click();
  setTimeout(() => {
    document.getElementById('assignLessonBtn')?.click();
  }, 300);
}

// ==================== ПРИВЯЗКА СОБЫТИЙ ====================
function bindDashboardEvents() {
  document.getElementById('addCompletedLessonBtn')?.addEventListener('click', showAddCompletedLessonModal);
  document.getElementById('quickAssignLessonBtn')?.addEventListener('click', showQuickAssignLessonModal);
}

// ==================== МОДАЛКА РЕДАКТИРОВАНИЯ УРОКА ====================
export async function openLessonModal(lessonId) {
  openLessonForm({
    lessonId,
    onSuccess: () => {
      resetDashboardCache();
      initDashboard();
      if (window.updateAllLessonsTable) window.updateAllLessonsTable();
    }
  });
}

// ==================== КАСТОМНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ====================
export function showConfirmModal(message, onConfirm, onCancel = () => {}) {
  // Удаляем старое окно, если есть
  document.querySelector('.modal.confirm-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'modal confirm-modal';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 400px; text-align: center;">
      <div class="modal-header">
        <h3>Подтверждение</h3>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body" style="padding: 1.5rem 1rem;">
        <p style="font-size: 1.1rem; margin-bottom: 1.5rem;">${message}</p>
        <div class="modal-actions" style="justify-content: center; gap: 1rem;">
          <button class="btn btn-danger" id="confirmYesBtn">Подтвердить</button>
          <button class="btn btn-secondary" id="confirmNoBtn">Отмена</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const closeModal = () => {
    modal.remove();
    onCancel();
  };

  modal.querySelector('.close-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.querySelector('#confirmNoBtn').addEventListener('click', closeModal);
  modal.querySelector('#confirmYesBtn').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });

  // Закрытие по Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}