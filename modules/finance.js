// modules/finance.js
import supabase from './supabaseClient.js';
import { renderPage } from './ui.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';
import { isPageCached, setPageCached, resetStudentRelatedCaches } from './cache.js';

let allPayments = [];
let studentsList = [];
let groupsList = [];

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initFinancePage() {
  renderPage('finance');
  
  if (!isPageCached('finance')) {
    await loadData();
    await loadPayments();
    setPageCached('finance');
  } else {
    applyFilters();
  }
  renderFilters();
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
    .select(`
      *,
      students ( child_name, currency ),
      student_groups ( group_name )
    `)
    .eq('teacher_id', getCurrentUser().id)
    .order('created_at', { ascending: false }); // 👈 сортируем по дате добавления
    
  if (error) {
    console.error('Ошибка загрузки платежей:', error);
    return;
  }
  
  allPayments = data || [];
  applyFilters();
}

function renderFilters() {
  const studentSelect = document.getElementById('filterStudent');
  const groupSelect = document.getElementById('filterGroup');
  const currencySelect = document.getElementById('filterCurrency');
  
  if (studentSelect) {
    studentSelect.innerHTML = '<option value="">Все ученики</option>' + 
      studentsList.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('');
  }
  
  if (groupSelect) {
    groupSelect.innerHTML = '<option value="">Все группы</option>' + 
      groupsList.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('');
  }
  
  if (currencySelect) {
    currencySelect.innerHTML = `
      <option value="">Все валюты</option>
      <option value="RUB">₽ RUB</option>
      <option value="KZT">₸ KZT</option>
    `;
  }
}

function applyFilters() {
  const studentId = document.getElementById('filterStudent')?.value || '';
  const groupId = document.getElementById('filterGroup')?.value || '';
  const currency = document.getElementById('filterCurrency')?.value || '';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo = document.getElementById('filterDateTo')?.value || '';
  const status = document.getElementById('filterStatus')?.value || '';
  const minAmount = document.getElementById('filterMinAmount')?.value || '';
  const maxAmount = document.getElementById('filterMaxAmount')?.value || '';
  
  let filtered = allPayments.filter(p => {
    if (studentId && p.student_id !== studentId) return false;
    if (groupId && p.group_id !== groupId) return false;
    
    // 👇 Фильтруем по ДАТЕ ДОБАВЛЕНИЯ (created_at), а не по дате оплаты
    if (dateFrom && p.created_at < dateFrom) return false;
    if (dateTo && p.created_at > dateTo) return false;
    
    if (status && p.status !== status) return false;
    
    if (currency) {
      const paymentCurrency = p.currency || p.students?.currency || 'RUB';
      if (paymentCurrency !== currency) return false;
    }
    
    if (minAmount) {
      const amount = parseFloat(p.amount) || 0;
      if (amount < parseFloat(minAmount)) return false;
    }
    
    if (maxAmount) {
      const amount = parseFloat(p.amount) || 0;
      if (amount > parseFloat(maxAmount)) return false;
    }
    
    return true;
  });
  
  renderTable(filtered);
  updateSummary(filtered);
}

function resetFilters() {
  document.getElementById('filterStudent').value = '';
  document.getElementById('filterGroup').value = '';
  document.getElementById('filterCurrency').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterMinAmount').value = '';
  document.getElementById('filterMaxAmount').value = '';
  applyFilters();
}

// 👇 Форматирование даты и времени
function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDate(dateString) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('ru-RU');
}

