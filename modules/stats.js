// modules/stats.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { renderPage } from './ui.js';

let revenueChart = null;
let lessonsChart = null;
let studentsChart = null;
let groupsChart = null;
let statsLoaded = false;
let cachedStatsData = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initStatsPage() {
    renderPage('stats');
    
    if (!statsLoaded) {
        await loadStatsData();
        statsLoaded = true;
    }
    renderAllStats();
    bindEvents();
}

async function loadStatsData() {
    const user = getCurrentUser();
    if (!user) return;

    showLoader();
    try {
        const [
            paymentsRes,
            lessonsRes,
            studentsRes,
            groupsRes
        ] = await Promise.all([
            supabase.from('payments').select('*').eq('teacher_id', user.id),
            supabase.from('lessons').select('*').eq('teacher_id', user.id),
            supabase.from('students').select('*').eq('teacher_id', user.id),
            supabase.from('student_groups').select('*').eq('teacher_id', user.id)
        ]);

        cachedStatsData = {
            payments: paymentsRes.data || [],
            lessons: lessonsRes.data || [],
            students: studentsRes.data || [],
            groups: groupsRes.data || []
        };
    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
    } finally {
        hideLoader();
    }
}

function renderAllStats() {
    if (!cachedStatsData) return;
    
    const period = document.getElementById('teacherStatsPeriod')?.value || '30';
    const filteredData = filterDataByPeriod(cachedStatsData, period);
    
    renderSummary(filteredData);
    renderRevenueChart(filteredData);
    renderLessonsChart(filteredData);
    renderStudentsChart(filteredData);
    renderGroupsChart(filteredData);
    renderTopStudents(filteredData);
}

function filterDataByPeriod(data, period) {
    if (period === 'all') return data;
    
    const days = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0];
    
    return {
        payments: data.payments.filter(p => p.payment_date >= startStr),
        lessons: data.lessons.filter(l => l.lesson_date >= startStr),
        students: data.students,
        groups: data.groups
    };
}

function renderSummary(data) {
    const totalRevenue = data.payments
        .filter(p => p.status === 'paid')
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    
    const completedLessons = data.lessons.filter(l => l.status === 'completed').length;
    const activeStudents = data.students.filter(s => s.status === 'active').length;
    const avgPerLesson = completedLessons > 0 ? totalRevenue / completedLessons : 0;
    
    document.getElementById('teacherTotalRevenue').textContent = totalRevenue.toFixed(0) + ' ₽';
    document.getElementById('teacherTotalLessons').textContent = completedLessons;
    document.getElementById('teacherActiveStudents').textContent = activeStudents;
    document.getElementById('teacherAvgPerLesson').textContent = avgPerLesson.toFixed(0) + ' ₽';

    // Выручка за текущий месяц
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const monthRevenue = data.payments
        .filter(p => p.status === 'paid' && p.payment_date >= monthStart)
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    document.getElementById('teacherRevenueThisMonth').textContent = monthRevenue.toFixed(0) + ' ₽';

    // Самый активный ученик
    const studentLessons = new Map();
    data.lessons.forEach(l => {
        if (l.student_id) {
            studentLessons.set(l.student_id, (studentLessons.get(l.student_id) || 0) + 1);
        }
    });
    let bestStudentId = null, maxLessons = 0;
    studentLessons.forEach((count, id) => {
        if (count > maxLessons) { maxLessons = count; bestStudentId = id; }
    });
    const bestStudent = data.students.find(s => s.id === bestStudentId);
    document.getElementById('teacherBestStudent').textContent = bestStudent?.child_name || '—';

    // Самая прибыльная группа
    const groupRevenue = new Map();
    data.payments.filter(p => p.status === 'paid').forEach(p => {
        if (p.group_id) {
            groupRevenue.set(p.group_id, (groupRevenue.get(p.group_id) || 0) + (parseFloat(p.amount) || 0));
        }
    });
    let bestGroupId = null, maxRevenue = 0;
    groupRevenue.forEach((rev, id) => {
        if (rev > maxRevenue) { maxRevenue = rev; bestGroupId = id; }
    });
    const bestGroup = data.groups.find(g => g.id === bestGroupId);
    document.getElementById('teacherBestGroup').textContent = bestGroup?.group_name || '—';
}

