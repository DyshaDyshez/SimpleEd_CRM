// ==========================================
// SIMPLEED CRM — ЛОГИКА АДМИН-ПАНЕЛИ (С АРХИВОМ)
// ==========================================

(function(){
    // Проверка авторизации админа
    const session = localStorage.getItem('adminAuth');
    if (!session) { window.location.href = 'admin_login.html'; return; }
    const admin = JSON.parse(session);

    // Инициализация Supabase
    const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

    // DOM-элементы
    const tbody = document.getElementById('teachersTableBody');
    const addBtn = document.getElementById('addTeacherBtn');
    const addFormDiv = document.getElementById('addTeacherForm');
    const cancelAdd = document.getElementById('cancelAddBtn');
    const newForm = document.getElementById('newTeacherForm');
    const formError = document.getElementById('formError');
    const remindBtn = document.getElementById('remindPaymentsBtn');
    const modal = document.getElementById('teacherModal');
    const modalTitle = document.getElementById('modalTeacherName');
    const modalContent = document.getElementById('modalContent');
    const closeModal = document.getElementById('closeModalBtn');
    const allPaymentsBody = document.getElementById('allPaymentsBody');
    const tabs = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');


    let selectedChatId = null;
    let adminId = null;


    let showArchived = false;

    // Отображение имени админа
    document.getElementById('adminNameDisplay').textContent = admin.name || 'Админ';
    document.getElementById('adminAvatar').textContent = (admin.name || 'A')[0].toUpperCase();

    // Форматирование даты
    function formatDate(d) { return d ? new Date(d).toLocaleDateString('ru-RU') : '—'; }

    function showLoader() {
        document.getElementById('globalLoader')?.classList.remove('hidden');
    }
    function hideLoader() {
        document.getElementById('globalLoader')?.classList.add('hidden');
    }

    // ========== ЗАГРУЗКА ПРЕПОДАВАТЕЛЕЙ (С УЧЁТОМ АРХИВА) ==========
    async function loadTeachers() {
        try {
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
                tbody.innerHTML = `<tr><td colspan="7">Нет преподавателей</td></tr>`;
                return;
            }
    
            const now = new Date();
            tbody.innerHTML = data.map(t => {
                const access = t.access_until ? new Date(t.access_until) : null;
                const lastPay = t.teacher_payments?.sort((a,b)=> new Date(b.paid_until)-new Date(a.paid_until))[0];
                const paidUntil = lastPay?.paid_until ? new Date(lastPay.paid_until) : null;
                const warning = paidUntil && (paidUntil - now) < 3*24*3600*1000 && paidUntil > now;
                const status = t.activity_status || (access && access > now ? 'active' : 'inactive');
    
                return `<tr>
                    <td>${t.teacher_name || '—'}</td>
                    <td>${t.email}</td>
                    <td><span class="badge plan-${t.subscription_plan}">${t.subscription_plan}</span></td>
                    <td>${formatDate(access)}</td>
                    <td><span class="badge ${status}">${status}</span></td>
                    <td>${formatDate(paidUntil)} ${warning ? '<i class="fas fa-exclamation-triangle" style="color:#d32f2f;"></i>' : ''}</td>
                    <td>
                        <button class="btn-icon view-card" data-id="${t.id}"><i class="fas fa-id-card"></i></button>
                        ${!showArchived ? `
                            <button class="btn-icon archive-teacher" data-id="${t.id}" title="В архив">
                                <i class="fas fa-archive"></i>
                            </button>
                        ` : `
                            <button class="btn-icon unarchive-teacher" data-id="${t.id}" title="Восстановить">
                                <i class="fas fa-undo"></i>
                            </button>
                        `}
                    </td>
                </tr>`;
            }).join('');
    
            document.querySelectorAll('.view-card').forEach(btn => {
                btn.addEventListener('click', () => openCard(btn.dataset.id));
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
    
            document.querySelector('#teachersTab h2').innerHTML = 
                `<i class="fas fa-${showArchived ? 'archive' : 'chalkboard-user'}"></i> ` +
                `${showArchived ? 'Архив преподавателей' : 'Преподаватели'}`;
    
        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7">Ошибка загрузки</td></tr>`;
        }
    }

    // ========== АРХИВАЦИЯ / ВОССТАНОВЛЕНИЕ ==========
    async function archiveTeacher(teacherId) {
        if (!confirm('Переместить преподавателя в архив? Его данные сохранятся, но он не будет отображаться в активных списках.')) return;
        const { error } = await supabase
            .from('teacher_profiles')
            .update({ activity_status: 'archived' })
            .eq('id', teacherId);
        if (error) { alert('Ошибка: ' + error.message); return; }
        loadTeachers();
    }

    async function unarchiveTeacher(teacherId) {
        if (!confirm('Восстановить преподавателя из архива? Какой статус установить?')) return;
        const newStatus = prompt('Введите новый статус (active, inactive, vip, blocked):', 'active');
        if (!['active', 'inactive', 'vip', 'blocked'].includes(newStatus)) {
            alert('Недопустимый статус');
            return;
        }
        const { error } = await supabase
            .from('teacher_profiles')
            .update({ activity_status: newStatus })
            .eq('id', teacherId);
        if (error) { alert('Ошибка: ' + error.message); return; }
        loadTeachers();
    }

    // ========== ПОЗДРАВЛЕНИЕ С ДР ==========
    async function sendBirthdayGreeting(teacherId, teacherName, btn) {
        try {
            const currentYear = new Date().getFullYear();
            
            // Сохраняем факт поздравления
            const { error: greetingError } = await supabase
                .from('birthday_greetings')
                .insert({ teacher_id: teacherId, greeting_year: currentYear });
            if (greetingError) console.error('Ошибка сохранения факта поздравления:', greetingError);

            // Создаём уведомление
            const { error: notifError } = await supabase
                .from('notifications')
                .insert({
                    teacher_id: teacherId,
                    type: 'birthday',
                    title: 'С днём рождения! 🎉',
                    content: `Дорогой(ая) ${teacherName}, поздравляем Вас с днём рождения! Желаем успехов, вдохновения и благодарных учеников!`,
                    is_read: false,
                    created_at: new Date().toISOString()
                });
            if (notifError) {
                console.error('Ошибка отправки поздравления:', notifError);
                alert('Не удалось отправить уведомление');
                return;
            }

            alert(`Поздравление для ${teacherName} отправлено!`);
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-check"></i> Отправлено';
            }
            setTimeout(() => loadTeachers(), 1500);
        } catch (err) {
            console.error(err);
            alert('Ошибка: ' + err.message);
        }
    }

    // ========== КАРТОЧКА ПРЕПОДАВАТЕЛЯ ==========
    async function openCard(teacherId) {
        modal.classList.remove('hidden');
        modalTitle.textContent = 'Загрузка...';
        modalContent.innerHTML = '<p style="text-align:center;padding:2rem;">Загрузка данных...</p>';

        try {
            const { data: profile, error: profErr } = await supabase
                .from('teacher_profiles')
                .select('*')
                .eq('id', teacherId)
                .single();
            if (profErr) throw profErr;

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

            // Проверка на кнопку поздравления
            const currentYear = new Date().getFullYear();
            const { data: sentGreeting } = await supabase
                .from('birthday_greetings')
                .select('id')
                .eq('teacher_id', teacherId)
                .eq('greeting_year', currentYear)
                .maybeSingle();
            const alreadyGreeted = !!sentGreeting;
            
            let showBirthdayButton = false;
            if (profile.birthday && !alreadyGreeted) {
                const today = new Date(); today.setHours(0,0,0,0);
                const birthDate = new Date(profile.birthday);
                const birthMonth = birthDate.getMonth(), birthDay = birthDate.getDate();
                for (let i = 0; i <= 2; i++) {
                    const checkDate = new Date(today);
                    checkDate.setDate(today.getDate() + i);
                    if (checkDate.getMonth() === birthMonth && checkDate.getDate() === birthDay) {
                        showBirthdayButton = true; break;
                    }
                }
            }

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
                
                <div style="background: var(--neutral-light); padding: 1rem; border-radius: var(--border-radius-sm); margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                    <div>
                        <i class="fas fa-birthday-cake" style="color: var(--primary-warm); margin-right: 0.5rem;"></i>
                        <strong>День рождения:</strong> ${birthdayFormatted}
                    </div>
                    ${showBirthdayButton ? `
                        <button class="btn btn-sm btn-primary send-birthday-wish-card" data-id="${teacherId}" data-name="${profile.teacher_name}">
                            <i class="fas fa-gift"></i> Поздравить
                        </button>
                    ` : ''}
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
                    <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                        <button type="submit" class="btn btn-success">Сохранить</button>
                        <button type="button" class="btn btn-warning" id="archiveFromCardBtn">
                            <i class="fas fa-archive"></i> В архив
                        </button>
                    </div>
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

            // Кнопка поздравления
            const birthdayBtn = modalContent.querySelector('.send-birthday-wish-card');
            if (birthdayBtn) {
                birthdayBtn.addEventListener('click', async () => {
                    await sendBirthdayGreeting(teacherId, profile.teacher_name, birthdayBtn);
                });
            }

            // Кнопка "В архив" из карточки
            document.getElementById('archiveFromCardBtn')?.addEventListener('click', () => {
                modal.classList.add('hidden');
                archiveTeacher(teacherId);
            });

            document.getElementById('editForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const newPass = document.getElementById('editPassword').value;
                const birthday = document.getElementById('editBirthday').value;
                const updates = {
                    teacher_name: document.getElementById('editName').value,
                    email: document.getElementById('editEmail').value,
                    birthday: birthday || null,
                    subscription_plan: document.getElementById('editPlan').value,
                    access_until: document.getElementById('editAccess').value,
                    activity_status: document.getElementById('editStatus').value
                };
                await supabase.from('teacher_profiles').update(updates).eq('id', teacherId);
                if (newPass) {
                    await supabase.auth.admin.updateUserById(teacherId, { password: newPass });
                }
                modal.classList.add('hidden');
                loadTeachers();
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
                openCard(teacherId);
                loadTeachers();
            });
            document.getElementById('saveNote').addEventListener('click', async () => {
                const note = document.getElementById('newNote').value;
                if (!note) return;
                await supabase.from('teacher_notes').insert({ teacher_id: teacherId, note });
                openCard(teacherId);
            });

        } catch (err) {
            console.error(err);
            modalContent.innerHTML = `<p class="error-message">Ошибка: ${err.message}</p>`;
        }
    }

    // Закрытие модалки
    closeModal.addEventListener('click', () => modal.classList.add('hidden'));
    window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

    // ========== ДОБАВЛЕНИЕ УЧИТЕЛЯ ==========
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        formError.textContent = '';
        const email = document.getElementById('newEmail').value.trim();
        const name = document.getElementById('newName').value.trim();
        const password = document.getElementById('newPassword').value;
        const plan = document.getElementById('newPlan').value;
        const accessDate = document.getElementById('newAccessUntil').value;
        const status = document.getElementById('newStatus').value;

        if (!email || !name || !password) {
            formError.textContent = 'Заполните все обязательные поля';
            return;
        }

        try {
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email, password,
                options: { data: { teacher_name: name } }
            });
            if (signUpError) throw signUpError;

            const userId = signUpData.user?.id;
            if (!userId) throw new Error('Не удалось получить ID пользователя');

            const accessDateObj = accessDate ? new Date(accessDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            const { error: profileError } = await supabase
                .from('teacher_profiles')
                .upsert({
                    id: userId, email, teacher_name: name,
                    subscription_plan: plan, plain_password: password,
                    access_until: accessDateObj.toISOString(), activity_status: status
                }, { onConflict: 'id' });
            if (profileError) throw profileError;

            addFormDiv.classList.add('hidden');
            newForm.reset();
            loadTeachers();
            alert(`Учитель ${name} успешно создан!`);
        } catch (err) {
            console.error('Ошибка создания учителя:', err);
            formError.textContent = err.message;
        }
    });

    addBtn.addEventListener('click', () => addFormDiv.classList.toggle('hidden'));
    cancelAdd.addEventListener('click', () => { addFormDiv.classList.add('hidden'); formError.textContent = ''; });

    // Напоминание об оплате
    remindBtn.addEventListener('click', async () => {
        const { data } = await supabase
            .from('teacher_profiles')
            .select('*, teacher_payments(paid_until)');
        const soon = data.filter(t => {
            const last = t.teacher_payments?.sort((a,b)=> new Date(b.paid_until)-new Date(a.paid_until))[0];
            if (!last?.paid_until) return false;
            const days = (new Date(last.paid_until) - new Date()) / (1000*3600*24);
            return days > 0 && days <= 3;
        });
        if (soon.length) {
            alert(soon.map(t => `${t.teacher_name} (${t.email}) – до ${t.teacher_payments[0].paid_until}`).join('\n'));
            if (soon.length === 1) openCard(soon[0].id);
        } else {
            alert('Нет преподавателей с окончанием оплаты в ближайшие 3 дня.');
        }
    });

    // Вкладки
    tabs.forEach(tab => tab.addEventListener('click', (e) => {
        e.preventDefault();
        const id = tab.dataset.tab;
        tabContents.forEach(c => c.classList.remove('active'));
        document.getElementById(id + 'Tab').classList.add('active');
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (id === 'payments') loadAllPayments();
    }));

    async function loadAllPayments() {
        const { data } = await supabase
            .from('teacher_payments')
            .select('*, teacher_profiles(teacher_name)')
            .order('payment_date', { ascending: false });
        allPaymentsBody.innerHTML = data?.map(p => `<tr><td>${p.payment_date}</td><td>${p.teacher_profiles?.teacher_name}</td><td>${p.amount}₽</td><td>${p.paid_until}</td><td>${p.notes || ''}</td></tr>`).join('') || '<tr><td colspan="5">Нет оплат</td></tr>';
    }

    // Выход
    document.getElementById('logoutAdminBtn').addEventListener('click', () => {
        localStorage.removeItem('adminAuth');
        window.location.href = 'admin_login.html';
    });
    document.getElementById('backToCrmBtn').addEventListener('click', () => window.location.href = 'index.html');

    // Фильтры архив/активные
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
    // Старт
    loadTeachers();


      

    


    // ========== НАСТРОЙКИ ==========
    // 1. Тарифы (сохранение в БД)
    const tariffsTbody = document.getElementById('tariffsTableBody');
    const addTariffBtn = document.getElementById('addTariffBtn');
    const resetTariffsBtn = document.getElementById('resetTariffsBtn');

    async function loadTariffs() {
        if (!tariffsTbody) return;
        const { data, error } = await supabase.from('tariffs').select('*').order('price');
        if (error) {
            tariffsTbody.innerHTML = `<tr><td colspan="5">Ошибка загрузки</td></tr>`;
            return;
        }
        if (!data?.length) {
            tariffsTbody.innerHTML = `<tr><td colspan="5">Нет тарифов</td></tr>`;
            return;
        }
        tariffsTbody.innerHTML = data.map(t => `
            <tr>
                <td><input type="text" value="${t.name}" data-field="name" data-id="${t.id}" style="width:100px;"></td>
                <td><input type="number" value="${t.price}" data-field="price" data-id="${t.id}" style="width:100px;"></td>
                <td><input type="number" value="${t.duration_days}" data-field="duration" data-id="${t.id}" style="width:80px;"></td>
                <td><input type="text" value="${t.features || ''}" data-field="features" data-id="${t.id}" style="width:200px;"></td>
                <td>
                    <button class="btn-icon save-tariff" data-id="${t.id}"><i class="fas fa-check"></i></button>
                    <button class="btn-icon delete-tariff" data-id="${t.id}"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        document.querySelectorAll('.save-tariff').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const row = btn.closest('tr');
                const name = row.querySelector('[data-field="name"]').value;
                const price = row.querySelector('[data-field="price"]').value;
                const duration = row.querySelector('[data-field="duration"]').value;
                const features = row.querySelector('[data-field="features"]').value;
                const { error } = await supabase.from('tariffs').update({ name, price, duration_days: duration, features }).eq('id', id);
                if (error) alert('Ошибка: ' + error.message);
                else loadTariffs();
            });
        });

        document.querySelectorAll('.delete-tariff').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Удалить тариф?')) return;
                const { error } = await supabase.from('tariffs').delete().eq('id', btn.dataset.id);
                if (error) alert('Ошибка: ' + error.message);
                else loadTariffs();
            });
        });
    }

    addTariffBtn?.addEventListener('click', async () => {
        const name = prompt('Название тарифа (например, "premium"):');
        if (!name) return;
        const price = prompt('Цена (₽):', '1990');
        const duration = prompt('Длительность (дней):', '30');
        const features = prompt('Возможности (описание):', '');
        const { error } = await supabase.from('tariffs').insert({ name, price: Number(price), duration_days: Number(duration), features });
        if (error) alert('Ошибка: ' + error.message);
        else loadTariffs();
    });

    resetTariffsBtn?.addEventListener('click', async () => {
        if (!confirm('Сбросить тарифы до стандартных? Все текущие изменения будут потеряны.')) return;
        await supabase.from('tariffs').delete().neq('name', ''); // очищаем
        const defaults = [
            { name: 'trial', price: 0, duration_days: 14, features: 'Базовый функционал' },
            { name: 'pro', price: 2990, duration_days: 30, features: 'Расширенные возможности' },
            { name: 'vip', price: 5990, duration_days: 30, features: 'Максимальный пакет' }
        ];
        await supabase.from('tariffs').insert(defaults);
        loadTariffs();
    });

    // 2. Уведомления
    const announceTbody = document.getElementById('announcementsTableBody');
    const announceForm = document.getElementById('newAnnouncementForm');
    const announceMsg = document.getElementById('announceFormMessage');

    async function loadAnnouncements() {
        if (!announceTbody) return;
        const { data, error } = await supabase.from('announcements').select('*').order('scheduled_date', { ascending: true });
        if (error) {
            announceTbody.innerHTML = `<tr><td colspan="4">Ошибка</td></tr>`;
            return;
        }
        if (!data?.length) {
            announceTbody.innerHTML = `<tr><td colspan="4">Нет уведомлений</td></tr>`;
            return;
        }
        const today = new Date().toISOString().slice(0,10);
        announceTbody.innerHTML = data.map(a => {
            const isPublished = a.is_published;
            const isFuture = a.scheduled_date > today;
            const status = isPublished ? '✅ Опубликовано' : (isFuture ? '⏳ Запланировано' : '⚠️ Просрочено');
            return `
                <tr>
                    <td>${a.title}</td>
                    <td>${new Date(a.scheduled_date).toLocaleDateString('ru-RU')}</td>
                    <td>${status}</td>
                    <td>
                        ${!isPublished ? `<button class="btn-icon publish-announce" data-id="${a.id}" title="Опубликовать сейчас"><i class="fas fa-check-circle"></i></button>` : ''}
                        <button class="btn-icon delete-announce" data-id="${a.id}"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.publish-announce').forEach(btn => {
            btn.addEventListener('click', async () => {
                await supabase.from('announcements').update({ is_published: true }).eq('id', btn.dataset.id);
                loadAnnouncements();
            });
        });
        document.querySelectorAll('.delete-announce').forEach(btn => {
            btn.addEventListener('click', async () => {
                await supabase.from('announcements').delete().eq('id', btn.dataset.id);
                loadAnnouncements();
            });
        });
    }

    announceForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('announceTitle').value.trim();
        const content = document.getElementById('announceContent').value.trim();
        const scheduled = document.getElementById('announceDate').value;
        
        if (!title || !content || !scheduled) {
            announceMsg.innerHTML = '<span style="color:#d32f2f;">Заполните все поля</span>';
            return;
        }
    
        try {
            // 1. Сохраняем объявление в таблицу announcements (для истории админа)
            const { error: announceError } = await supabase
                .from('announcements')
                .insert({ 
                    title, 
                    content, 
                    scheduled_date: scheduled, 
                    is_published: true // сразу публикуем
                });
    
            if (announceError) throw announceError;
    
            // 2. Получаем список всех активных преподавателей
            const { data: teachers, error: teachersError } = await supabase
                .from('teacher_profiles')
                .select('id')
                .eq('activity_status', 'active');
    
            if (teachersError) throw teachersError;
    
            // 3. Создаём уведомления для каждого преподавателя
            if (teachers && teachers.length > 0) {
                const notifications = teachers.map(t => ({
                    teacher_id: t.id,
                    type: 'announcement',
                    title: title,
                    content: content,
                    is_read: false,
                    created_at: new Date().toISOString()
                }));
    
                const { error: notifError } = await supabase
                    .from('notifications')
                    .insert(notifications);
    
                if (notifError) throw notifError;
            }
    
            announceMsg.innerHTML = '<span style="color:#2C4C3B;">✓ Уведомление отправлено всем преподавателям</span>';
            announceForm.reset();
            loadAnnouncements();
    
        } catch (err) {
            console.error('Ошибка:', err);
            announceMsg.innerHTML = `<span style="color:#d32f2f;">Ошибка: ${err.message}</span>`;
        }
    });

    // Автоматическая публикация по дате (проверка при загрузке)
    async function autoPublishAnnouncements() {
        const today = new Date().toISOString().slice(0,10);
        await supabase.from('announcements')
            .update({ is_published: true })
            .eq('is_published', false)
            .lte('scheduled_date', today);
        loadAnnouncements();
    }

    // 3. Экспорт (функции downloadCSV уже есть, просто добавим кнопки)
    document.getElementById('exportTeachersBtn')?.addEventListener('click', async () => {
        const { data } = await supabase.from('teacher_profiles').select('*');
        if (!data?.length) { alert('Нет данных'); return; }
        const csv = [
            ['Имя', 'Email', 'Тариф', 'Доступ до', 'Статус', 'Пароль'].join(','),
            ...data.map(t => [t.teacher_name||'', t.email, t.subscription_plan, t.access_until?new Date(t.access_until).toLocaleDateString('ru-RU'):'', t.activity_status, t.plain_password||''].join(','))
        ].join('\n');
        downloadCSV(csv, `teachers_${new Date().toISOString().slice(0,10)}.csv`);
    });

    document.getElementById('exportPaymentsBtn')?.addEventListener('click', async () => {
        const { data } = await supabase.from('teacher_payments').select('*, teacher_profiles(teacher_name, email)');
        if (!data?.length) { alert('Нет данных'); return; }
        const csv = [
            ['Дата', 'Преподаватель', 'Email', 'Сумма', 'Оплачено до', 'Заметка'].join(','),
            ...data.map(p => [p.payment_date, p.teacher_profiles?.teacher_name||'', p.teacher_profiles?.email||'', p.amount, p.paid_until, p.notes||''].join(','))
        ].join('\n');
        downloadCSV(csv, `payments_${new Date().toISOString().slice(0,10)}.csv`);
    });

    // Вызов загрузок при открытии вкладки Settings
    const settingsTab = document.getElementById('settingsTab');
    const observer = new MutationObserver(() => {
        if (settingsTab.classList.contains('active')) {
            loadTariffs();
            loadAnnouncements();
            autoPublishAnnouncements();
        }
    });
    observer.observe(settingsTab, { attributes: true, attributeFilter: ['class'] });
    if (settingsTab.classList.contains('active')) {
        loadTariffs();
        loadAnnouncements();
        autoPublishAnnouncements();
    }

