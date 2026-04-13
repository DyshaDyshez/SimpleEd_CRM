// modules/dashboard.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';

// --- КЭШ ДАННЫХ ДЛЯ ДАШБОРДА ---
let cachedStats = null;          // { totalLessons, totalEarnings }
let cachedUpcoming = null;       // массив ближайших уроков
let cachedCompleted = null;      // массив проведённых уроков
let dashboardLoaded = false;

// ==================== ИНИЦИАЛИЗАЦИЯ ГЛАВНОЙ ====================
export async function initDashboard() {
  try {
    if (!dashboardLoaded) {
      await loadAllDataFromSupabase();
      dashboardLoaded = true;
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
    // Статистика
    const [lessonsCountRes, paymentsRes] = await Promise.all([
      supabase.from('lessons').select('*', { count: 'exact', head: true })
        .eq('teacher_id', getCurrentUser().id)
        .eq('status', 'completed'),
      supabase.from('payments').select('amount')
        .eq('teacher_id', getCurrentUser().id)
        .eq('status', 'paid')
    ]);
    cachedStats = {
      totalLessons: lessonsCountRes.count || 0,
      totalEarnings: paymentsRes.data ? paymentsRes.data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) : 0
    };

    // Ближайшие уроки (до 5)
    const now = new Date().toISOString();
    const { data: upcoming } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'planned')
      .gte('lesson_date', now)
      .order('lesson_date', { ascending: true })
      .limit(5);
    cachedUpcoming = upcoming || [];

    // Проведённые уроки (последние 5)
    const { data: completed } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, notes, group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .eq('status', 'completed')
      .order('lesson_date', { ascending: false })
      .limit(5);
    cachedCompleted = completed || [];
  } catch (e) {
    console.error('Ошибка загрузки данных дашборда:', e);
  }

  
}

// ==================== РЕНДЕРИНГ ====================
function renderStats() {
  const totalLessonsEl = document.getElementById('totalLessonsCount');
  const totalEarningsEl = document.getElementById('totalEarnings');
  if (totalLessonsEl) totalLessonsEl.textContent = cachedStats?.totalLessons || 0;
  if (totalEarningsEl) totalEarningsEl.textContent = (cachedStats?.totalEarnings || 0).toFixed(0);
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
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    return `
      <div class="lesson-item">
        <span class="time">${date}</span>
        <div class="info">
          <strong>${name}</strong>
          ${l.topic ? `<span>${l.topic}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
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
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    const notes = l.notes ? `<small>${l.notes.substring(0, 50)}${l.notes.length > 50 ? '…' : ''}</small>` : '';
    return `
      <div class="lesson-item">
        <span class="time">${date}</span>
        <div class="info">
          <strong>${name}</strong>
          ${l.topic ? `<span>${l.topic}</span>` : ''}
          ${notes}
        </div>
      </div>
    `;
  }).join('');
}

// ==================== СБРОС КЭША ====================
export function resetDashboardCache() {
  dashboardLoaded = false;
  cachedStats = null;
  cachedUpcoming = null;
  cachedCompleted = null;
}