function renderRevenueChart(data) {
    const dailyRevenue = new Map();
    data.payments.filter(p => p.status === 'paid').forEach(p => {
        const date = p.payment_date;
        dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + (parseFloat(p.amount) || 0));
    });

    const sortedDates = Array.from(dailyRevenue.keys()).sort();
    const labels = sortedDates.map(d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    const chartData = sortedDates.map(d => dailyRevenue.get(d));

    if (revenueChart) revenueChart.destroy();
    const ctx = document.getElementById('teacherRevenueChart')?.getContext('2d');
    if (ctx) {
        revenueChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Выручка (₽)',
                    data: chartData,
                    backgroundColor: '#D4A373',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderLessonsChart(data) {
    const dailyLessons = new Map();
    data.lessons.filter(l => l.status === 'completed').forEach(l => {
        const date = l.lesson_date.split('T')[0];
        dailyLessons.set(date, (dailyLessons.get(date) || 0) + 1);
    });

    const sortedDates = Array.from(dailyLessons.keys()).sort();
    const labels = sortedDates.map(d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
    const chartData = sortedDates.map(d => dailyLessons.get(d));

    if (lessonsChart) lessonsChart.destroy();
    const ctx = document.getElementById('teacherLessonsChart')?.getContext('2d');
    if (ctx) {
        lessonsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Уроков',
                    data: chartData,
                    borderColor: '#5C4F42',
                    backgroundColor: 'rgba(92, 79, 66, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }
}

function renderStudentsChart(data) {
    const studentRevenue = new Map();
    const studentNames = new Map();
    
    data.students.forEach(s => studentNames.set(s.id, s.child_name));
    
    data.payments.filter(p => p.status === 'paid' && p.student_id).forEach(p => {
        studentRevenue.set(p.student_id, (studentRevenue.get(p.student_id) || 0) + (parseFloat(p.amount) || 0));
    });

    const sorted = Array.from(studentRevenue.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(([id]) => studentNames.get(id) || '—');
    const chartData = sorted.map(([, rev]) => rev);

    if (studentsChart) studentsChart.destroy();
    const ctx = document.getElementById('teacherStudentsChart')?.getContext('2d');
    if (ctx) {
        studentsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: chartData,
                    backgroundColor: ['#D4A373', '#5C4F42', '#E9C46A', '#8B7E6C', '#CC9C5B']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

function renderGroupsChart(data) {
    const groupRevenue = new Map();
    const groupNames = new Map();
    
    data.groups.forEach(g => groupNames.set(g.id, g.group_name));
    
    data.payments.filter(p => p.status === 'paid' && p.group_id).forEach(p => {
        groupRevenue.set(p.group_id, (groupRevenue.get(p.group_id) || 0) + (parseFloat(p.amount) || 0));
    });

    const sorted = Array.from(groupRevenue.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(([id]) => groupNames.get(id) || '—');
    const chartData = sorted.map(([, rev]) => rev);

    if (groupsChart) groupsChart.destroy();
    const ctx = document.getElementById('teacherGroupsChart')?.getContext('2d');
    if (ctx) {
        groupsChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: chartData,
                    backgroundColor: ['#5C4F42', '#D4A373', '#8B7E6C', '#E9C46A', '#CC9C5B']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }
}

function renderTopStudents(data) {
    const studentStats = new Map();
    
    data.students.forEach(s => {
        studentStats.set(s.id, {
            name: s.child_name,
            lessons: 0,
            paid: 0
        });
    });

    data.lessons.filter(l => l.status === 'completed').forEach(l => {
        if (l.student_id && studentStats.has(l.student_id)) {
            studentStats.get(l.student_id).lessons++;
        }
    });

    data.payments.filter(p => p.status === 'paid').forEach(p => {
        if (p.student_id && studentStats.has(p.student_id)) {
            studentStats.get(p.student_id).paid += parseFloat(p.amount) || 0;
        }
    });

    const sorted = Array.from(studentStats.values())
        .sort((a, b) => b.lessons - a.lessons)
        .slice(0, 10);

    const tbody = document.getElementById('teacherTopStudentsBody');
    if (tbody) {
        tbody.innerHTML = sorted.map((s, i) => {
            const balance = s.paid - (s.lessons * 500); // Примерная стоимость урока
            return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${s.name}</td>
                    <td>${s.lessons}</td>
                    <td>${s.paid.toFixed(0)} ₽</td>
                    <td style="color: ${balance >= 0 ? '#2C4C3B' : '#d32f2f'};">${balance >= 0 ? '+' : ''}${balance.toFixed(0)} ₽</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="5">Нет данных</td></tr>';
    }
}

function bindEvents() {
    document.getElementById('refreshTeacherStatsBtn')?.addEventListener('click', async () => {
        statsLoaded = false;
        await initStatsPage();
    });
    
    document.getElementById('teacherStatsPeriod')?.addEventListener('change', () => {
        renderAllStats();
    });
    
    document.getElementById('exportTeacherStatsBtn')?.addEventListener('click', exportStatsToCSV);
}

function exportStatsToCSV() {
    if (!cachedStatsData) return;
    
    const period = document.getElementById('teacherStatsPeriod')?.value || '30';
    const filtered = filterDataByPeriod(cachedStatsData, period);
    
    let csv = '=== СТАТИСТИКА ===\n';
    csv += `Период: ${period === 'all' ? 'Всё время' : period + ' дней'}\n\n`;
    
    // Сводка
    const totalRevenue = filtered.payments.filter(p => p.status === 'paid').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const completedLessons = filtered.lessons.filter(l => l.status === 'completed').length;
    
    csv += 'Общая выручка,' + totalRevenue.toFixed(0) + ' ₽\n';
    csv += 'Проведено уроков,' + completedLessons + '\n\n';
    
    // Ученики
    csv += '=== ТОП УЧЕНИКОВ ===\n';
    csv += 'Ученик,Уроков,Оплачено\n';
    
    const studentLessons = new Map();
    const studentPayments = new Map();
    const studentNames = new Map();
    
    filtered.students.forEach(s => studentNames.set(s.id, s.child_name));
    filtered.lessons.filter(l => l.status === 'completed').forEach(l => {
        if (l.student_id) studentLessons.set(l.student_id, (studentLessons.get(l.student_id) || 0) + 1);
    });
    filtered.payments.filter(p => p.status === 'paid').forEach(p => {
        if (p.student_id) studentPayments.set(p.student_id, (studentPayments.get(p.student_id) || 0) + (parseFloat(p.amount) || 0));
    });
    
    const allStudentIds = new Set([...studentLessons.keys(), ...studentPayments.keys()]);
    allStudentIds.forEach(id => {
        csv += `"${studentNames.get(id) || '—'}",${studentLessons.get(id) || 0},${(studentPayments.get(id) || 0).toFixed(0)} ₽\n`;
    });
    
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statistics_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function showLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.remove('hidden');
}

function hideLoader() {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.add('hidden');
}

export function resetStatsCache() {
    statsLoaded = false;
    cachedStatsData = null;
}