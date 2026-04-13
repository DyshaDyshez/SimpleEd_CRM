// modules/dashboard.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';

// ==================== ИНИЦИАЛИЗАЦИЯ ГЛАВНОЙ ====================
export async function initDashboard() {
  console.log('🚀 Инициализация дашборда...');
  try {
    await Promise.all([
      loadStatistics(),
      loadUpcomingLessons(),
      loadCompletedLessons()
    ]);
    bindDashboardEvents();
    console.log('✅ Дашборд загружен');
  } catch (error) {
    console.error('❌ Ошибка в initDashboard:', error);
  }
}

// ==================== СТАТИСТИКА ====================
async function loadStatistics() {
  try {
    console.log('📊 Загрузка статистики...');
    const teacherId = getCurrentUser().id;
    console.log('teacherId:', teacherId);

    // Количество завершённых уроков
    const { count: lessonsCount, error: lessonsError } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', teacherId)
      .eq('status', 'completed');

    if (lessonsError) {
      console.error('Ошибка загрузки уроков:', lessonsError);
    } else {
      console.log('Завершённых уроков:', lessonsCount);
      const el = document.getElementById('totalLessonsCount');
      if (el) el.textContent = lessonsCount || 0;
    }

    // Сумма оплат (только успешные)
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('amount')
      .eq('teacher_id', teacherId)
      .eq('status', 'paid');

    if (paymentsError) {
      console.error('Ошибка загрузки оплат:', paymentsError);
    } else {
      const total = payments?.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) || 0;
      console.log('Сумма оплат:', total);
      const el = document.getElementById('totalEarnings');
      if (el) el.textContent = total.toFixed(0);
    }
  } catch (err) {
    console.error('Критическая ошибка в loadStatistics:', err);
  }
}

// ==================== БЛИЖАЙШИЕ УРОКИ ====================
async function loadUpcomingLessons() {
  const container = document.getElementById('upcomingLessonsList');
  if (!container) {
    console.warn('Контейнер #upcomingLessonsList не найден');
    return;
  }

  try {
    const teacherId = getCurrentUser().id;
    const now = new Date().toISOString();
    console.log('🔜 Загрузка ближайших уроков...');

    const { data, error } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', teacherId)
      .eq('status', 'planned')
      .gte('lesson_date', now)
      .order('lesson_date', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Ошибка загрузки ближайших уроков:', error);
      container.innerHTML = '<p class="text-muted">Ошибка загрузки</p>';
      return;
    }

    console.log('Найдено ближайших уроков:', data?.length || 0);
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">Нет запланированных уроков</p>';
      return;
    }

    container.innerHTML = data.map(l => {
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
  } catch (err) {
    console.error('Ошибка в loadUpcomingLessons:', err);
  }
}

// ==================== ПРОВЕДЁННЫЕ УРОКИ (последние 5) ====================
async function loadCompletedLessons() {
  const container = document.getElementById('completedLessonsList');
  if (!container) {
    console.warn('Контейнер #completedLessonsList не найден');
    return;
  }

  try {
    const teacherId = getCurrentUser().id;
    console.log('✅ Загрузка проведённых уроков...');

    const { data, error } = await supabase
      .from('lessons')
      .select(`
        id, lesson_date, topic, notes, group_id, student_id,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', teacherId)
      .eq('status', 'completed')
      .order('lesson_date', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Ошибка загрузки проведённых уроков:', error);
      container.innerHTML = '<p class="text-muted">Ошибка загрузки</p>';
      return;
    }

    console.log('Найдено проведённых уроков:', data?.length || 0);
    if (!data || data.length === 0) {
      container.innerHTML = '<p class="text-muted">Нет проведённых уроков</p>';
      return;
    }

    container.innerHTML = data.map(l => {
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
  } catch (err) {
    console.error('Ошибка в loadCompletedLessons:', err);
  }
}

// ==================== ДОБАВЛЕНИЕ ПРОВЕДЁННОГО УРОКА ВРУЧНУЮ ====================
async function showAddCompletedLessonModal() {
  try {
    const [groups, students] = await Promise.all([
      fetchGroupsForSelect(),
      fetchStudentsForSelect()
    ]);

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
            <select id="studentSelect">
              <option value="">Выберите ученика</option>
              ${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}
            </select>
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
          <div class="modal-actions">
            <button type="submit" class="btn btn-success">Сохранить</button>
            <button type="button" class="btn btn-secondary close-modal">Отмена</button>
          </div>
          <div id="completedLessonError" class="error-message"></div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    // Переключение типа
    const typeSelect = modal.querySelector('#lessonType');
    const groupWrapper = modal.querySelector('#groupSelectWrapper');
    const studentWrapper = modal.querySelector('#studentSelectWrapper');
    const groupSelect = modal.querySelector('#groupSelect');
    const studentSelect = modal.querySelector('#studentSelect');

    typeSelect.addEventListener('change', () => {
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

      const { error } = await supabase.from('lessons').insert({
        teacher_id: getCurrentUser().id,
        group_id: groupId,
        student_id: studentId,
        lesson_date: utcDate,
        topic,
        notes,
        status: 'completed'
      });

      if (error) {
        errorDiv.textContent = `Ошибка: ${error.message}`;
        return;
      }

      modal.remove();
      // Обновить данные на главной
      await loadStatistics();
      await loadCompletedLessons();
    });

  } catch (err) {
    console.error('Ошибка в showAddCompletedLessonModal:', err);
    alert('Не удалось открыть форму добавления урока');
  }
}

function bindDashboardEvents() {
  const btn = document.getElementById('addCompletedLessonBtn');
  if (btn) {
    btn.addEventListener('click', showAddCompletedLessonModal);
  } else {
    console.warn('Кнопка #addCompletedLessonBtn не найдена');
  }
}