// ==================== МОДАЛКА ДОБАВЛЕНИЯ ПРОВЕДЁННОГО УРОКА ====================
async function showAddCompletedLessonModal() {
  const [groups, students] = await Promise.all([
    fetchGroupsForSelect(),
    fetchStudentsForSelect()
  ]);

  async function refreshStudentSelect(selectEl) {
    const freshStudents = await fetchStudentsForSelect();
    selectEl.innerHTML = '<option value="">Выберите ученика</option>' + 
      freshStudents.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('');
  }

  const modal = document.createElement('div');
  modal.className = 'modal add-completed-lesson';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 550px;">
      <div class="modal-header">
        <h3>Добавить проведённый урок</h3>
        <button class="close-modal">&times;</button>
      </div>
      <form id="completedLessonForm">
        <div class="form-group">
          <label>Тип занятия</label>
          <select id="lessonType">
            <option value="group">Группа</option>
            <option value="student">Индивидуально</option>
          </select>
        </div>
        <div class="form-group" id="groupSelectWrapper">
          <label>Группа *</label>
          <select id="groupSelect" required>
            <option value="">Выберите группу</option>
            ${groups.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group hidden" id="studentSelectWrapper">
          <label>Ученик *</label>
          <div style="display: flex; gap: 0.5rem;">
            <select id="studentSelect" style="flex:1;" required>
              <option value="">Выберите ученика</option>
              ${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm btn-secondary" id="quickAddStudentBtn">
              <i class="fas fa-plus"></i>
            </button>
          </div>
        </div>
        <div class="form-group">
          <label>Дата и время *</label>
          <input type="datetime-local" id="lessonDate" required>
        </div>
        <div class="form-group">
          <label>Тема</label>
          <input type="text" id="lessonTopic" placeholder="Например: Уравнения">
        </div>
        <div class="form-group">
          <label>Заметки</label>
          <textarea id="lessonNotes" rows="3" placeholder="Что прошли, что задано..."></textarea>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="lessonPaid"> Урок оплачен (списать 1 урок с баланса)
          </label>
          <small class="text-muted">Если отмечено, будет создан платёж на 1 урок</small>
        </div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-success">Сохранить</button>
          <button type="button" class="btn btn-secondary close-modal">Отмена</button>
        </div>
        <div id="completedLessonError" class="error-message"></div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);

  const typeSelect = modal.querySelector('#lessonType');
  const groupWrapper = modal.querySelector('#groupSelectWrapper');
  const studentWrapper = modal.querySelector('#studentSelectWrapper');
  const groupSelect = modal.querySelector('#groupSelect');
  const studentSelect = modal.querySelector('#studentSelect');
  const quickAddBtn = modal.querySelector('#quickAddStudentBtn');

  function toggleType() {
    if (typeSelect.value === 'group') {
      groupWrapper.classList.remove('hidden');
      studentWrapper.classList.add('hidden');
      groupSelect.required = true;
      studentSelect.required = false;
    } else {
      groupWrapper.classList.add('hidden');
      studentWrapper.classList.remove('hidden');
      groupSelect.required = false;
      studentSelect.required = true;
    }
  }
  typeSelect.addEventListener('change', toggleType);
  toggleType();

  quickAddBtn.addEventListener('click', async () => {
    const name = prompt('Введите имя нового ученика:');
    if (!name || !name.trim()) return;
    try {
      const { data: newStudent, error } = await supabase
        .from('students')
        .insert({ teacher_id: getCurrentUser().id, child_name: name.trim(), status: 'active' })
        .select('id, child_name')
        .single();
      if (error) throw error;
      await refreshStudentSelect(studentSelect);
      studentSelect.value = newStudent.id;
    } catch (err) {
      alert('Ошибка создания ученика: ' + err.message);
    }
  });

  modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));

  modal.querySelector('#completedLessonForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = modal.querySelector('#completedLessonError');
    errorDiv.textContent = '';

    const type = typeSelect.value;
    const lessonDate = modal.querySelector('#lessonDate').value;
    const topic = modal.querySelector('#lessonTopic').value.trim() || null;
    const notes = modal.querySelector('#lessonNotes').value.trim() || null;
    const isPaid = modal.querySelector('#lessonPaid').checked;

    if (!lessonDate) {
      errorDiv.textContent = 'Выберите дату и время';
      return;
    }

    let groupId = null;
    let studentId = null;
    if (type === 'group') {
      groupId = groupSelect.value;
      if (!groupId) {
        errorDiv.textContent = 'Выберите группу';
        return;
      }
    } else {
      studentId = studentSelect.value;
      if (!studentId) {
        errorDiv.textContent = 'Выберите ученика';
        return;
      }
    }

    const localDate = new Date(lessonDate);
    const utcDate = localDate.toISOString();

    const { data: newLesson, error: lessonError } = await supabase
      .from('lessons')
      .insert({
        teacher_id: getCurrentUser().id,
        group_id: groupId,
        student_id: studentId,
        lesson_date: utcDate,
        topic,
        notes,
        status: 'completed'
      })
      .select('id')
      .single();

    if (lessonError) {
      errorDiv.textContent = `Ошибка создания урока: ${lessonError.message}`;
      return;
    }

    if (isPaid && studentId) {
      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          teacher_id: getCurrentUser().id,
          student_id: studentId,
          lessons_paid: 1,
          payment_date: new Date().toISOString().split('T')[0],
          status: 'paid',
          description: `Оплата урока ${new Date(lessonDate).toLocaleDateString()}`
        });
      if (paymentError) console.error('Ошибка создания платежа:', paymentError);
    }

    modal.remove();
    // Сбрасываем кэш и перезагружаем данные
    resetDashboardCache();
    await loadAllDataFromSupabase();
    renderStats();
    renderUpcomingLessons();
    renderCompletedLessons();
  });
}

function bindDashboardEvents() {
  document.getElementById('addCompletedLessonBtn')?.addEventListener('click', showAddCompletedLessonModal);
}