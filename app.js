// ==========================================
// SIMPLEED CRM — ГЛАВНОЕ ПРИЛОЖЕНИЕ
// ==========================================

// Инициализация Supabase (глобально из config.js)
const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Текущий пользователь (заполняется в session-check.js)
let currentUser = window.currentUser;

// DOM элементы
const teacherNameSpan = document.getElementById('teacherNameDisplay');
const dashboardContainer = document.getElementById('dashboardContent');
const logoutBtn = document.getElementById('logoutBtn');
const currentDateSpan = document.getElementById('currentDate');

// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Устанавливаем сегодняшнюю дату
    const today = new Date();
    const options = { day: 'numeric', month: 'long' };
    currentDateSpan.textContent = today.toLocaleDateString('ru-RU', options);

    // Если пользователь не определён (например, session-check не успел) — ждём
    if (!currentUser) {
        console.warn('currentUser не найден, ждём...');
        // Пробуем получить сессию повторно
        const { data } = await supabase.auth.getUser();
        if (data.user) currentUser = data.user;
    }

    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    // Загружаем профиль учителя и данные
    await loadTeacherProfile();
    await loadDashboardData();
});

// ==========================================
// 2. ЗАГРУЗКА ПРОФИЛЯ УЧИТЕЛЯ
// ==========================================
async function loadTeacherProfile() {
    try {
        // Запрос к teacher_profiles по id пользователя
        const { data, error } = await supabase
            .from('teacher_profiles')
            .select('teacher_name, phone_number')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        if (data) {
            // Отображаем имя
            const displayName = data.teacher_name || 'Учитель';
            teacherNameSpan.textContent = displayName;
            
            // Ставим первую букву в аватар
            const avatar = document.getElementById('userAvatar');
            avatar.textContent = displayName.charAt(0).toUpperCase();
            
            // Сохраняем phone_number глобально (может пригодиться)
            window.teacherPhone = data.phone_number;
        } else {
            // Если профиля нет (например, админ), пробуем из platform_admins
            const { data: adminData } = await supabase
                .from('platform_admins')
                .select('full_name')
                .eq('id', currentUser.id)
                .single();
            
            if (adminData) {
                teacherNameSpan.textContent = adminData.full_name;
                document.getElementById('userAvatar').textContent = adminData.full_name.charAt(0);
                // Перенаправляем админа в админку (если она есть)
                if (window.location.pathname.includes('index.html')) {
                    // Пока оставим здесь, потом можно сделать редирект на admin.html
                    console.log('Администратор в системе');
                }
            }
        }
    } catch (err) {
        console.error('Ошибка загрузки профиля:', err);
        teacherNameSpan.textContent = 'Гость';
    }
}

// ==========================================
// 3. ЗАГРУЗКА ДАННЫХ ДЭШБОРДА (ученики, статистика)
// ==========================================
async function loadDashboardData() {
    try {
        // Получаем список учеников
        const { data: students, error } = await supabase
            .from('students')
            .select('id, child_name, parent_name, status, group_id, student_groups(group_name)')
            .eq('teacher_id', currentUser.id)
            .order('child_name');

        if (error) throw error;

        // Получаем статистику по урокам (можно позже)
        // Пока отрендерим карточки
        renderDashboard(students || []);
    } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        dashboardContainer.innerHTML = `<div class="error">Не удалось загрузить данные. Обновите страницу.</div>`;
    }
}

// ==========================================
// 4. ОТРИСОВКА ДЭШБОРДА
// ==========================================
function renderDashboard(students) {
    // Простая статистика
    const activeStudents = students.filter(s => s.status === 'active').length;
    
    // Группировка по группам для отображения
    const groups = {};
    students.forEach(s => {
        if (s.group_id) {
            const groupName = s.student_groups?.group_name || 'Без группы';
            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(s);
        }
    });

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

// ==========================================
// 5. ВЫХОД ИЗ СИСТЕМЫ
// ==========================================
logoutBtn.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
        window.location.href = 'auth.html';
    } else {
        alert('Ошибка при выходе: ' + error.message);
    }
});