// ========== СТАТИСТИКА ==========
let revenueChart = null;
let weekdayChart = null;

async function loadStatistics() {
    const period = document.getElementById('statsPeriodSelect')?.value || '30';
    
    try {
        showLoader();
        
        // Определяем дату начала периода
        let startDate = null;
        if (period !== 'all') {
            const days = parseInt(period);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate = startDate.toISOString();
        }

        // Загружаем все данные параллельно
        const [
            teachersRes,
            studentsRes,
            groupsRes,
            lessonsRes,
            paymentsRes,
            allLessonsRes
        ] = await Promise.all([
            supabase.from('teacher_profiles').select('id, teacher_name, activity_status, created_at'),
            supabase.from('students').select('id, teacher_id'),
            supabase.from('student_groups').select('id, teacher_id'),
            supabase.from('lessons').select('id, teacher_id, lesson_date, status').gte('lesson_date', startDate || '1900-01-01'),
            supabase.from('payments').select('amount, teacher_id, payment_date').gte('payment_date', startDate || '1900-01-01'),
            supabase.from('lessons').select('lesson_date, status')
        ]);

        // Общие показатели
        const teachers = teachersRes.data || [];
        const activeTeachers = teachers.filter(t => t.activity_status === 'active');
        
        document.getElementById('totalTeachers').textContent = teachers.length;
        document.getElementById('totalStudents').textContent = studentsRes.data?.length || 0;
        document.getElementById('totalGroups').textContent = groupsRes.data?.length || 0;
        document.getElementById('totalLessons').textContent = lessonsRes.data?.length || 0;

        // Финансы
        const payments = paymentsRes.data || [];
        const totalRevenue = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        document.getElementById('totalRevenue').textContent = totalRevenue.toFixed(0) + ' ₽';
        
        const avgRevenue = activeTeachers.length > 0 ? totalRevenue / activeTeachers.length : 0;
        document.getElementById('avgRevenuePerTeacher').textContent = avgRevenue.toFixed(0) + ' ₽';

        // Топ учителей
        const teacherStats = new Map();
        teachers.forEach(t => {
            teacherStats.set(t.id, {
                name: t.teacher_name || t.email || 'Без имени',
                students: 0,
                lessons: 0,
                revenue: 0,
                status: t.activity_status
            });
        });

        studentsRes.data?.forEach(s => {
            if (s.teacher_id && teacherStats.has(s.teacher_id)) {
                teacherStats.get(s.teacher_id).students++;
            }
        });

        lessonsRes.data?.forEach(l => {
            if (l.teacher_id && teacherStats.has(l.teacher_id)) {
                teacherStats.get(l.teacher_id).lessons++;
            }
        });

        payments.forEach(p => {
            if (p.teacher_id && teacherStats.has(p.teacher_id)) {
                teacherStats.get(p.teacher_id).revenue += parseFloat(p.amount) || 0;
            }
        });

        // Сортировка по выручке
        const sortedTeachers = Array.from(teacherStats.values())
            .sort((a, b) => b.revenue - a.revenue);

        if (sortedTeachers.length > 0) {
            document.getElementById('topTeacher').textContent = sortedTeachers[0].name;
        }

        // Таблица топ учителей
        const tbody = document.getElementById('topTeachersBody');
        if (tbody) {
            tbody.innerHTML = sortedTeachers.slice(0, 10).map((t, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td>${t.name}</td>
                    <td>${t.students}</td>
                    <td>${t.lessons}</td>
                    <td>${t.revenue.toFixed(0)} ₽</td>
                    <td><span class="badge ${t.status}">${t.status}</span></td>
                </tr>
            `).join('') || '<tr><td colspan="6">Нет данных</td></tr>';
        }

        // График выручки по дням
        const dailyRevenue = new Map();
        payments.forEach(p => {
            const date = p.payment_date;
            dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + (parseFloat(p.amount) || 0));
        });

        const sortedDates = Array.from(dailyRevenue.keys()).sort();
        const labels = sortedDates.map(d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        const data = sortedDates.map(d => dailyRevenue.get(d));

        if (revenueChart) revenueChart.destroy();
        const ctx = document.getElementById('revenueChart')?.getContext('2d');
        if (ctx) {
            revenueChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Выручка (₽)',
                        data,
                        borderColor: '#D4A373',
                        backgroundColor: 'rgba(212, 163, 115, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // Активность по дням недели
        const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
        allLessonsRes.data?.forEach(l => {
            const date = new Date(l.lesson_date);
            const day = date.getDay(); // 0 = воскресенье
            weekdayCounts[day]++;
        });

        if (weekdayChart) weekdayChart.destroy();
        const ctxWeekday = document.getElementById('weekdayChart')?.getContext('2d');
        if (ctxWeekday) {
            weekdayChart = new Chart(ctxWeekday, {
                type: 'bar',
                data: {
                    labels: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
                    datasets: [{
                        label: 'Уроков',
                        data: weekdayCounts,
                        backgroundColor: '#D4A373'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

    } catch (err) {
        console.error('Ошибка загрузки статистики:', err);
    } finally {
        hideLoader();
    }
}

// Привязываем обновление статистики
document.getElementById('refreshStatsBtn')?.addEventListener('click', loadStatistics);
document.getElementById('statsPeriodSelect')?.addEventListener('change', loadStatistics);

// Загружаем статистику при открытии вкладки
const statsTabObserver = new MutationObserver(() => {
    if (document.getElementById('statsTab')?.classList.contains('active')) {
        loadStatistics();
    }
});
statsTabObserver.observe(document.getElementById('statsTab'), { 
    attributes: true, 
    attributeFilter: ['class'] 
});

// ========== СТАТИСТИКА ПРОДАЖ CRM ==========
let salesChart = null;
let planChart = null;
let statusChart = null;

async function loadSalesStatistics() {
    const period = document.getElementById('salesPeriodSelect')?.value || '30';
    
    try {
        showLoader();
        
        // Определяем дату начала периода
        let startDate = null;
        if (period !== 'all') {
            const days = parseInt(period);
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate = startDate.toISOString().split('T')[0];
        }

        // Загружаем данные
        let query = supabase
            .from('teacher_payments')
            .select(`
                *,
                teacher_profiles (
                    id, teacher_name, email, subscription_plan, activity_status, access_until
                )
            `)
            .order('payment_date', { ascending: false });
        
        if (startDate) {
            query = query.gte('payment_date', startDate);
        }
        
        const { data: payments, error } = await query;
        if (error) throw error;

        // Загружаем всех учителей для статистики статусов
        const { data: allTeachers } = await supabase
            .from('teacher_profiles')
            .select('subscription_plan, activity_status');

        const salesData = payments || [];
        
        // ===== СВОДКА =====
        const totalRevenue = salesData.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        document.getElementById('totalSalesRevenue').textContent = totalRevenue.toFixed(0) + ' ₽';
        document.getElementById('totalSalesCount').textContent = salesData.length;
        
        const activeCount = allTeachers?.filter(t => t.activity_status === 'active').length || 0;
        document.getElementById('activeSubscriptions').textContent = activeCount;
        
        const avgCheck = salesData.length > 0 ? totalRevenue / salesData.length : 0;
        document.getElementById('avgCheck').textContent = avgCheck.toFixed(0) + ' ₽';

        // Выручка за текущий месяц
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthRevenue = salesData
            .filter(p => p.payment_date >= monthStart)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        document.getElementById('salesThisMonth').textContent = monthRevenue.toFixed(0) + ' ₽';

        // Лучший день по продажам
        const dailySales = new Map();
        salesData.forEach(p => {
            const date = p.payment_date;
            dailySales.set(date, (dailySales.get(date) || 0) + (parseFloat(p.amount) || 0));
        });
        let bestDay = '—';
        let bestAmount = 0;
        dailySales.forEach((amount, date) => {
            if (amount > bestAmount) {
                bestAmount = amount;
                bestDay = new Date(date).toLocaleDateString('ru-RU');
            }
        });
        document.getElementById('bestSalesDay').textContent = bestDay !== '—' ? `${bestDay} (${bestAmount.toFixed(0)} ₽)` : '—';

        // Самый популярный тариф
        const planCounts = new Map();
        allTeachers?.forEach(t => {
            if (t.subscription_plan) {
                planCounts.set(t.subscription_plan, (planCounts.get(t.subscription_plan) || 0) + 1);
            }
        });
        let popularPlan = '—';
        let maxCount = 0;
        planCounts.forEach((count, plan) => {
            if (count > maxCount) {
                maxCount = count;
                popularPlan = plan;
            }
        });
        document.getElementById('mostPopularPlan').textContent = popularPlan;

        // ===== ТАБЛИЦА =====
        const tbody = document.getElementById('salesTableBody');
        if (tbody) {
            if (salesData.length > 0) {
                tbody.innerHTML = salesData.map(p => {
                    const teacher = p.teacher_profiles;
                    return `
                        <tr>
                            <td>${p.payment_date ? new Date(p.payment_date).toLocaleDateString('ru-RU') : '—'}</td>
                            <td>${teacher?.teacher_name || teacher?.email || '—'}</td>
                            <td><span class="badge plan-${teacher?.subscription_plan}">${teacher?.subscription_plan || '—'}</span></td>
                            <td>${p.amount || 0} ₽</td>
                            <td>${p.paid_until ? new Date(p.paid_until).toLocaleDateString('ru-RU') : '—'}</td>
                            <td>${p.notes || '—'}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbody.innerHTML = '<tr><td colspan="6">Нет данных за выбранный период</td></tr>';
            }
        }

        // ===== ГРАФИК ПРОДАЖ ПО ДНЯМ =====
        const dailyMap = new Map();
        salesData.forEach(p => {
            const date = p.payment_date;
            dailyMap.set(date, (dailyMap.get(date) || 0) + (parseFloat(p.amount) || 0));
        });

        const sortedDates = Array.from(dailyMap.keys()).sort();
        const labels = sortedDates.map(d => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        const chartData = sortedDates.map(d => dailyMap.get(d));

        if (salesChart) salesChart.destroy();
        const ctx = document.getElementById('salesChart')?.getContext('2d');
        if (ctx) {
            salesChart = new Chart(ctx, {
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
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // ===== КРУГОВАЯ ДИАГРАММА ПО ТАРИФАМ =====
        const planRevenue = new Map();
        salesData.forEach(p => {
            const plan = p.teacher_profiles?.subscription_plan || 'unknown';
            planRevenue.set(plan, (planRevenue.get(plan) || 0) + (parseFloat(p.amount) || 0));
        });

        if (planChart) planChart.destroy();
        const ctxPlan = document.getElementById('planChart')?.getContext('2d');
        if (ctxPlan) {
            planChart = new Chart(ctxPlan, {
                type: 'doughnut',
                data: {
                    labels: Array.from(planRevenue.keys()).map(p => p.toUpperCase()),
                    datasets: [{
                        data: Array.from(planRevenue.values()),
                        backgroundColor: ['#D4A373', '#5C4F42', '#E9C46A', '#8B7E6C', '#CC9C5B']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

        // ===== КРУГОВАЯ ДИАГРАММА ПО СТАТУСАМ =====
        const statusCounts = new Map();
        allTeachers?.forEach(t => {
            const status = t.activity_status || 'unknown';
            statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
        });

        if (statusChart) statusChart.destroy();
        const ctxStatus = document.getElementById('statusChart')?.getContext('2d');
        if (ctxStatus) {
            const statusLabels = {
                'active': 'Активные',
                'inactive': 'Неактивные',
                'vip': 'VIP',
                'blocked': 'Заблокированные',
                'trial': 'Пробный период'
            };
            statusChart = new Chart(ctxStatus, {
                type: 'doughnut',
                data: {
                    labels: Array.from(statusCounts.keys()).map(s => statusLabels[s] || s),
                    datasets: [{
                        data: Array.from(statusCounts.values()),
                        backgroundColor: ['#2C4C3B', '#8B7E6C', '#D4A373', '#d32f2f', '#E9C46A']
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }

    } catch (err) {
        console.error('Ошибка загрузки статистики продаж:', err);
    } finally {
        hideLoader();
    }
}

// Экспорт продаж в CSV
function exportSalesToCSV() {
    // Используем уже загруженные данные из таблицы
    const rows = [];
    rows.push(['Дата', 'Преподаватель', 'Email', 'Тариф', 'Сумма', 'Оплачено до', 'Заметка'].join(','));
    
    document.querySelectorAll('#salesTableBody tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 6) {
            const rowData = [
                cells[0].textContent,
                cells[1].textContent,
                '', // email не отображается в таблице, можно пропустить
                cells[2].textContent.replace('₽', '').trim(),
                cells[3].textContent,
                cells[4].textContent,
                cells[5].textContent
            ].map(v => `"${v}"`).join(',');
            rows.push(rowData);
        }
    });
    
    const csv = rows.join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// Привязываем события
document.getElementById('refreshSalesBtn')?.addEventListener('click', loadSalesStatistics);
document.getElementById('salesPeriodSelect')?.addEventListener('change', loadSalesStatistics);
document.getElementById('exportSalesBtn')?.addEventListener('click', exportSalesToCSV);

// Загружаем при открытии вкладки
const paymentsTabObserver = new MutationObserver(() => {
    if (document.getElementById('paymentsTab')?.classList.contains('active')) {
        loadSalesStatistics();
    }
});
paymentsTabObserver.observe(document.getElementById('paymentsTab'), { 
    attributes: true, 
    attributeFilter: ['class'] 
});

// Загружаем чаты при открытии вкладки
const chatsTabObserver = new MutationObserver(() => {
    if (document.getElementById('chatsTab')?.classList.contains('active')) {
        initChatsTab();
    }
});
chatsTabObserver.observe(document.getElementById('chatsTab'), { 
    attributes: true, 
    attributeFilter: ['class'] 
});
    
async function archiveTeacher(teacherId) {
    if (!confirm('Переместить преподавателя в архив? Его данные сохранятся, но он не будет отображаться в активных списках.')) return;
    
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
    if (!confirm('Восстановить преподавателя из архива? Какой статус установить?')) return;
    
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

// Внутри инициализации админ-панели
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

// ========== ЧАТЫ С ПРЕПОДАВАТЕЛЯМИ ==========
async function initChatsTab() {
    const adminEmail = JSON.parse(localStorage.getItem('adminAuth'))?.email;
    
    // Получаем UUID админа из таблицы platform_admins
    const { data: adminData } = await supabase
        .from('platform_admins')
        .select('id')
        .eq('email', adminEmail)
        .single();
    
    adminId = adminData?.id;
    console.log('Admin UUID:', adminId);
    
    await loadChatsList();
    
    // Realtime подписка на новые сообщения
supabase
.channel('admin-chats')
.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages'
  },
  (payload) => {
    console.log('Админ: новое сообщение', payload.new);
    const msg = payload.new;
    
    // Если сейчас открыт чат, куда пришло сообщение — обновляем его
    if (selectedChatId && msg.chat_id === selectedChatId) {
      // Добавляем сообщение в контейнер
      const container = document.getElementById('adminChatMessages');
      const isAdmin = msg.sender_type === 'admin';
      
      const msgDiv = document.createElement('div');
      msgDiv.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: ${isAdmin ? 'flex-end' : 'flex-start'};
      `;
      msgDiv.innerHTML = `
        <div style="
          background: ${isAdmin ? 'var(--primary-warm)' : 'var(--neutral-light)'};
          color: ${isAdmin ? 'white' : 'var(--text-primary)'};
          padding: 0.75rem 1rem;
          border-radius: 12px;
          border-bottom-right-radius: ${isAdmin ? '4px' : '12px'};
          border-bottom-left-radius: ${isAdmin ? '12px' : '4px'};
          max-width: 70%;
          word-wrap: break-word;
        ">
          ${escapeHtml(msg.message)}
        </div>
        <small style="color: var(--text-muted); margin-top: 0.25rem; font-size: 0.7rem;">
          ${new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </small>
      `;
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
      
      // Отмечаем прочитанным, если от учителя
      if (msg.sender_type === 'teacher') {
        supabase.from('chat_messages').update({ is_read: true }).eq('id', msg.id);
      }
    }
    
    // В любом случае обновляем список чатов (может измениться последнее сообщение)
    loadChatsList();
  }
)
.subscribe((status) => {
  console.log('Админ Realtime статус:', status);
});
}

async function loadChatsList() {
    const container = document.getElementById('chatsListContainer');
    if (!container) return;

    const { data: chats } = await supabase
        .from('chats')
        .select(`
            *,
            teacher_profiles(teacher_name, email),
            chat_messages(message, created_at, sender_type, is_read)
        `)
        .order('updated_at', { ascending: false });

    if (!chats?.length) {
        container.innerHTML = '<p style="padding: 1rem; color: var(--text-muted);">Нет чатов</p>';
        return;
    }

    container.innerHTML = chats.map(chat => {
        const lastMsg = chat.chat_messages?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        const hasUnread = chat.chat_messages?.some(m => m.sender_type === 'teacher' && !m.is_read);
        
        return `
            <div class="chat-item ${hasUnread ? 'unread' : ''}" data-chat-id="${chat.id}" style="
                padding: 1rem;
                border-bottom: 1px solid var(--neutral-gray);
                cursor: pointer;
                transition: background 0.2s;
                ${hasUnread ? 'background: var(--primary-soft); font-weight: 500;' : ''}
            ">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${chat.teacher_profiles?.teacher_name || 'Без имени'}</strong>
                    ${chat.status === 'open' ? '<span style="color: #2C4C3B;">🟢</span>' : '<span style="color: #8B7E6C;">🔴</span>'}
                </div>
                <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0.25rem 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${lastMsg?.message || 'Нет сообщений'}
                </p>
                <small style="color: var(--text-muted);">${chat.teacher_profiles?.email || ''}</small>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => selectChat(el.dataset.chatId));
    });
}

async function selectChat(chatId) {
    selectedChatId = chatId;
    
    // Подсветка активного чата
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');
    
    document.getElementById('adminChatInput').style.display = 'block';
    await loadChatMessages(chatId);

    
}

async function loadChatMessages(chatId) {
    const { data: chat } = await supabase
        .from('chats')
        .select('*, teacher_profiles(teacher_name)')
        .eq('id', chatId)
        .single();

    const { data: messages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    // Заголовок
    document.getElementById('adminChatHeader').innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h3 style="margin: 0;">${chat.teacher_profiles?.teacher_name || 'Преподаватель'}</h3>
                <p style="margin: 0.25rem 0 0; color: var(--text-secondary); font-size: 0.9rem;">${chat.teacher_profiles?.email || ''}</p>
            </div>
            <button class="btn btn-sm ${chat.status === 'open' ? 'btn-warning' : 'btn-success'}" id="toggleChatStatusBtn">
                ${chat.status === 'open' ? 'Закрыть чат' : 'Открыть чат'}
            </button>
            </button>
                <!-- 👇 КНОПКА УДАЛЕНИЯ ЧАТА -->
                <button class="btn btn-sm btn-danger" id="deleteChatBtn">
                    <i class="fas fa-trash"></i> Удалить
                </button>
        </div>
    `;

    // Сообщения
    const container = document.getElementById('adminChatMessages');
    if (!messages?.length) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted); margin-top: 2rem;">Нет сообщений</p>';
    } else {
        container.innerHTML = messages.map(msg => `
            <div style="display: flex; flex-direction: column; align-items: ${msg.sender_type === 'admin' ? 'flex-end' : 'flex-start'};">
                <div style="
                    background: ${msg.sender_type === 'admin' ? 'var(--primary-warm)' : 'var(--neutral-light)'};
                    color: ${msg.sender_type === 'admin' ? 'white' : 'var(--text-primary)'};
                    padding: 0.75rem 1rem;
                    border-radius: 12px;
                    border-bottom-right-radius: ${msg.sender_type === 'admin' ? '4px' : '12px'};
                    border-bottom-left-radius: ${msg.sender_type === 'admin' ? '12px' : '4px'};
                    max-width: 70%;
                    word-wrap: break-word;
                ">
                    ${escapeHtml(msg.message)}
                </div>
                <small style="color: var(--text-muted); margin-top: 0.25rem; font-size: 0.7rem;">
                    ${new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    ${msg.sender_type === 'teacher' && msg.is_read ? ' ✓✓' : ''}
                </small>
            </div>

            

        `).join('');

            // 👇 ОБРАБОТЧИК УДАЛЕНИЯ ЧАТА
    document.getElementById('deleteChatBtn')?.addEventListener('click', async () => {
        if (!confirm('Удалить чат и все сообщения безвозвратно?')) return;
        
        // Сначала удаляем все сообщения чата
        await supabase.from('chat_messages').delete().eq('chat_id', chatId);
        // Потом удаляем сам чат
        await supabase.from('chats').delete().eq('id', chatId);
        
        // Очищаем правую панель
        selectedChatId = null;
        document.getElementById('adminChatHeader').innerHTML = '<p style="color: var(--text-muted); margin: 0;">Выберите чат слева</p>';
        document.getElementById('adminChatMessages').innerHTML = '<p style="text-align: center; color: var(--text-muted); margin-top: 2rem;">👈 Выберите диалог</p>';
        document.getElementById('adminChatInput').style.display = 'none';
        
        // Обновляем список чатов
        await loadChatsList();
        updateAdminUnreadBadge();
    });

    const sendBtn = document.getElementById('sendAdminMessageBtn');
    const input = document.getElementById('adminMessageInput');
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

    newSendBtn.addEventListener('click', async () => {
        const msg = input.value.trim();
        if (!msg || !adminId) return;
        await supabase.from('chat_messages').insert({
            chat_id: chatId,
            sender_type: 'admin',
            sender_id: adminId,
            message: msg
        });
        input.value = '';
    });

    input.onkeypress = (e) => {
        if (e.key === 'Enter') newSendBtn.click();
    };
    }

    container.scrollTop = container.scrollHeight;

    // Отмечаем сообщения учителя как прочитанные
    messages?.filter(m => m.sender_type === 'teacher' && !m.is_read)
        .forEach(m => supabase.from('chat_messages').update({ is_read: true }).eq('id', m.id));

    // Кнопка смены статуса
    document.getElementById('toggleChatStatusBtn')?.addEventListener('click', async () => {
        const newStatus = chat.status === 'open' ? 'closed' : 'open';
        await supabase.from('chats').update({ status: newStatus }).eq('id', chatId);
        selectChat(chatId);
        loadChatsList();
    });

    // Отправка сообщения
    // Удаляем старый обработчик и вешаем новый
const sendBtn = document.getElementById('sendAdminMessageBtn');
const input = document.getElementById('adminMessageInput');

// Клонируем кнопку, чтобы убрать все старые обработчики
const newSendBtn = sendBtn.cloneNode(true);
sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

newSendBtn.addEventListener('click', async () => {
    const msg = input.value.trim();
    if (!msg) return;
    
    console.log('Отправка сообщения:', msg, 'chatId:', chatId);
    
    const { error } = await supabase
        .from('chat_messages')
        .insert({
            chat_id: chatId,
            sender_type: 'admin',
            sender_id: adminId,
            message: msg
        });
    
    if (error) {
        console.error('Ошибка отправки:', error);
        alert('Ошибка отправки: ' + error.message);
        return;
    }
    
    input.value = '';
    await loadChatMessages(chatId);
    await loadChatsList();
});

// Enter для отправки
input.onkeypress = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        newSendBtn.click();
    }
};
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function updateAdminUnreadBadge() {
    const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_type', 'teacher')
        .eq('is_read', false);

    const badge = document.getElementById('adminUnreadChatsBadge');
    if (!badge) return;

    const unread = count || 0;
    if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}




})();