// admin_modules/admin-stats.js
// Статистика платформы

import { showLoader, hideLoader } from './admin-ui.js';

let supabase = null;
let revenueChart = null;
let weekdayChart = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initStatsModule(supabaseClient) {
    supabase = supabaseClient;
    
    const observer = new MutationObserver(() => {
        if (document.getElementById('statsTab')?.classList.contains('active')) {
            loadStatistics();
        }
    });
    observer.observe(document.getElementById('statsTab'), { 
        attributes: true, 
        attributeFilter: ['class'] 
    });
    
    document.getElementById('refreshStatsBtn')?.addEventListener('click', loadStatistics);
    document.getElementById('statsPeriodSelect')?.addEventListener('change', loadStatistics);
}

async function loadStatistics() {
    const period = document.getElementById('statsPeriodSelect')?.value || '30';
    
    showLoader();
    
    try {
        let startDate = null;
        if (period !== 'all') {
            const days = parseInt(period);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate = startDate.toISOString();
        }

        const [teachersRes, studentsRes, groupsRes, lessonsRes, paymentsRes] = await Promise.all([
            supabase.from('teacher_profiles').select('id, teacher_name, activity_status'),
            supabase.from('students').select('id, teacher_id'),
            supabase.from('student_groups').select('id'),
            supabase.from('lessons').select('id').gte('lesson_date', startDate || '1900-01-01'),
            supabase.from('payments').select('amount').gte('payment_date', startDate || '1900-01-01')
        ]);

        const teachers = teachersRes.data || [];
        const activeTeachers = teachers.filter(t => t.activity_status === 'active');
        
        document.getElementById('totalTeachers').textContent = teachers.length;
        document.getElementById('totalStudents').textContent = studentsRes.data?.length || 0;
        document.getElementById('totalGroups').textContent = groupsRes.data?.length || 0;
        document.getElementById('totalLessons').textContent = lessonsRes.data?.length || 0;

        const payments = paymentsRes.data || [];
        const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(0) + ' ₽';
        
        const avgRevenue = activeTeachers.length > 0 ? totalRevenue / activeTeachers.length : 0;
        document.getElementById('avgRevenuePerTeacher').textContent = avgRevenue.toFixed(0) + ' ₽';

        // Топ учителей (упрощённо)
        const sortedTeachers = teachers.sort((a, b) => (b.teacher_name || '').localeCompare(a.teacher_name || ''));
        if (sortedTeachers.length > 0) {
            document.getElementById('topTeacher').textContent = sortedTeachers[0].teacher_name || '—';
        }

        const tbody = document.getElementById('topTeachersBody');
        if (tbody) {
            tbody.innerHTML = sortedTeachers.slice(0, 10).map((t, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${t.teacher_name || '—'}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td><span class="badge ${t.activity_status}">${t.activity_status}</span></td>
                </tr>
            `).join('') || '<tr><td colspan="6">Нет данных</td></tr>';
        }

    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
    } finally {
        hideLoader();
    }
}