// ==========================================
// SIMPLEED CRM — ГЛАВНОЕ ПРИЛОЖЕНИЕ (EMAIL)
// ==========================================

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
let currentUser = window.currentUser;

const teacherNameSpan = document.getElementById('teacherNameDisplay');
const dashboardContainer = document.getElementById('dashboardContent');
const logoutBtn = document.getElementById('logoutBtn');
const currentDateSpan = document.getElementById('currentDate');

document.addEventListener('DOMContentLoaded', async () => {
    const today = new Date();
    currentDateSpan.textContent = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

    if (!currentUser) {
        const { data } = await supabase.auth.getUser();
        if (data.user) currentUser = data.user;
    }

    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    await loadTeacherProfile();
    await loadDashboardData();
});

async function loadTeacherProfile() {
    try {
        const { data, error } = await supabase
            .from('teacher_profiles')
            .select('teacher_name, email')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        if (data) {
            teacherNameSpan.textContent = data.teacher_name || 'Учитель';
            document.getElementById('userAvatar').textContent = (data.teacher_name || 'У').charAt(0).toUpperCase();
            window.teacherEmail = data.email;
        } else {
            const { data: adminData } = await supabase
                .from('platform_admins')
                .select('full_name')
                .eq('id', currentUser.id)
                .single();
            if (adminData) {
                teacherNameSpan.textContent = adminData.full_name;
                document.getElementById('userAvatar').textContent = adminData.full_name.charAt(0);
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
        teacherNameSpan.textContent = 'Гость';
    }
}

async function loadDashboardData() {
    try {
        const { data: students, error } = await supabase
            .from('students')
            .select('id, child_name, parent_name, status, group_id, student_groups(group_name)')
            .eq('teacher_id', currentUser.id)
            .order('child_name');

        if (error) throw error;
        renderDashboard(students || []);
    } catch (err) {
        console.error('Ошибка загрузки:', err);
        dashboardContainer.innerHTML = `<div class="error">Не удалось загрузить данные.</div>`;
    }
}

function renderDashboard(students) {
    let studentsHtml = '';
    students.slice(0, 5).forEach(s => {
        studentsHtml += `<div class="student-item">${s.child_name} (${s.parent_name || 'нет контакта'})</div>`;
    });

    const html = `
        <div class="card wide">
            <h3><i class="fas fa-calendar-day"></i> Ближайшие уроки</h3>
            <div class="lesson-list">
                <div class="lesson-item group">
                    <div class="time">--:--</div>
                    <div class="info">
                        <strong>Нет запланированных уроков</strong>
                        <span>Добавьте уроки в журнале</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="card stat-card">
            <h3>Статистика апреля</h3>
            <div class="stat-value">0 <span>уроков</span></div>
            <div class="stat-money">0 ₽</div>
        </div>

        <div class="card note-card">
            <h3>Быстрая заметка</h3>
            <textarea placeholder="Запишите идею..."></textarea>
            <button class="btn-save">Сохранить</button>
        </div>

        <div class="card students-card">
            <h3><i class="fas fa-users"></i> Ваши ученики (${students.length})</h3>
            <div class="students-list">
                ${studentsHtml}
                ${students.length > 5 ? `<div class="more">и ещё ${students.length - 5}...</div>` : ''}
            </div>
        </div>
    `;
    dashboardContainer.innerHTML = html;
}

logoutBtn.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'auth.html';
});
