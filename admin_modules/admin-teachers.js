// admin_modules/admin-teachers.js
// Управление преподавателями: загрузка, добавление, редактирование, архив.

import { showLoader, hideLoader, formatDate } from './admin-ui.js';

// Глобальные переменные модуля
let supabase = null;
let showArchived = false; // Показывать ли архивных преподавателей

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initTeachersModule(supabaseClient) {
    supabase = supabaseClient;
    
    // Привязываем события к кнопкам
    document.getElementById('addTeacherBtn')?.addEventListener('click', toggleAddForm);
    document.getElementById('cancelAddBtn')?.addEventListener('click', hideAddForm);
    document.getElementById('newTeacherForm')?.addEventListener('submit', createTeacher);
    document.getElementById('remindPaymentsBtn')?.addEventListener('click', remindAboutPayments);
    
    // Фильтры
    document.getElementById('teacherStatusFilter')?.addEventListener('change', loadTeachers);
    document.getElementById('showArchivedBtn')?.addEventListener('click', () => {
        showArchived = true;
        document.getElementById('showArchivedBtn').style.display = 'none';
        document.getElementById('showActiveBtn').style.display = 'inline-block';
        document.getElementById('teacherStatusFilter').style.display = 'none';
        loadTeachers();
    });
    document.getElementById('showActiveBtn')?.addEventListener('click', () => {
        showArchived = false;
        document.getElementById('showArchivedBtn').style.display = 'inline-block';
        document.getElementById('showActiveBtn').style.display = 'none';
        document.getElementById('teacherStatusFilter').style.display = 'inline-block';
        loadTeachers();
    });
    
    // Загружаем список при старте
    loadTeachers();
}

