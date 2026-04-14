// admin_modules/admin-teacher-card.js
// Модальное окно карточки преподавателя (полная версия)

import { formatDate } from './admin-ui.js';

// ==================== ФУНКЦИЯ ОТПРАВКИ УВЕДОМЛЕНИЯ ====================
function showNotificationModal(teacherId, teacherName, supabase) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 450px;">
            <div class="modal-header">
                <h3><i class="fas fa-bell"></i> Уведомление для ${teacherName}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <form id="notificationForm">
                <div class="form-group">
                    <label>Тип уведомления</label>
                    <select id="notifyType">
                        <option value="payment">💳 Напоминание об оплате</option>
                        <option value="info">ℹ️ Информационное</option>
                        <option value="warning">⚠️ Предупреждение</option>
                        <option value="custom">📝 Произвольное</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Заголовок</label>
                    <input type="text" id="notifyTitle" value="Напоминание об оплате" required>
                </div>
                <div class="form-group">
                    <label>Сообщение</label>
                    <textarea id="notifyContent" rows="4" required>Пожалуйста, проверьте статус оплаты. Спасибо!</textarea>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">Отправить</button>
                    <button type="button" class="btn btn-secondary close-modal">Отмена</button>
                </div>
                <div id="notifyError" class="error-message"></div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModal));
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Шаблоны сообщений
    const typeSelect = modal.querySelector('#notifyType');
    const titleInput = modal.querySelector('#notifyTitle');
    const contentTextarea = modal.querySelector('#notifyContent');

    const templates = {
        payment: {
            title: '💳 Напоминание об оплате',
            content: `Уважаемый(ая) ${teacherName}, напоминаем о необходимости оплаты. Пожалуйста, проверьте статус вашего счёта в личном кабинете. Спасибо!`
        },
        info: {
            title: 'ℹ️ Информация',
            content: `${teacherName}, у нас для вас важная информация. Зайдите в личный кабинет для подробностей.`
        },
        warning: {
            title: '⚠️ Внимание',
            content: `${teacherName}, обратите внимание на важные изменения в системе. Рекомендуем ознакомиться.`
        },
        custom: {
            title: '',
            content: ''
        }
    };

    typeSelect.addEventListener('change', () => {
        const type = typeSelect.value;
        if (type !== 'custom') {
            titleInput.value = templates[type].title;
            contentTextarea.value = templates[type].content;
        } else {
            titleInput.value = '';
            contentTextarea.value = '';
        }
    });

    modal.querySelector('#notificationForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = modal.querySelector('#notifyError');
        const title = titleInput.value.trim();
        const content = contentTextarea.value.trim();

        if (!title || !content) {
            errorDiv.textContent = 'Заполните заголовок и сообщение';
            return;
        }

        const { error } = await supabase
            .from('notifications')
            .insert({
                teacher_id: teacherId,
                type: typeSelect.value,
                title,
                content,
                is_read: false,
                created_at: new Date().toISOString()
            });

        if (error) {
            errorDiv.textContent = 'Ошибка отправки: ' + error.message;
            return;
        }

        alert('Уведомление отправлено!');
        closeModal();
    });
}



