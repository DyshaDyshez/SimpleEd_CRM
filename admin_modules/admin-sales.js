// admin_modules/admin-sales.js
// Статистика продаж CRM

import { showLoader, hideLoader, formatDate } from './admin-ui.js';

let supabase = null;
let salesChart = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initSalesModule(supabaseClient) {
    supabase = supabaseClient;
    
    const observer = new MutationObserver(() => {
        if (document.getElementById('paymentsTab')?.classList.contains('active')) {
            loadSalesStatistics();
        }
    });
    observer.observe(document.getElementById('paymentsTab'), { 
        attributes: true, 
        attributeFilter: ['class'] 
    });
    
    document.getElementById('refreshSalesBtn')?.addEventListener('click', loadSalesStatistics);
    document.getElementById('salesPeriodSelect')?.addEventListener('change', loadSalesStatistics);
    document.getElementById('exportSalesBtn')?.addEventListener('click', exportSales);
}

async function loadSalesStatistics() {
    const period = document.getElementById('salesPeriodSelect')?.value || '30';
    
    showLoader();
    
    try {
        let startDate = null;
        if (period !== 'all') {
            const days = parseInt(period);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate = startDate.toISOString().split('T')[0];
        }

        let query = supabase
            .from('teacher_payments')
            .select(`*, teacher_profiles(teacher_name, email, subscription_plan)`)
            .order('payment_date', { ascending: false });
        
        if (startDate) query = query.gte('payment_date', startDate);
        
        const { data: payments } = await query;
        const salesData = payments || [];

        const totalRevenue = salesData.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        document.getElementById('totalSalesRevenue').textContent = totalRevenue.toFixed(0) + ' ₽';
        document.getElementById('totalSalesCount').textContent = salesData.length;

        const { data: allTeachers } = await supabase
            .from('teacher_profiles')
            .select('activity_status');
            
        const activeCount = allTeachers?.filter(t => t.activity_status === 'active').length || 0;
        document.getElementById('activeSubscriptions').textContent = activeCount;
        
        const avgCheck = salesData.length > 0 ? totalRevenue / salesData.length : 0;
        document.getElementById('avgCheck').textContent = avgCheck.toFixed(0) + ' ₽';

        // Таблица
        const tbody = document.getElementById('salesTableBody');
        if (tbody) {
            if (salesData.length > 0) {
                tbody.innerHTML = salesData.map(p => `
                    <tr>
                        <td>${formatDate(p.payment_date)}</td>
                        <td>${p.teacher_profiles?.teacher_name || '—'}</td>
                        <td><span class="badge plan-${p.teacher_profiles?.subscription_plan}">${p.teacher_profiles?.subscription_plan || '—'}</span></td>
                        <td>${p.amount || 0} ₽</td>
                        <td>${formatDate(p.paid_until)}</td>
                        <td>${p.notes || '—'}</td>
                    </tr>
                `).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6">Нет данных</td></tr>';
            }
        }

    } catch (err) {
        console.error('Ошибка загрузки продаж:', err);
    } finally {
        hideLoader();
    }
}

function exportSales() {
    const rows = [];
    rows.push(['Дата', 'Преподаватель', 'Тариф', 'Сумма', 'Оплачено до', 'Заметка'].join(','));
    
    document.querySelectorAll('#salesTableBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            rows.push(Array.from(cells).slice(0, 6).map(c => `"${c.textContent.trim()}"`).join(','));
        }
    });
    
    const csv = rows.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}