// ==================== ЗАГРУЗКА СПИСКА ====================
export async function loadTeachers() {
    const tbody = document.getElementById('teachersTableBody');
    if (!tbody) return;

    showLoader();
    
    try {
        // Строим запрос с учётом фильтра архива
        let query = supabase
            .from('teacher_profiles')
            .select('*, teacher_payments(paid_until)')
            .order('created_at', { ascending: false });
        
        if (showArchived) {
            query = query.eq('activity_status', 'archived');
        } else {
            query = query.neq('activity_status', 'archived');
            const statusFilter = document.getElementById('teacherStatusFilter')?.value;
            if (statusFilter && statusFilter !== 'all') {
                query = query.eq('activity_status', statusFilter);
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!data?.length) {
            tbody.innerHTML = '<tr><td colspan="7">Нет преподавателей</td></tr>';
            return;
        }

        const now = new Date();
        
        // Рендерим таблицу
        tbody.innerHTML = data.map(teacher => {
            const access = teacher.access_until ? new Date(teacher.access_until) : null;
            
            // Находим последний платёж
            const payments = teacher.teacher_payments || [];
            const lastPay = payments.sort((a, b) => 
                new Date(b.paid_until) - new Date(a.paid_until)
            )[0];
            
            const paidUntil = lastPay?.paid_until ? new Date(lastPay.paid_until) : null;
            
            // Предупреждение, если оплата заканчивается в ближайшие 3 дня
            const warning = paidUntil && 
                           (paidUntil - now) < 3 * 24 * 3600 * 1000 && 
                           paidUntil > now;
            
            const status = teacher.activity_status || 
                          (access && access > now ? 'active' : 'inactive');

            return `
                <tr>
                    <td>${teacher.teacher_name || '—'}</td>
                    <td>${teacher.email}</td>
                    <td><span class="badge plan-${teacher.subscription_plan}">${teacher.subscription_plan}</span></td>
                    <td>${formatDate(access)}</td>
                    <td><span class="badge ${status}">${status}</span></td>
                    <td>
                        ${formatDate(paidUntil)} 
                        ${warning ? '<i class="fas fa-exclamation-triangle" style="color:#d32f2f;"></i>' : ''}
                    </td>
                    <td>
                        <button class="btn-icon view-teacher" data-id="${teacher.id}" title="Открыть карточку">
                            <i class="fas fa-id-card"></i>
                        </button>
                        ${!showArchived ? `
                            <button class="btn-icon archive-teacher" data-id="${teacher.id}" title="В архив">
                                <i class="fas fa-archive"></i>
                            </button>
                        ` : `
                            <button class="btn-icon unarchive-teacher" data-id="${teacher.id}" title="Восстановить">
                                <i class="fas fa-undo"></i>
                            </button>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

        // Привязываем обработчики к кнопкам в таблице
        document.querySelectorAll('.view-teacher').forEach(btn => {
            btn.addEventListener('click', () => openTeacherCard(btn.dataset.id));
        });
        
        if (!showArchived) {
            document.querySelectorAll('.archive-teacher').forEach(btn => {
                btn.addEventListener('click', () => archiveTeacher(btn.dataset.id));
            });
        } else {
            document.querySelectorAll('.unarchive-teacher').forEach(btn => {
                btn.addEventListener('click', () => unarchiveTeacher(btn.dataset.id));
            });
        }

        // Обновляем заголовок вкладки
        const title = document.querySelector('#teachersTab h2');
        if (title) {
            title.innerHTML = `
                <i class="fas fa-${showArchived ? 'archive' : 'chalkboard-user'}"></i>
                ${showArchived ? 'Архив преподавателей' : 'Преподаватели'}
            `;
        }

    } catch (err) {
        console.error('Ошибка загрузки преподавателей:', err);
        tbody.innerHTML = '<tr><td colspan="7">Ошибка загрузки</td></tr>';
    } finally {
        hideLoader();
    }
}

// ==================== АРХИВАЦИЯ ====================
async function archiveTeacher(teacherId) {
    if (!confirm('Переместить преподавателя в архив?')) return;
    
    const { error } = await supabase
        .from('teacher_profiles')
        .update({ activity_status: 'archived' })
        .eq('id', teacherId);
        
    if (error) {
        alert('Ошибка: ' + error.message);
        return;
    }
    
    loadTeachers();
}

async function unarchiveTeacher(teacherId) {
    const newStatus = prompt('Введите новый статус (active, inactive, vip, blocked):', 'active');
    if (!['active', 'inactive', 'vip', 'blocked'].includes(newStatus)) {
        alert('Недопустимый статус');
        return;
    }
    
    const { error } = await supabase
        .from('teacher_profiles')
        .update({ activity_status: newStatus })
        .eq('id', teacherId);
        
    if (error) {
        alert('Ошибка: ' + error.message);
        return;
    }
    
    loadTeachers();
}

// ==================== ФОРМА ДОБАВЛЕНИЯ ====================
function toggleAddForm() {
    const form = document.getElementById('addTeacherForm');
    form.classList.toggle('hidden');
}

function hideAddForm() {
    document.getElementById('addTeacherForm').classList.add('hidden');
    document.getElementById('formError').textContent = '';
}

async function createTeacher(e) {
    e.preventDefault();
    
    const email = document.getElementById('newEmail').value.trim();
    const name = document.getElementById('newName').value.trim();
    const password = document.getElementById('newPassword').value;
    const plan = document.getElementById('newPlan').value;
    const accessDate = document.getElementById('newAccessUntil').value;
    const status = document.getElementById('newStatus').value;

    if (!email || !name || !password) {
        document.getElementById('formError').textContent = 'Заполните все обязательные поля';
        return;
    }

    showLoader();
    
    try {
        // Регистрируем пользователя через Supabase Auth
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email, password,
            options: { data: { teacher_name: name } }
        });
        if (signUpError) throw signUpError;

        const userId = signUpData.user?.id;
        if (!userId) throw new Error('Не удалось получить ID пользователя');

        // Создаём профиль
        const accessDateObj = accessDate ? new Date(accessDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const { error: profileError } = await supabase
            .from('teacher_profiles')
            .upsert({
                id: userId,
                email,
                teacher_name: name,
                subscription_plan: plan,
                plain_password: password,
                access_until: accessDateObj.toISOString(),
                activity_status: status
            }, { onConflict: 'id' });
        if (profileError) throw profileError;

        hideAddForm();
        document.getElementById('newTeacherForm').reset();
        loadTeachers();
        alert(`Учитель ${name} успешно создан!`);

    } catch (err) {
        console.error('Ошибка создания учителя:', err);
        document.getElementById('formError').textContent = err.message;
    } finally {
        hideLoader();
    }
}

// ==================== КАРТОЧКА ПРЕПОДАВАТЕЛЯ ====================
async function openTeacherCard(teacherId) {
    // Загружаем функцию из отдельного файла позже
    const { openTeacherCardModal } = await import('./admin-teacher-card.js');
    openTeacherCardModal(teacherId, supabase, loadTeachers);
}

// ==================== НАПОМИНАНИЕ ОБ ОПЛАТЕ ====================
async function remindAboutPayments() {
    const { data } = await supabase
        .from('teacher_profiles')
        .select('*, teacher_payments(paid_until)');

    const soon = (data || []).filter(t => {
        const payments = t.teacher_payments || [];
        const last = payments.sort((a, b) => new Date(b.paid_until) - new Date(a.paid_until))[0];
        if (!last?.paid_until) return false;
        const days = (new Date(last.paid_until) - new Date()) / (1000 * 3600 * 24);
        return days > 0 && days <= 3;
    });

    if (soon.length) {
        alert(soon.map(t => `${t.teacher_name} (${t.email}) – до ${t.teacher_payments[0].paid_until}`).join('\n'));
        if (soon.length === 1) openTeacherCard(soon[0].id);
    } else {
        alert('Нет преподавателей с окончанием оплаты в ближайшие 3 дня.');
    }
}