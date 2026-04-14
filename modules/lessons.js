// modules/lessons.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { renderPage } from './ui.js';
import { fetchStudentsForSelect } from './students.js';
import { fetchGroupsForSelect } from './groups.js';

let allLessons = [];
let studentsList = [];
let groupsList = [];
let lessonsLoaded = false;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initLessonsPage() {
  renderPage('lessons');
  
  if (!lessonsLoaded) {
    await loadData();
    lessonsLoaded = true;
  }
  renderFilters();
  renderTable();
  bindEvents();

  // В конце файла, после initLessonsPage:
window.updateAllLessonsTable = async function() {
    await loadData();
    renderTable();
  };
}

async function loadData() {
  const [lessonsRes, studentsRes, groupsRes] = await Promise.all([
    supabase
      .from('lessons')
      .select(`
        *,
        student_groups ( group_name ),
        students ( child_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .order('lesson_date', { ascending: false }),
    fetchStudentsForSelect(),
    fetchGroupsForSelect()
  ]);
  
  allLessons = lessonsRes.data || [];
  studentsList = studentsRes || [];
  groupsList = groupsRes || [];
}

function renderFilters() {
  const studentSelect = document.getElementById('lessonsFilterStudent');
  const groupSelect = document.getElementById('lessonsFilterGroup');
  
  studentSelect.innerHTML = '<option value="">Все ученики</option>';
  studentsList.forEach(s => {
    studentSelect.innerHTML += `<option value="${s.id}">${s.child_name}</option>`;
  });
  
  groupSelect.innerHTML = '<option value="">Все группы</option>';
  groupsList.forEach(g => {
    groupSelect.innerHTML += `<option value="${g.id}">${g.group_name}</option>`;
  });
}

function getFilteredLessons() {
  const dateFrom = document.getElementById('lessonsFilterDateFrom')?.value;
  const dateTo = document.getElementById('lessonsFilterDateTo')?.value;
  const studentId = document.getElementById('lessonsFilterStudent')?.value;
  const groupId = document.getElementById('lessonsFilterGroup')?.value;
  const status = document.getElementById('lessonsFilterStatus')?.value;
  
  return allLessons.filter(l => {
    if (dateFrom && l.lesson_date < dateFrom) return false;
    if (dateTo && l.lesson_date > dateTo + 'T23:59:59') return false;
    if (studentId && l.student_id !== studentId) return false;
    if (groupId && l.group_id !== groupId) return false;
    if (status && l.status !== status) return false;
    return true;
  });
}

function renderTable() {
  const tbody = document.getElementById('allLessonsTableBody');
  if (!tbody) return;
  
  const filtered = getFilteredLessons();
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7">Нет уроков</td></tr>';
    return;
  }
  
  tbody.innerHTML = filtered.map(l => {
    const name = l.student_groups?.group_name || l.students?.child_name || '—';
    const date = new Date(l.lesson_date).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });
    const statusText = {
      'planned': 'Запланирован',
      'completed': 'Проведён',
      'cancelled': 'Отменён'
    }[l.status] || l.status;
    
    return `
      <tr>
        <td>${date}</td>
        <td>${name}</td>
        <td>${l.topic || '—'}</td>
        <td><span class="badge ${l.status}">${statusText}</span></td>
        <td>${l.attended ? '✅' : '❌'}</td>
        <td>${l.notes ? l.notes.substring(0, 30) + (l.notes.length > 30 ? '…' : '') : '—'}</td>
        <td>
          <button class="btn-icon edit-lesson-btn" data-id="${l.id}" title="Редактировать">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn-icon delete-lesson-btn" data-id="${l.id}" title="Удалить">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  tbody.querySelectorAll('.edit-lesson-btn').forEach(btn => {
    btn.addEventListener('click', () => editLesson(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-lesson-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteLesson(btn.dataset.id));
  });
}

async function editLesson(lessonId) {
    const { openLessonModal } = await import('./dashboard.js');
    openLessonModal(lessonId);
  }

async function deleteLesson(lessonId) {
  if (!confirm('Удалить урок?')) return;
  
  const { error } = await supabase
    .from('lessons')
    .delete()
    .eq('id', lessonId);
    
  if (error) {
    alert('Ошибка удаления: ' + error.message);
    return;
  }
  
  allLessons = allLessons.filter(l => l.id !== lessonId);
  renderTable();
}

async function showAddLessonModal() {
  const { showAddCompletedLessonModal } = await import('./dashboard.js');
  showAddCompletedLessonModal();
}

function resetFilters() {
  document.getElementById('lessonsFilterDateFrom').value = '';
  document.getElementById('lessonsFilterDateTo').value = '';
  document.getElementById('lessonsFilterStudent').value = '';
  document.getElementById('lessonsFilterGroup').value = '';
  document.getElementById('lessonsFilterStatus').value = '';
  renderTable();
}

function bindEvents() {
  document.getElementById('applyLessonsFiltersBtn')?.addEventListener('click', renderTable);
  document.getElementById('resetLessonsFiltersBtn')?.addEventListener('click', resetFilters);
  document.getElementById('addLessonFromJournalBtn')?.addEventListener('click', showAddLessonModal);
}

export function resetLessonsCache() {
  lessonsLoaded = false;
  allLessons = [];
}


