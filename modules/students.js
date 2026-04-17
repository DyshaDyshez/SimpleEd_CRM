// modules/students.js
import supabase from './supabaseClient.js';
import { getDOMElements, showError, clearError } from './ui.js';
import { getCurrentUser, getTeacherProfile } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import CONFIG from './config.js';

let editingStudentId = null;
let groupsList = [];
let studentsLoaded = false;
let cachedStudentsData = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initStudentsPage() {
  try {
    groupsList = await fetchGroupsForSelect();
    if (!studentsLoaded) {
      await loadStudentsTable();
      studentsLoaded = true;
    } else {
      await renderCachedTable();
    }
    renderStudentForm();
    bindAddStudentButton();
  } catch (error) {
    console.error(error);
    showError('contentArea', 'Ошибка загрузки учеников.');
  }
}

async function loadStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7">Загрузка...</td></tr>';
  
  try {
    const { data: students, error: studentsError } = await supabase
      .from('students')
      .select(`
        id, child_name, parent_name, phone_number, child_age, group_id, status, parent_pain,
        student_groups ( group_name )
      `)
      .eq('teacher_id', getCurrentUser().id)
      .order('child_name');
      
    if (studentsError) throw studentsError;
    if (!students?.length) {
      tbody.innerHTML = '<tr><td colspan="7">Нет учеников</td></tr>';
      return;
    }

    const studentIds = students.map(s => s.id);

    const [{ data: payments }, { data: completedLessons }] = await Promise.all([
      supabase.from('payments')
        .select('student_id, lessons_paid, lessons_used, status')
        .in('student_id', studentIds)
        .eq('status', 'paid'),
      supabase.from('lessons')
        .select('student_id, payment_id')
        .in('student_id', studentIds)
        .eq('status', 'completed')
    ]);

    const balanceMap = new Map();
    
    students.forEach(s => {
      const studentPayments = (payments || []).filter(p => p.student_id === s.id);
      const totalPaid = studentPayments.reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
      const studentLessons = (completedLessons || []).filter(l => l.student_id === s.id);
      const totalUsed = studentLessons.filter(l => l.payment_id).length;
      balanceMap.set(s.id, totalPaid - totalUsed);
    });

    cachedStudentsData = students.map(s => ({
      ...s,
      balance: balanceMap.get(s.id) || 0
    }));
    
    renderTableFromData(cachedStudentsData);
    
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="7">Ошибка: ${error.message}</td></tr>`;
  }
}

async function renderCachedTable() {
  if (cachedStudentsData) renderTableFromData(cachedStudentsData);
  else await loadStudentsTable();
}

function renderTableFromData(data) {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="7">Нет учеников</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(s => {
    const groupName = s.student_groups?.group_name || '—';
    const statusClass = s.status === 'active' ? 'badge active' : 'badge inactive';
    const statusText = s.status === 'active' ? 'Активен' : 'Неактивен';
    const balance = s.balance || 0;
    const balanceColor = balance > 0 ? '#2C4C3B' : (balance < 0 ? '#d32f2f' : 'inherit');
    
    return `
      <tr>
        <td>${s.child_name}</td>
        <td>${s.parent_name || '—'}</td>
        <td>${s.phone_number || '—'}</td>
        <td>${groupName}</td>
        <td><span class="${statusClass}">${statusText}</span></td>
        <td style="font-weight: bold; color: ${balanceColor};">
          ${balance > 0 ? '+' : ''}${balance} урок(ов)
        </td>
        <td>
          <button class="btn-icon open-student" data-id="${s.id}" title="Открыть"><i class="fas fa-eye"></i></button>
          <button class="btn-icon edit-student" data-id="${s.id}" title="Редактировать"><i class="fas fa-edit"></i></button>
          <button class="btn-icon delete-student" data-id="${s.id}" title="Удалить"><i class="fas fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
  
  document.querySelectorAll('.open-student').forEach(btn => btn.addEventListener('click', () => openStudentCard(btn.dataset.id)));
  document.querySelectorAll('.edit-student').forEach(btn => btn.addEventListener('click', () => loadAndEditStudent(btn.dataset.id)));
  document.querySelectorAll('.delete-student').forEach(btn => btn.addEventListener('click', () => deleteStudentById(btn.dataset.id)));
}

