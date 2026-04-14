// admin_modules/admin-teacher-card.js
// Модальное окно карточки преподавателя

import { showLoader, hideLoader, formatDate } from './admin-ui.js';

export async function openTeacherCardModal(teacherId, supabase, onUpdate) {
    const modal = document.getElementById('teacherModal');
    const modalTitle = document.getElementById('modalTeacherName');
    const modalContent = document.getElementById('modalContent');
    
    modal.classList.remove('hidden');
    modalTitle.textContent = 'Загрузка...';
    modalContent.innerHTML = '<p style="text-align:center;padding:2rem;">Загрузка данных...</p>';

    try {
        // Загружаем профиль преподавателя
        const { data: profile, error: profErr } = await supabase
            .from('teacher_profiles')
            .select('*')
            .eq('id', teacherId)
            .single();
        if (profErr) throw profErr;

        // Загружаем статистику
        const [lessRes, studRes, payRes, noteRes] = await Promise.allSettled([
            supabase.from('lessons').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
            supabase.from('students').select('*', { count: 'exact', head: true }).eq('teacher_id', teacherId),
            supabase.from('teacher_payments').select('*').eq('teacher_id', teacherId).order('payment_date', { ascending: false }),
            supabase.from('teacher_notes').select('*').eq('teacher_id', teacherId).order('created_at', { ascending: false })
        ]);

        const lessons = lessRes.status === 'fulfilled' ? lessRes.value.count : '?';
        const students = studRes.status === 'fulfilled' ? studRes.value.count : '?';
        const payments = payRes.status === 'fulfilled' ? payRes.value.data : [];
        const notes = noteRes.status === 'fulfilled' ? noteRes.value.data : [];

        // День рождения
        const birthdayFormatted = profile.birthday 
            ? new Date(profile.birthday).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
            : 'не указана';

        modalTitle.textContent = profile.teacher_name || 'Преподаватель';

        modalContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item"><div class="stat-value">${lessons}</div><div class="stat-label">уроков</div></div>
                <div class="stat-item"><div class="stat-value">${students}</div><div class="stat-label">учеников</div></div>
                <div class="stat-item"><div class="stat-value">${payments.length}</div><div class="stat-label">платежей</div></div>
            </div>
            
            <div style="background: var(--neutral-light); padding: 1rem; border-radius: var(--border-radius-sm); margin-bottom: 1.5rem;">
                <i class="fas fa-birthday-cake" style="color: var(--primary-warm); margin-right: 0.5rem;"></i>
                <strong>День рождения:</strong> ${birthdayFormatted}
            </div>

            <h3>Редактирование</h3>
            <form id="editForm">
                <div class="form-grid">
                    <div class="form-group"><label>Имя</label><input id="editName" value="${profile.teacher_name || ''}"></div>
                    <div class="form-group"><label>Email</label><input id="editEmail" value="${profile.email}"></div>
                    <div class="form-group"><label>Пароль</label><input id="editPassword" placeholder="Новый пароль"></div>
                    <div class="form-group"><label>Дата рождения</label><input type="date" id="editBirthday" value="${profile.birthday || ''}"></div>
                    <div class="form-group"><label>Тариф</label><select id="editPlan">
                        <option ${profile.subscription_plan === 'trial' ? 'selected' : ''}>trial</option>
                        <option ${profile.subscription_plan === 'pro' ? 'selected' : ''}>pro</option>
                        <option ${profile.subscription_plan === 'vip' ? 'selected' : ''}>vip</option>
                    </select></div>
                    <div class="form-group"><label>Доступ до</label><input type="date" id="editAccess" value="${profile.access_until?.slice(0,10) || ''}"></div>
                    <div class="form-group"><label>Статус</label><select id="editStatus">
                        <option ${profile.activity_status === 'active' ? 'selected' : ''}>active</option>
                        <option ${profile.activity_status === 'inactive' ? 'selected' : ''}>inactive</option>
                        <option ${profile.activity_status === 'vip' ? 'selected' : ''}>vip</option>
                        <option ${profile.activity_status === 'blocked' ? 'selected' : ''}>blocked</option>
                        <option ${profile.activity_status === 'archived' ? 'selected' : ''}>archived</option>
                    </select></div>
                </div>
                <button type="submit" class="btn btn-success mt-2">Сохранить</button>
            </form>
            
            <h3>Оплаты</h3>
            <button class="btn btn-primary" id="showAddPayment"><i class="fas fa-plus"></i> Добавить оплату</button>
            <div id="addPaymentBlock" style="display:none; margin-top:1rem; padding:1rem; background:#FEFAE0; border-radius:12px;">
                <div style="display:flex; gap:1rem; flex-wrap:wrap;">
                    <input type="number" id="payAmount" placeholder="Сумма" style="width:120px;">
                    <input type="date" id="payUntil">
                    <input type="text" id="payNote" placeholder="Заметка" style="flex:1;">
                    <button class="btn btn-success" id="savePayment">Сохранить</button>
                </div>
            </div>
            <div style="margin-top:1rem;">
                ${payments.map(p => `<div><strong>${p.payment_date}</strong> — ${p.amount}₽ до ${p.paid_until} (${p.notes || ''})</div>`).join('') || 'Нет оплат'}
            </div>
            
            <h3>Заметки</h3>
            <textarea id="newNote" placeholder="Добавить заметку..." rows="2" style="width:100%; margin-bottom:0.5rem;"></textarea>
            <button class="btn btn-primary" id="saveNote">Добавить</button>
            <div style="margin-top:1rem;">
                ${notes.map(n => `<div><em>${n.created_at.slice(0,10)}</em> ${n.note}</div>`).join('') || 'Нет заметок'}
            </div>
        `;

        // Обработчики
        document.getElementById('editForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const updates = {
                teacher_name: document.getElementById('editName').value,
                email: document.getElementById('editEmail').value,
                birthday: document.getElementById('editBirthday').value || null,
                subscription_plan: document.getElementById('editPlan').value,
                access_until: document.getElementById('editAccess').value,
                activity_status: document.getElementById('editStatus').value
            };
            await supabase.from('teacher_profiles').update(updates).eq('id', teacherId);
            
            const newPass = document.getElementById('editPassword').value;
            if (newPass) {
                await supabase.auth.admin.updateUserById(teacherId, { password: newPass });
            }
            
            modal.classList.add('hidden');
            if (onUpdate) onUpdate();
        });

        document.getElementById('showAddPayment').addEventListener('click', () => {
            document.getElementById('addPaymentBlock').style.display = 'block';
        });
        
        document.getElementById('savePayment').addEventListener('click', async () => {
            const amount = document.getElementById('payAmount').value;
            const until = document.getElementById('payUntil').value;
            const note = document.getElementById('payNote').value;
            if (!amount || !until) { alert('Введите сумму и дату'); return; }
            await supabase.from('teacher_payments').insert({ teacher_id: teacherId, amount, paid_until: until, notes: note });
            openTeacherCardModal(teacherId, supabase, onUpdate);
        });
        
        document.getElementById('saveNote').addEventListener('click', async () => {
            const note = document.getElementById('newNote').value;
            if (!note) return;
            await supabase.from('teacher_notes').insert({ teacher_id: teacherId, note });
            openTeacherCardModal(teacherId, supabase, onUpdate);
        });

    } catch (err) {
        console.error(err);
        modalContent.innerHTML = `<p class="error-message">Ошибка: ${err.message}</p>`;
    }
}

// Закрытие модалки
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('teacherModal');
    const closeBtn = document.getElementById('closeModalBtn');
    
    closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
});