function renderTable(payments) {
  const tbody = document.getElementById('financeTableBody');
  if (!tbody) return;
  
  if (!payments || payments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11">Нет платежей</td></tr>';
    return;
  }
  
  tbody.innerHTML = payments.map(p => {
    const period = p.period_start ? `${p.period_start} – ${p.period_end}` : '—';
    const currency = p.currency || p.students?.currency || 'RUB';
    const currencySymbol = currency === 'KZT' ? '₸' : '₽';
    const createdAt = formatDateTime(p.created_at);
    
    return `<tr>
      <td>${p.payment_date || '—'}</td>
      <td>${createdAt}</td>
      <td>${p.students?.child_name || '—'}</td>
      <td>${p.student_groups?.group_name || '—'}</td>
      <td>${currencySymbol}</td>
      <td>${p.amount ? p.amount + ' ' + currencySymbol : '—'}</td>
      <td>${p.lessons_paid || '—'}</td>
      <td>${period}</td>
      <td>${p.description || '—'}</td>
      <td>${p.status === 'paid' ? '✅' : '❌'}</td>
      <td>
        <button class="btn-icon edit-payment-btn" data-id="${p.id}" title="Редактировать">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn-icon delete-payment-btn" data-id="${p.id}" title="Удалить">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>`;
  }).join('');
  
  tbody.querySelectorAll('.edit-payment-btn').forEach(btn => {
    btn.addEventListener('click', () => editPayment(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-payment-btn').forEach(btn => {
    btn.addEventListener('click', () => deletePayment(btn.dataset.id));
  });
}

function updateSummary(payments) {
  const totalCount = payments.length;
  
  let totalAmountRUB = 0;
  let totalAmountKZT = 0;
  let totalLessons = 0;
  
  payments.forEach(p => {
    const currency = p.currency || p.students?.currency || 'RUB';
    const amount = parseFloat(p.amount) || 0;
    
    if (currency === 'KZT') {
      totalAmountKZT += amount;
    } else {
      totalAmountRUB += amount;
    }
    
    totalLessons += p.lessons_paid || 0;
  });
  
  document.getElementById('totalCount').textContent = totalCount;
  document.getElementById('totalAmountRUB').textContent = totalAmountRUB.toFixed(2);
  document.getElementById('totalAmountKZT').textContent = totalAmountKZT.toFixed(2);
  document.getElementById('totalLessons').textContent = totalLessons;
}

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

// ==================== ФОРМА ПЛАТЕЖА ====================
let activePaymentModal = null;

function showPaymentForm(payment = null) {
  if (activePaymentModal) {
    activePaymentModal.remove();
    activePaymentModal = null;
  }
  
  const isEdit = !!payment;
  const modal = document.createElement('div');
  modal.className = 'modal payment-form';
  activePaymentModal = modal;
  
  let currentCurrency = 'RUB';
  if (payment) {
    currentCurrency = payment.currency || 'RUB';
  }
  
  modal.innerHTML = `
    <div class="modal-card">
      <h3>${isEdit ? 'Редактировать' : 'Добавить'} платёж</h3>
      <form id="paymentForm">
        <div class="form-group">
          <label>Ученик *</label>
          <select id="paymentStudent" required>
            ${studentsList.map(s => `<option value="${s.id}" data-currency="${s.currency || 'RUB'}" ${payment?.student_id === s.id ? 'selected' : ''}>${s.child_name} (${s.currency === 'KZT' ? '₸' : '₽'})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Группа</label>
          <select id="paymentGroup">
            <option value="">Без группы</option>
            ${groupsList.map(g => `<option value="${g.id}" ${payment?.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Валюта</label>
          <div class="currency-selector" style="display: flex; gap: 0.5rem;">
            <button type="button" class="btn btn-outline currency-btn ${currentCurrency === 'RUB' ? 'active' : ''}" data-currency="RUB">
              <i class="fas fa-ruble-sign"></i> RUB
            </button>
            <button type="button" class="btn btn-outline currency-btn ${currentCurrency === 'KZT' ? 'active' : ''}" data-currency="KZT">
              <i class="fas fa-tenge"></i> KZT
            </button>
          </div>
          <input type="hidden" id="paymentCurrency" value="${currentCurrency}">
        </div>
        <div class="form-group">
          <label>Дата оплаты *</label>
          <input type="date" id="paymentDate" value="${payment?.payment_date || ''}" required>
        </div>
        <div class="form-group">
          <label>Сумма (<span id="currencySymbol">${currentCurrency === 'KZT' ? '₸' : '₽'}</span>)</label>
          <input type="number" step="0.01" id="paymentAmount" value="${payment?.amount || ''}">
        </div>
        <div class="form-group">
          <label>Уроков</label>
          <input type="number" id="paymentLessons" value="${payment?.lessons_paid || ''}">
        </div>
        <div class="form-group">
          <label>Начало периода</label>
          <input type="date" id="periodStart" value="${payment?.period_start || ''}">
        </div>
        <div class="form-group">
          <label>Конец периода</label>
          <input type="date" id="periodEnd" value="${payment?.period_end || ''}">
        </div>
        <div class="form-group">
          <label>Заметка</label>
          <input id="paymentDescription" value="${payment?.description || ''}">
        </div>
        <div class="form-group">
          <label>Статус</label>
          <select id="paymentStatus">
            <option value="paid" ${payment?.status === 'paid' ? 'selected' : ''}>Оплачен</option>
            <option value="cancelled" ${payment?.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
          </select>
        </div>
        ${isEdit ? `
        <div class="form-group">
          <label>Дата добавления</label>
          <input type="text" value="${formatDateTime(payment.created_at)}" disabled style="background: var(--neutral-light);">
        </div>
        ` : ''}
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Сохранить' : 'Добавить'}</button>
          <button type="button" class="btn btn-secondary close-modal">Отмена</button>
        </div>
        <div id="paymentFormError" class="error-message"></div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  
  const closeModal = () => {
    modal.remove();
    activePaymentModal = null;
  };
  modal.querySelector('.close-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  
  const currencyButtons = modal.querySelectorAll('.currency-btn');
  const currencyHidden = modal.querySelector('#paymentCurrency');
  const currencySpan = modal.querySelector('#currencySymbol');
  const studentSelect = modal.querySelector('#paymentStudent');
  
  function setCurrency(currency) {
    currencyButtons.forEach(b => b.classList.toggle('active', b.dataset.currency === currency));
    currencyHidden.value = currency;
    currencySpan.textContent = currency === 'KZT' ? '₸' : '₽';
  }
  
  currencyButtons.forEach(btn => {
    btn.addEventListener('click', () => setCurrency(btn.dataset.currency));
  });
  
  studentSelect.addEventListener('change', () => {
    const selectedOption = studentSelect.selectedOptions[0];
    const studentCurrency = selectedOption.dataset.currency || 'RUB';
    const currentSelectedCurrency = currencyHidden.value;
    
    if (!isEdit && currentSelectedCurrency !== studentCurrency) {
      const currencyName = studentCurrency === 'KZT' ? 'тенге' : 'рубль';
      const selectedCurrencyName = currentSelectedCurrency === 'KZT' ? 'тенге' : 'рубль';
      
      showConfirmModal(
        `У этого ученика основная валюта — ${currencyName}. Вы уверены, что хотите добавить платёж в ${selectedCurrencyName}?`,
        () => {},
        () => { setCurrency(studentCurrency); }
      );
    }
  });
  
  modal.querySelector('#paymentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorDiv = modal.querySelector('#paymentFormError');
    const studentId = studentSelect.value;
    
    if (!studentId) {
      errorDiv.textContent = 'Выберите ученика';
      return;
    }
    
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
      status: modal.querySelector('#paymentStatus').value,
      currency: currencyHidden.value
    };
    
    let res;
    if (isEdit) {
      res = await supabase.from('payments').update(paymentData).eq('id', payment.id);
    } else {
      res = await supabase.from('payments').insert(paymentData);
    }
    
    if (res.error) {
      errorDiv.textContent = res.error.message;
      return;
    }
    
    closeModal();
    await loadPayments();
    refreshRelatedPages();
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
      try {
        const { data: linkedLessons } = await supabase
          .from('lessons')
          .select('id')
          .eq('payment_id', id);
          
        if (linkedLessons && linkedLessons.length > 0) {
          await supabase
            .from('lessons')
            .update({ payment_id: null, is_free: false })
            .in('id', linkedLessons.map(l => l.id));
        }
        
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) throw error;
        
        await loadPayments();
        refreshRelatedPages();
        
      } catch (error) {
        console.error('Ошибка удаления:', error);
        alert(`Не удалось удалить: ${error.message}`);
      }
    }
  );
}

function refreshRelatedPages() {
  if (typeof window.updateAllLessonsTable === 'function') {
    window.updateAllLessonsTable();
  }
  resetStudentRelatedCaches();
  
  import('./dashboard.js').then(m => {
    if (m.resetDashboardCache) m.resetDashboardCache();
  }).catch(() => {});
}

function bindEvents() {
  document.getElementById('addPaymentGlobalBtn')?.addEventListener('click', () => showPaymentForm());
  document.getElementById('applyFinanceFilters')?.addEventListener('click', applyFilters);
  document.getElementById('resetFinanceFilters')?.addEventListener('click', resetFilters);
  
  const tbody = document.getElementById('financeTableBody');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-payment-btn');
      const editBtn = e.target.closest('.edit-payment-btn');
      if (deleteBtn) deletePayment(deleteBtn.dataset.id);
      if (editBtn) editPayment(editBtn.dataset.id);
    });
  }
}