export function resetStudentsCache() {
  studentsLoaded = false;
  cachedStudentsData = null;
}

function bindAddStudentButton() {
  document.getElementById('addStudentBtn')?.addEventListener('click', () => {
    editingStudentId = null;
    renderStudentForm();
    document.getElementById('studentFormContainer').classList.remove('hidden');
  });
}

function renderStudentForm(student = null) {
  const container = document.getElementById('studentFormContainer');
  if (!container) return;
  const isEditing = !!student;
  container.innerHTML = `
    <div class="form-card">
      <h3>${isEditing ? 'Редактировать ученика' : 'Добавить ученика'}</h3>
      <form id="studentForm">
        <div class="form-grid">
          <div class="form-group"><label>Имя *</label><input id="childName" value="${student?.child_name || ''}" required></div>
          <div class="form-group"><label>Родитель</label><input id="parentName" value="${student?.parent_name || ''}"></div>
          <div class="form-group"><label>Телефон</label><input id="phoneNumber" value="${student?.phone_number || ''}"></div>
          <div class="form-group"><label>Возраст</label><input type="number" id="childAge" value="${student?.child_age || ''}"></div>
          <div class="form-group"><label>Группа</label><select id="groupId"><option value="">Без группы</option>${groupsList.map(g => `<option value="${g.id}" ${student?.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}</select></div>
          <div class="form-group"><label>Статус</label><select id="status"><option value="active" ${student?.status === 'active' ? 'selected' : ''}>Активен</option><option value="inactive" ${student?.status === 'inactive' ? 'selected' : ''}>Неактивен</option></select></div>
        </div>
        <div class="form-group"><label>Заметка</label><textarea id="parentPain" rows="3">${student?.parent_pain || ''}</textarea></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${isEditing ? 'Сохранить' : 'Создать'}</button>
          <button type="button" class="btn btn-secondary" id="cancelStudentForm">Отмена</button>
        </div>
        <div id="studentFormError" class="error-message"></div>
      </form>
    </div>
  `;
  document.getElementById('studentForm').addEventListener('submit', saveStudent);
  document.getElementById('cancelStudentForm').addEventListener('click', () => {
    container.classList.add('hidden');
    clearError('studentFormError');
  });
}

async function saveStudent(e) {
  e.preventDefault();
  clearError('studentFormError');
  const errorDiv = document.getElementById('studentFormError');
  const childName = document.getElementById('childName').value.trim();
  if (!childName) return showError('studentFormError', 'Введите имя');
  const studentData = {
    teacher_id: getCurrentUser().id,
    child_name: childName,
    parent_name: document.getElementById('parentName').value.trim() || null,
    phone_number: document.getElementById('phoneNumber').value.trim() || null,
    child_age: parseInt(document.getElementById('childAge').value) || null,
    group_id: document.getElementById('groupId').value || null,
    status: document.getElementById('status').value,
    parent_pain: document.getElementById('parentPain').value.trim() || null
  };
  let res;
  if (editingStudentId) {
    res = await supabase.from('students').update(studentData).eq('id', editingStudentId);
  } else {
    res = await supabase.from('students').insert(studentData);
  }
  if (res.error) return showError('studentFormError', res.error.message);
  document.getElementById('studentFormContainer').classList.add('hidden');
  editingStudentId = null;
  resetStudentsCache();
if (window.updateAllLessonsTable) window.updateAllLessonsTable();
resetDashboardCache?.(); // если влияет на дашборд
}

async function loadAndEditStudent(id) {
  const { data, error } = await supabase.from('students').select('*').eq('id', id).single();
  if (error) return alert('Ошибка загрузки');
  editingStudentId = id;
  renderStudentForm(data);
  document.getElementById('studentFormContainer').classList.remove('hidden');
}

async function deleteStudentById(id) {
  if (!confirm('Удалить ученика?')) return;
  const { error } = await supabase.from('students').delete().eq('id', id);
  if (error) alert(error.message);
  else {
    resetStudentsCache();
    await loadStudentsTable();
    if (window.updateAllLessonsTable) window.updateAllLessonsTable();
  }
}

// ==================== КАРТОЧКА УЧЕНИКА ====================
export async function openStudentCard(studentId) {
  document.querySelector('.modal.student-card')?.remove();
  const { data: student, error } = await supabase
    .from('students')
    .select('*, student_groups(group_name)')
    .eq('id', studentId)
    .single();
  if (error) return alert('Ученик не найден');

  const [{ data: payments }, { data: lessons }, { data: usedPayments }] = await Promise.all([
    supabase.from('payments').select('*').eq('student_id', studentId).order('payment_date', { ascending: false }),
    supabase.from('lessons').select('*').eq('student_id', studentId).order('lesson_date', { ascending: false }),
    supabase.from('payments').select('id, payment_date, amount, lessons_paid, lessons_used').eq('student_id', studentId).eq('status', 'paid')
  ]);
  
  const paymentsData = payments || [];
  const lessonsData = lessons || [];
  const usedPaymentsData = usedPayments || [];
  const totalPaidLessons = paymentsData.reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
  const completedLessons = lessonsData.filter(l => l.status === 'completed' || l.attended === true).length;
  const balance = totalPaidLessons - completedLessons;

  const modal = document.createElement('div');
  modal.className = 'modal student-card';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 750px;">
      <div class="modal-header">
        <h2>${student.child_name} ${balance === 1 ? '⚠️ Остался 1 урок' : ''}</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="tabs">
        <button class="tab" data-tab="info">Информация</button>
        <button class="tab" data-tab="payments">Оплаты</button>
        <button class="tab" data-tab="lessons">Уроки</button>
        <button class="tab active" data-tab="report">Отчёт</button>
      </div>
      <div class="tab-content" id="studentInfoTab">
        ${renderStudentInfo(student, balance)}
      </div>
      <div class="tab-content" id="studentPaymentsTab">
        ${await renderPaymentsTab(studentId, paymentsData, totalPaidLessons)}
      </div>
      <div class="tab-content" id="studentLessonsTab">
        ${renderLessonsTab(lessonsData, usedPaymentsData)}
      </div>
      <div class="tab-content active" id="studentReportTab">
        ${await renderReportTab(student, lessonsData, paymentsData)}
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = `student${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}Tab`;
      modal.querySelector(`#${targetId}`).classList.add('active');
    });
  });

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  const startInput = modal.querySelector('#reportStartDate');
  const endInput = modal.querySelector('#reportEndDate');
  const previewDiv = modal.querySelector('#reportPreview');
  const recommendationsTextarea = modal.querySelector('#reportRecommendations');

  async function updateReport() {
    const start = startInput.value;
    const end = endInput.value;
    const filteredLessons = lessonsData.filter(l =>
      (l.status === 'completed' || l.attended === true) &&
      l.lesson_date >= start &&
      l.lesson_date <= end
    );

    const completedCount = filteredLessons.length;

    let reportText = `📊 ОТЧЁТ ПО УЧЕНИКУ
👤 Имя: ${student.child_name}

📅 Период: ${new Date(start).toLocaleDateString('ru-RU')} – ${new Date(end).toLocaleDateString('ru-RU')}

═══════════════════════════════

📈 СТАТИСТИКА
✅ Проведено уроков: ${completedCount}

═══════════════════════════════

📚 ПРОЙДЕННЫЕ ТЕМЫ
`;

    if (filteredLessons.length > 0) {
      filteredLessons.forEach(l => {
        reportText += `• ${new Date(l.lesson_date).toLocaleDateString('ru-RU')} – ${l.topic || 'без темы'}\n`;
      });
    } else {
      reportText += 'Нет проведённых уроков за этот период\n';
    }

    reportText += `
═══════════════════════════════

💡 РЕКОМЕНДАЦИИ
    ${recommendationsTextarea?.value || '(введите или сгенерируйте рекомендации)'}

═══════════════════════════════

📅 БЛИЖАЙШИЕ УРОКИ
`;

    const upcomingLessons = lessonsData.filter(l => l.status === 'planned' && l.lesson_date >= new Date().toISOString()).slice(0, 3);
    if (upcomingLessons.length > 0) {
      upcomingLessons.forEach(l => {
        reportText += `• ${new Date(l.lesson_date).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} – ${l.topic || 'без темы'}\n`;
      });
    } else {
      reportText += 'Нет запланированных уроков\n';
    }

    reportText += `
═══════════════════════════════
С уважением,
${getTeacherProfile()?.teacher_name || 'Ваш преподаватель'}
SimpleEd CRM`;

    previewDiv.innerHTML = reportText.split('\n\n').map(block => `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
  }

  modal.querySelector('#generateReportBtn')?.addEventListener('click', updateReport);

  modal.querySelectorAll('.quick-period').forEach(btn => {
    btn.addEventListener('click', () => {
      const period = btn.dataset.period;
      const now = new Date();
      let start, end;

      switch (period) {
        case 'week':
          start = new Date(now); start.setDate(now.getDate() - 7); end = now;
          break;
        case 'month':
          start = new Date(now); start.setDate(now.getDate() - 30); end = now;
          break;
        case '3lessons':
        case '5lessons':
          const count = period === '3lessons' ? 3 : 5;
          const completedLessons = lessonsData
            .filter(l => l.status === 'completed' || l.attended === true)
            .sort((a, b) => new Date(b.lesson_date) - new Date(a.lesson_date))
            .slice(0, count);
          if (completedLessons.length > 0) {
            start = new Date(completedLessons[completedLessons.length - 1].lesson_date);
            end = new Date(completedLessons[0].lesson_date);
          } else {
            start = now; end = now;
          }
          break;
      }
      startInput.value = start.toISOString().split('T')[0];
      endInput.value = end.toISOString().split('T')[0];
      updateReport();
      modal.querySelectorAll('.quick-period').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  updateReport();

  modal.querySelector('#copyReportBtn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(previewDiv.innerText);
    alert('Отчёт скопирован в буфер обмена!');
  });

  modal.querySelector('#downloadReportBtn')?.addEventListener('click', () => {
    const blob = new Blob([previewDiv.innerText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${student.child_name}_${startInput.value}_${endInput.value}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  modal.querySelector('#aiRecommendBtn')?.addEventListener('click', async () => {
    const btn = modal.querySelector('#aiRecommendBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерация...';
    try {
      const start = startInput.value;
      const end = endInput.value;
      const filteredLessons = lessonsData.filter(l =>
        (l.status === 'completed' || l.attended === true) &&
        l.lesson_date >= start && l.lesson_date <= end
      );
      const stats = {
        completed: filteredLessons.length,
        missed: lessonsData.filter(l => l.status === 'cancelled' && l.lesson_date >= start && l.lesson_date <= end).length
      };
      const notes = filteredLessons.map(l => l.notes).filter(Boolean).join(' ');
      const response = await fetch('https://yyohojhvayfcwiqrdiqf.supabase.co/functions/v1/super-function', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          student: { child_name: student.child_name, child_age: student.child_age },
          period: { start, end },
          stats,
          lessons: filteredLessons.map(l => ({ topic: l.topic })),
          notes
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      recommendationsTextarea.value = data.recommendations;
    } catch (err) {
      console.error('Ошибка генерации:', err);
      alert('Не удалось сгенерировать рекомендации: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-robot"></i> ✨ Сгенерировать с ИИ';
    }
  });

  modal.querySelector('#applyRecommendationsBtn')?.addEventListener('click', () => {
    updateReport();
    const btn = modal.querySelector('#applyRecommendationsBtn');
    btn.innerHTML = '<i class="fas fa-check"></i> Обновлено!';
    setTimeout(() => btn.innerHTML = '<i class="fas fa-sync-alt"></i> Обновить отчёт', 1500);
  });

  modal.querySelector('#addPaymentBtn')?.addEventListener('click', () => showPaymentForm(studentId, modal));
  modal.querySelector('#editStudentFromCard')?.addEventListener('click', () => {
    modal.remove();
    loadAndEditStudent(studentId);
    document.getElementById('studentFormContainer').classList.remove('hidden');
  });

  // Кнопка "Напомнить об оплате"
  if (balance === 1) {
    const remindBtn = document.createElement('button');
    remindBtn.className = 'btn btn-warning btn-sm';
    remindBtn.style.marginLeft = '1rem';
    remindBtn.innerHTML = '<i class="fas fa-bell"></i> Напомнить об оплате';
    remindBtn.addEventListener('click', () => showPaymentReminderModal(student, lessonsData));
    modal.querySelector('.modal-header').appendChild(remindBtn);
  }

  await syncUnlinkedLessons(studentId, lessonsData);
}

function renderStudentInfo(student, balance) {
  return `
    <div style="padding: 1rem;">
      <p><strong>Возраст:</strong> ${student.child_age || '—'}</p>
      <p><strong>Родитель:</strong> ${student.parent_name || '—'}</p>
      <p><strong>Телефон:</strong> ${student.phone_number || '—'}</p>
      <p><strong>Группа:</strong> ${student.student_groups?.group_name || '—'}</p>
      <p><strong>Статус:</strong> ${student.status === 'active' ? 'Активен' : 'Неактивен'}</p>
      <p><strong>Заметка:</strong> ${student.parent_pain || '—'}</p>
      ${balance === 1 ? '<p style="color: #d32f2f;"><i class="fas fa-exclamation-triangle"></i> Остался всего 1 оплаченный урок!</p>' : ''}
      <button class="btn btn-primary btn-sm" id="editStudentFromCard"><i class="fas fa-edit"></i> Редактировать</button>
    </div>
  `;
}

async function renderPaymentsTab(studentId, payments, totalPaidLessons) {
  let html = `
    <div style="padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div><strong>Всего оплачено уроков:</strong> <span style="font-size:1.2rem;">${totalPaidLessons}</span></div>
        <button class="btn btn-primary btn-sm" id="addPaymentBtn"><i class="fas fa-plus"></i> Добавить платёж</button>
      </div>
      <table style="width:100%;">
        <thead><tr><th>Дата</th><th>Сумма</th><th>Уроков</th><th>Период</th><th>Заметка</th><th>Статус</th></tr></thead>
        <tbody>
  `;
  if (payments.length) {
    payments.forEach(p => {
      const period = p.period_start ? `${p.period_start} – ${p.period_end}` : '—';
      html += `<tr>
        <td>${p.payment_date}</td>
        <td>${p.amount ? p.amount + ' ₽' : '—'}</td>
        <td>${p.lessons_paid || '—'}</td>
        <td>${period}</td>
        <td>${p.description || '—'}</td>
        <td>${p.status === 'paid' ? '✅' : '❌'}</td>
      </tr>`;
    });
  } else {
    html += '<tr><td colspan="6">Нет платежей</td></tr>';
  }
  html += `</tbody></table></div>`;
  return html;
}

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

function renderLessonsTab(lessons, payments) {
  let html = `<div style="padding:1rem;"><table style="width:100%;"><thead><tr>
    <th>Дата</th><th>Тема</th><th>Статус</th><th>Списание</th><th>Заметки</th>
  </tr></thead><tbody>`;
  
  if (lessons && lessons.length) {
    lessons.forEach(l => {
      let spentInfo = '';
      let spentClass = '';
      
      if (l.is_free) {
        spentInfo = '🎁 Бесплатный';
        spentClass = 'free-lesson';
      } else if (l.payment_id) {
        const usedPayment = payments.find(p => p.id === l.payment_id);
        if (usedPayment) {
          const remaining = (usedPayment.lessons_paid || 0) - (usedPayment.lessons_used || 0);
          spentInfo = `✅ ${formatDate(usedPayment.payment_date)} (ост. ${remaining})`;
          spentClass = 'paid-lesson';
        } else {
          spentInfo = '⚠️ Долг';
          spentClass = 'debt-lesson';
        }
      } else if (l.status === 'completed') {
        spentInfo = '⚠️ Долг';
        spentClass = 'debt-lesson';
      } else {
        spentInfo = '—';
      }
      
      html += `<tr>
        <td>${new Date(l.lesson_date).toLocaleString('ru-RU')}</td>
        <td>${l.topic || '—'}</td>
        <td>${l.status || '—'}</td>
        <td class="${spentClass}">${spentInfo}</td>
        <td>${l.notes || '—'}</td>
      </tr>`;
    });
  } else {
    html += '<tr><td colspan="5">Нет проведённых уроков</td></tr>';
  }
  html += `</tbody></table></div>`;
  return html;
}

async function renderReportTab(student, lessons, payments) {
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(now.getDate() - 30);
  const startDate = monthAgo.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];
  return `
    <div style="padding: 1rem;">
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
        <button class="btn btn-sm btn-outline quick-period" data-period="week"><i class="fas fa-calendar-week"></i> Неделя</button>
        <button class="btn btn-sm btn-outline quick-period" data-period="month"><i class="fas fa-calendar-alt"></i> Месяц</button>
        <button class="btn btn-sm btn-outline quick-period" data-period="3lessons"><i class="fas fa-list"></i> Последние 3 урока</button>
        <button class="btn btn-sm btn-outline quick-period" data-period="5lessons"><i class="fas fa-list"></i> Последние 5 уроков</button>
      </div>
      <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; align-items: center; flex-wrap: wrap;">
        <div class="date-input-wrapper"><label>Период с:</label><input type="date" id="reportStartDate" value="${startDate}"></div>
        <div class="date-input-wrapper"><label>по:</label><input type="date" id="reportEndDate" value="${endDate}"></div>
        <button class="btn btn-primary btn-sm" id="generateReportBtn"><i class="fas fa-sync-alt"></i> Обновить</button>
      </div>
      <details style="margin-bottom: 1.5rem;">
        <summary style="cursor: pointer; font-weight: 600; color: var(--text-secondary);"><i class="fas fa-chevron-right"></i> Предпросмотр отчёта (развернуть)</summary>
        <div id="reportPreview" style="background: var(--neutral-light); padding: 1rem; border-radius: 8px; font-family: 'Courier New', monospace; white-space: pre-wrap; line-height: 1.4; max-height: 300px; overflow-y: auto; margin-top: 0.75rem; font-size: 0.85rem; border: 1px solid var(--neutral-gray);">Выберите период и нажмите «Обновить»</div>
      </details>
      <div style="margin-bottom: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-success btn-sm" id="copyReportBtn"><i class="fas fa-copy"></i> Копировать</button>
        <button class="btn btn-secondary btn-sm" id="downloadReportBtn"><i class="fas fa-download"></i> Скачать TXT</button>
      </div>
      <div style="margin-top: 1rem;">
        <label style="font-weight: 600; margin-bottom: 0.5rem; display: block;"><i class="fas fa-star" style="color: var(--primary-warm);"></i> Рекомендации (можно редактировать):</label>
        <textarea id="reportRecommendations" rows="8" style="width: 100%; padding: 1rem; border-radius: 8px; border: 1px solid var(--neutral-gray); font-size: 0.95rem; line-height: 1.5; resize: vertical; min-height: 200px;" placeholder="Напишите рекомендации или сгенерируйте с помощью ИИ"></textarea>
        <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
          <button class="btn btn-primary btn-sm" id="aiRecommendBtn"><i class="fas fa-robot"></i> ✨ Сгенерировать с ИИ</button>
          <button class="btn btn-outline btn-sm" id="applyRecommendationsBtn"><i class="fas fa-sync-alt"></i> Обновить отчёт</button>
        </div>
      </div>
    </div>
  `;
}

async function showPaymentForm(studentId, parentModal) {
  const modal = document.createElement('div');
  modal.className = 'modal payment-form';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>Добавить платёж</h3>
      <form id="paymentForm">
        <div class="form-group"><label>Дата *</label><input type="date" id="paymentDate" required></div>
        <div class="form-group"><label>Сумма (₽)</label><input type="number" id="paymentAmount" step="0.01"></div>
        <div class="form-group"><label>Количество уроков</label><input type="number" id="paymentLessons"></div>
        <div class="form-group"><label>Начало периода</label><input type="date" id="periodStart"></div>
        <div class="form-group"><label>Конец периода</label><input type="date" id="periodEnd"></div>
        <div class="form-group"><label>Заметка</label><input id="paymentDescription"></div>
        <div class="form-group"><label>Статус</label><select id="paymentStatus"><option value="paid">Оплачен</option><option value="cancelled">Отменён</option></select></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">Сохранить</button>
          <button type="button" class="btn btn-secondary close-modal">Отмена</button>
        </div>
        <div id="paymentFormError" class="error-message"></div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.querySelector('#paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = modal.querySelector('#paymentFormError');
    const amount = modal.querySelector('#paymentAmount').value;
    const lessons = modal.querySelector('#paymentLessons').value;
    const periodStart = modal.querySelector('#periodStart').value;
    const periodEnd = modal.querySelector('#periodEnd').value;
    if (!amount && !lessons && !periodStart) {
      errorDiv.textContent = 'Укажите сумму, уроки или период';
      return;
    }
    const paymentData = {
      teacher_id: getCurrentUser().id,
      student_id: studentId,
      payment_date: modal.querySelector('#paymentDate').value,
      amount: amount || null,
      lessons_paid: lessons ? parseInt(lessons) : null,
      period_start: periodStart || null,
      period_end: periodEnd || null,
      description: modal.querySelector('#paymentDescription').value || null,
      status: modal.querySelector('#paymentStatus').value
    };
    const { error } = await supabase.from('payments').insert(paymentData);
    if (error) { errorDiv.textContent = error.message; return; }
    modal.remove();
    parentModal.remove();
    openStudentCard(studentId);
    if (window.updateAllLessonsTable) window.updateAllLessonsTable();
  });
}

// ==================== НАПОМИНАНИЕ ОБ ОПЛАТЕ ====================
async function showPaymentReminderModal(student, lessons) {
  const completedLessons = lessons.filter(l => l.status === 'completed' || l.attended === true);
  const lastLessons = completedLessons.slice(-5);
  const topics = lastLessons.map(l => l.topic || 'без темы').join(', ');
  
  const modal = document.createElement('div');
  modal.className = 'modal payment-reminder-modal';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 600px;">
      <div class="modal-header">
        <h3>📨 Напоминание об оплате</h3>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <p><strong>Ученик:</strong> ${student.child_name}</p>
        <p><strong>Проведено уроков:</strong> ${completedLessons.length}</p>
        <p><strong>Последние темы:</strong> ${topics || '—'}</p>
        
        <div class="form-group">
          <label>Ближайшие темы для изучения (можно редактировать):</label>
          <input type="text" id="nextTopics" placeholder="Например: Present Perfect, неправильные глаголы" style="width: 100%;">
        </div>
        
        <div class="form-group">
          <label>Сообщение родителю:</label>
          <textarea id="reminderMessage" rows="6" style="width: 100%;">Здравствуйте! У ${student.child_name} остался всего 1 оплаченный урок. Мы провели уже ${completedLessons.length} занятий, изучили темы: ${topics || 'различные темы'}. Чтобы не прерывать прогресс, пожалуйста, оплатите следующие занятия. В ближайшее время планируем изучать: [укажите темы]. Спасибо!</textarea>
        </div>
        
        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button class="btn btn-primary" id="generateAIMessageBtn">
            <i class="fas fa-robot"></i> ✨ Сгенерировать с ИИ
          </button>
          <button class="btn btn-success" id="copyReminderBtn">
            <i class="fas fa-copy"></i> Копировать
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  const textarea = modal.querySelector('#reminderMessage');
  const nextTopicsInput = modal.querySelector('#nextTopics');
  
  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('#copyReminderBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(textarea.value);
    alert('Сообщение скопировано!');
  });
  
  modal.querySelector('#generateAIMessageBtn').addEventListener('click', async () => {
    const btn = modal.querySelector('#generateAIMessageBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерация...';
    
    try {
      const response = await fetch('https://yyohojhvayfcwiqrdiqf.supabase.co/functions/v1/super-function', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          action: 'payment_reminder',
          student: { child_name: student.child_name },
          stats: { completed: completedLessons.length },
          topics: topics,
          nextTopics: nextTopicsInput.value || 'новые темы'
        })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      textarea.value = data.message || data.recommendations;
    } catch (err) {
      console.error('Ошибка генерации:', err);
      alert('Не удалось сгенерировать сообщение');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-robot"></i> ✨ Сгенерировать с ИИ';
    }
  });
}

export async function fetchStudentsForSelect() {
  const { data } = await supabase.from('students').select('id, child_name').eq('teacher_id', getCurrentUser().id).order('child_name');
  return data || [];
}

async function syncUnlinkedLessons(studentId, lessons) {
  const unlinkedCompletedLessons = lessons.filter(l => l.status === 'completed' && !l.payment_id);
  if (unlinkedCompletedLessons.length === 0) return;
  
  const { findAvailablePayment, linkLessonToPayment } = await import('./payment-utils.js');
  
  for (const lesson of unlinkedCompletedLessons) {
    const payment = await findAvailablePayment(studentId, lesson.lesson_date);
    if (payment) {
      await linkLessonToPayment(lesson.id, payment.id);
      lesson.payment_id = payment.id;
    }
  }
}