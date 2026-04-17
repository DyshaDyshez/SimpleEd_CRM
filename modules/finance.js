// modules/finance.js
import supabase from './supabaseClient.js';
import { renderPage } from './ui.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';

let allPayments = [];
let studentsList = [];
let groupsList = [];
let financeLoaded = false;


// ==================== КАСТОМНОЕ ОКНО ПОДТВЕРЖДЕНИЯ ====================
function showConfirmModal(message, onConfirm, onCancel = () => {}) {
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
                  <button class="btn btn-danger" id="confirmYesBtn">Да, удалить</button>
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

  const handleEscape = (e) => {
      if (e.key === 'Escape') {
          closeModal();
          document.removeEventListener('keydown', handleEscape);
      }
  };
  document.addEventListener('keydown', handleEscape);
}



export async function initFinancePage() {
  renderPage('finance');
  if (!financeLoaded) {
    await loadData();
    financeLoaded = true;
  }
  renderFilters();
  await loadPayments();
  bindEvents();
}

async function loadData() {
  [studentsList, groupsList] = await Promise.all([
    fetchStudentsForSelect(),
    fetchGroupsForSelect()
  ]);
}

async function loadPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select(`*, students ( child_name ), student_groups ( group_name )`)
    .eq('teacher_id', getCurrentUser().id)
    .order('payment_date', { ascending: false });
  if (error) { console.error(error); return; }
  allPayments = data || [];
  applyFilters();
}

function renderFilters() {
  const studentSelect = document.getElementById('filterStudent');
  const groupSelect = document.getElementById('filterGroup');
  studentSelect.innerHTML = '<option value="">Все ученики</option>' + studentsList.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('');
  groupSelect.innerHTML = '<option value="">Все группы</option>' + groupsList.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('');
}

function applyFilters() {
  const studentId = document.getElementById('filterStudent').value;
  const groupId = document.getElementById('filterGroup').value;
  const dateFrom = document.getElementById('filterDateFrom').value;
  const dateTo = document.getElementById('filterDateTo').value;
  const status = document.getElementById('filterStatus').value;
  let filtered = allPayments.filter(p => {
    if (studentId && p.student_id !== studentId) return false;
    if (groupId && p.group_id !== groupId) return false;
    if (dateFrom && p.payment_date < dateFrom) return false;
    if (dateTo && p.payment_date > dateTo) return false;
    if (status && p.status !== status) return false;
    return true;
  });
  renderTable(filtered);
  updateSummary(filtered);
}