// ==================== ОСНОВНАЯ ФУНКЦИЯ КАРТОЧКИ ====================
export async function openTeacherCardModal(teacherId, supabase, onUpdate) {
    const modal = document.getElementById('teacherModal');
    const modalTitle = document.getElementById('modalTeacherName');
    const modalContent = document.getElementById('modalContent');
    const closeBtn = document.getElementById('closeModalBtn');
    
    // Функция закрытия
    const closeModal = () => {
        modal.classList.add('hidden');
        document.removeEventListener('keydown', handleEscape);
    };
    
    // Обработчик Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    
    modal.classList.remove('hidden');
    modalTitle.textContent = 'Загрузка...';
    modalContent.innerHTML = '<p style="text-align:center;padding:2rem;">Загрузка данных...</p>';

    document.addEventListener('keydown', handleEscape);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    closeBtn.addEventListener('click', closeModal);

    try {
        // Загружаем профиль
        const { data: profile, error } = await supabase
            .from('teacher_profiles')
            .select('*')
            .eq('id', teacherId)
            .single();
            
        if (error) throw error;

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
        const { data: tariffs } = await supabase.from('tariffs').select('*').order('price');

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
            
            <div style="background: var(--neutral-light); padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem;">
                <i class="fas fa-birthday-cake" style="color: var(--primary-warm); margin-right: 0.5rem;"></i>
                <strong>День рождения:</strong> ${birthdayFormatted}
            </div>

            <h3>Редактирование</h3>
            <form id="editTeacherForm">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Имя</label>
                        <input type="text" id="editName" value="${profile.teacher_name || ''}">
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" id="editEmail" value="${profile.email || ''}">
                    </div>
                    <div class="form-group">
                        <label>Новый пароль (если нужно)</label>
                        <input type="text" id="editPassword" placeholder="Оставьте пустым">
                    </div>
                    <div class="form-group">
                        <label>Дата рождения</label>
                        <input type="date" id="editBirthday" value="${profile.birthday || ''}">
                    </div>
                    <div class="form-group">
                        <label>Тариф</label>
                    <select id="editPlan">
                     ${tariffs.map(t => {
                        // Приводим к нижнему регистру для сравнения
                        const isSelected = profile.subscription_plan?.toLowerCase() === t.name?.toLowerCase();
                        return `<option value="${t.name}" ${isSelected ? 'selected' : ''}>
                            ${t.name} (${t.price}₽ / ${t.duration_days} дн.)
                        </option>`;
                    }).join('')}
                    </select>
                
                    </div>
                    <div class="form-group">
                        <label>Доступ до</label>
                        <input type="date" id="editAccess" value="${profile.access_until?.slice(0,10) || ''}">
                    </div>
                    <div class="form-group">
                        <label>Статус</label>
                        <select id="editStatus">
                            <option value="active" ${profile.activity_status === 'active' ? 'selected' : ''}>Активен</option>
                            <option value="inactive" ${profile.activity_status === 'inactive' ? 'selected' : ''}>Неактивен</option>
                            <option value="vip" ${profile.activity_status === 'vip' ? 'selected' : ''}>VIP</option>
                            <option value="blocked" ${profile.activity_status === 'blocked' ? 'selected' : ''}>Заблокирован</option>
                            <option value="archived" ${profile.activity_status === 'archived' ? 'selected' : ''}>В архиве</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
                    <button type="submit" class="btn btn-success">
                        <i class="fas fa-save"></i> Сохранить
                    </button>
                    <button type="button" class="btn btn-info" id="notifyTeacherBtn">
                        <i class="fas fa-bell"></i> Уведомление
                    </button>
                    <button type="button" class="btn btn-warning" id="archiveTeacherBtn">
                        <i class="fas fa-archive"></i> В архив
                    </button>
                </div>
            </form>
            
            <h3 style="margin-top: 2rem;">Оплаты</h3>
            <button class="btn btn-primary btn-sm" id="showAddPaymentBtn">
                <i class="fas fa-plus"></i> Добавить оплату
            </button>
            <div id="addPaymentBlock" style="display:none; margin-top:1rem; padding:1rem; background:#FEFAE0; border-radius:8px;">
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <input type="number" id="payAmount" placeholder="Сумма" style="width:120px;">
                    <input type="date" id="payUntil" placeholder="Оплачено до">
                    <input type="text" id="payNote" placeholder="Заметка" style="flex:1;">
                    <button class="btn btn-success btn-sm" id="savePaymentBtn">Сохранить</button>
                </div>
                <div id="paymentError" class="error-message" style="margin-top:0.5rem;"></div>
            </div>
            <div style="margin-top:1rem; max-height: 200px; overflow-y: auto;">
                ${payments.length ? payments.map(p => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; border-bottom: 1px solid var(--neutral-gray);">
                        <div style="flex: 1;">
                            <strong>${formatDate(p.payment_date)}</strong> — ${p.amount}₽ 
                            ${p.paid_until ? `до ${formatDate(p.paid_until)}` : ''}
                            ${p.notes ? `<br><small>${p.notes}</small>` : ''}
                        </div>
                        <div style="display: flex; gap: 0.25rem;">
                            <button class="btn-icon edit-payment-btn" data-id="${p.id}" data-amount="${p.amount}" data-until="${p.paid_until || ''}" data-note="${p.notes || ''}" title="Редактировать">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon delete-payment-btn" data-id="${p.id}" title="Удалить">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `).join('') : '<p style="color: var(--text-muted);">Нет оплат</p>'}
            </div>
            
            <h3 style="margin-top: 2rem;">Заметки</h3>
            <div style="display:flex; gap:0.5rem;">
                <textarea id="newNote" placeholder="Добавить заметку..." rows="2" style="flex:1;"></textarea>
                <button class="btn btn-primary btn-sm" id="saveNoteBtn" style="align-self: flex-end;">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
            <div style="margin-top:1rem; max-height: 150px; overflow-y: auto;">
                ${notes.length ? notes.map(n => `
                    <div style="padding:0.25rem 0;"><em>${formatDate(n.created_at)}</em> ${n.note}</div>
                `).join('') : '<p style="color: var(--text-muted);">Нет заметок</p>'}
            </div>
        `;

        // === ОБРАБОТЧИКИ ===
        
        // Сохранение формы преподавателя
        document.getElementById('editTeacherForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const updates = {
                teacher_name: document.getElementById('editName').value.trim() || null,
                email: document.getElementById('editEmail').value.trim() || null,
                birthday: document.getElementById('editBirthday').value || null,
                subscription_plan: document.getElementById('editPlan').value,
                access_until: document.getElementById('editAccess').value || null,
                activity_status: document.getElementById('editStatus').value
            };
            
            const { error } = await supabase
                .from('teacher_profiles')
                .update(updates)
                .eq('id', teacherId);
                
            if (error) {
                alert('Ошибка сохранения: ' + error.message);
                return;
            }
            
            const newPass = document.getElementById('editPassword').value.trim();
            if (newPass) {
                await supabase.auth.admin.updateUserById(teacherId, { password: newPass });
            }
            
            alert('Сохранено!');
            closeModal();
            if (onUpdate) onUpdate();
        });
        
        // Отправка уведомления
        document.getElementById('notifyTeacherBtn').addEventListener('click', () => {
            showNotificationModal(teacherId, profile.teacher_name, supabase);
        });
        
        // Архивация
        document.getElementById('archiveTeacherBtn').addEventListener('click', async () => {
            if (!confirm('Переместить преподавателя в архив?')) return;
            
            await supabase
                .from('teacher_profiles')
                .update({ activity_status: 'archived' })
                .eq('id', teacherId);
                
            closeModal();
            if (onUpdate) onUpdate();
        });
        
        // Показать/скрыть форму добавления оплаты
        document.getElementById('showAddPaymentBtn').addEventListener('click', () => {
            const block = document.getElementById('addPaymentBlock');
            block.style.display = block.style.display === 'none' ? 'block' : 'none';
            document.getElementById('savePaymentBtn').textContent = 'Сохранить';
            document.getElementById('savePaymentBtn').dataset.editingId = '';
            document.getElementById('payAmount').value = '';
            document.getElementById('payUntil').value = '';
            document.getElementById('payNote').value = '';
        });
        
        // Сохранение оплаты
        document.getElementById('savePaymentBtn').addEventListener('click', async () => {
            const amount = document.getElementById('payAmount').value;
            const until = document.getElementById('payUntil').value;
            const note = document.getElementById('payNote').value;
            const errorDiv = document.getElementById('paymentError');
            const editingId = document.getElementById('savePaymentBtn').dataset.editingId;
            
            if (!amount) {
                errorDiv.textContent = 'Введите сумму';
                return;
            }
            
            const paymentData = {
                teacher_id: teacherId,
                amount: parseFloat(amount),
                paid_until: until || null,
                notes: note || null
            };
            
            let error;
            if (editingId) {
                const res = await supabase
                    .from('teacher_payments')
                    .update(paymentData)
                    .eq('id', editingId);
                error = res.error;
            } else {
                paymentData.payment_date = new Date().toISOString().split('T')[0];
                const res = await supabase.from('teacher_payments').insert(paymentData);
                error = res.error;
            }
            
            if (error) {
                errorDiv.textContent = error.message;
                return;
            }
            
            closeModal();
            openTeacherCardModal(teacherId, supabase, onUpdate);
        });
        
        // Редактирование и удаление оплат (делегирование)
        modalContent.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-payment-btn');
            const deleteBtn = e.target.closest('.delete-payment-btn');
            
            if (editBtn) {
                document.getElementById('payAmount').value = editBtn.dataset.amount;
                document.getElementById('payUntil').value = editBtn.dataset.until;
                document.getElementById('payNote').value = editBtn.dataset.note;
                
                const saveBtn = document.getElementById('savePaymentBtn');
                saveBtn.textContent = 'Обновить';
                saveBtn.dataset.editingId = editBtn.dataset.id;
                
                document.getElementById('addPaymentBlock').style.display = 'block';
                document.getElementById('paymentError').textContent = '';
            }
            
            if (deleteBtn) {
                if (!confirm('Удалить оплату?')) return;
                
                supabase
                    .from('teacher_payments')
                    .delete()
                    .eq('id', deleteBtn.dataset.id)
                    .then(({ error }) => {
                        if (error) {
                            alert('Ошибка удаления: ' + error.message);
                        } else {
                            closeModal();
                            openTeacherCardModal(teacherId, supabase, onUpdate);
                        }
                    });
            }
        });
        
        // Сохранение заметки
        document.getElementById('saveNoteBtn').addEventListener('click', async () => {
            const note = document.getElementById('newNote').value.trim();
            if (!note) return;
            
            await supabase.from('teacher_notes').insert({
                teacher_id: teacherId,
                note
            });
            
            closeModal();
            openTeacherCardModal(teacherId, supabase, onUpdate);
        });

    } catch (err) {
        console.error('Ошибка:', err);
        modalContent.innerHTML = `<p class="error-message">Ошибка загрузки: ${err.message}</p>`;
    }
}