function renderTable(payments) {
  const tbody = document.getElementById('financeTableBody');
  if (!tbody) return;
  if (payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">Нет платежей</td></tr>';
    return;
  }
  tbody.innerHTML = payments.map(p => {
    const period = p.period_start ? `${p.period_start} – ${p.period_end}` : '—';
    return `<tr>
      <td>${p.payment_date}</td>
      <td>${p.students?.child_name || '—'}</td>
      <td>${p.student_groups?.group_name || '—'}</td>
      <td>${p.amount ? p.amount + ' ₽' : '—'}</td>
      <td>${p.lessons_paid || '—'}</td>
      <td>${period}</td>
      <td>${p.description || '—'}</td>
      <td>${p.status === 'paid' ? '✅' : '❌'}</td>
      <td>
        <button class="btn-icon edit-payment" data-id="${p.id}"><i class="fas fa-edit"></i></button>
        <button class="btn-icon delete-payment" data-id="${p.id}"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  
  tbody.querySelectorAll('.edit-payment').forEach(btn => btn.addEventListener('click', () => editPayment(btn.dataset.id)));
  tbody.querySelectorAll('.delete-payment').forEach(btn => btn.addEventListener('click', () => deletePayment(btn.dataset.id)));
}

function updateSummary(payments) {
  const totalAmount = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const totalLessons = payments.reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
  document.getElementById('totalCount').textContent = payments.length;
  document.getElementById('totalAmount').textContent = totalAmount.toFixed(2);
  document.getElementById('totalLessons').textContent = totalLessons;
}

function resetFilters() {
  document.getElementById('filterStudent').value = '';
  document.getElementById('filterGroup').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterStatus').value = '';
  applyFilters();
}

function showPaymentForm(payment = null) {
  const isEdit = !!payment;
  const modal = document.createElement('div');
  modal.className = 'modal payment-form';
  modal.innerHTML = `
    <div class="modal-card">
      <h3>${isEdit ? 'Редактировать' : 'Добавить'} платёж</h3>
      <form id="paymentForm">
        <div class="form-group"><label>Ученик *</label><select id="paymentStudent" required>${studentsList.map(s => `<option value="${s.id}" ${payment?.student_id === s.id ? 'selected' : ''}>${s.child_name}</option>`).join('')}</select></div>
        <div class="form-group"><label>Группа</label><select id="paymentGroup"><option value="">Без группы</option>${groupsList.map(g => `<option value="${g.id}" ${payment?.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}</select></div>
        <div class="form-group"><label>Дата *</label><input type="date" id="paymentDate" value="${payment?.payment_date || ''}" required></div>
        <div class="form-group"><label>Сумма (₽)</label><input type="number" step="0.01" id="paymentAmount" value="${payment?.amount || ''}"></div>
        <div class="form-group"><label>Уроков</label><input type="number" id="paymentLessons" value="${payment?.lessons_paid || ''}"></div>
        <div class="form-group"><label>Начало периода</label><input type="date" id="periodStart" value="${payment?.period_start || ''}"></div>
        <div class="form-group"><label>Конец периода</label><input type="date" id="periodEnd" value="${payment?.period_end || ''}"></div>
        <div class="form-group"><label>Заметка</label><input id="paymentDescription" value="${payment?.description || ''}"></div>
        <div class="form-group"><label>Статус</label><select id="paymentStatus"><option value="paid" ${payment?.status === 'paid' ? 'selected' : ''}>Оплачен</option><option value="cancelled" ${payment?.status === 'cancelled' ? 'selected' : ''}>Отменён</option></select></div>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
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
    const studentId = modal.querySelector('#paymentStudent').value;
    if (!studentId) { errorDiv.textContent = 'Выберите ученика'; return; }
    const paymentData = {
      teacher_id: getCurrentUser().id,
      student_id: studentId,
      group_id: modal.querySelector('#paymentGroup').value || null,
      payment_date: modal.querySelector('#paymentDate').value,
      amount: modal.querySelector('#paymentAmount').value || null,
      lessons_paid: modal.querySelector('#paymentLessons').value ? parseInt(modal.querySelector('#paymentLessons').value) : null,
      period_start: modal.querySelector('#periodStart').value || null,
      period_end: modal.querySelector('#periodEnd').value || null,
      description: modal.querySelector('#paymentDescription').value.trim() || null,
      status: modal.querySelector('#paymentStatus').value
    };
    let res;
    if (isEdit) {
      res = await supabase.from('payments').update(paymentData).eq('id', payment.id);
    } else {
      res = await supabase.from('payments').insert(paymentData);
    }
    if (res.error) { errorDiv.textContent = res.error.message; return; }
    modal.remove();
    await loadPayments();
    refreshRelatedPages(); // 👈 добавлено обновление связанных страниц
  });
}

async function editPayment(id) {
  const payment = allPayments.find(p => p.id === id);
  if (!payment) return;
  showPaymentForm(payment);
}

async function deletePayment(id) {
  showConfirmModal(
      'Удалить платёж? Все привязанные уроки станут неоплаченными.',
      async () => {
          console.log('Удаляем платёж с ID:', id);
          
          try {
              const { error } = await supabase
                  .from('payments')
                  .delete()
                  .eq('id', id);
              
              if (error) {
                  console.error('Ошибка удаления:', error);
                  alert(`Не удалось удалить: ${error.message}`);
                  return;
              }
              
              console.log('Платёж удалён из базы');
              await loadPayments();
              refreshRelatedPages();
              alert('Платёж удалён');
              
          } catch (err) {
              console.error('Критическая ошибка:', err);
              alert('Не удалось удалить платёж');
          }
      }
  );
}

// 👇 НОВАЯ ФУНКЦИЯ: обновляет кэш и таблицы на других страницах
function refreshRelatedPages() {
  // Обновляем страницу "Все уроки"
  if (typeof window.updateAllLessonsTable === 'function') {
    window.updateAllLessonsTable();
  }
  // Сбрасываем кэш учеников
  if (typeof window.resetStudentsCache === 'function') {
    window.resetStudentsCache();
  }
  // Сбрасываем кэш групп
  if (typeof window.resetGroupsCache === 'function') {
    window.resetGroupsCache();
  }
  // Если открыта страница учеников — перерисовываем её
  if (document.getElementById('studentsTableBody')) {
    import('./students.js').then(m => {
      if (m.initStudentsPage) m.initStudentsPage();
    }).catch(() => {});
  }
}

function bindEvents() {
  document.getElementById('addPaymentGlobalBtn')?.addEventListener('click', () => showPaymentForm());
  document.getElementById('applyFinanceFilters')?.addEventListener('click', applyFilters);
  document.getElementById('resetFinanceFilters')?.addEventListener('click', resetFilters);
}