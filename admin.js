// ==========================================
// SIMPLEED CRM — ЛОГИКА АДМИН-ПАНЕЛИ (НОВАЯ)
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

    // Отображение имени админа
    document.getElementById('adminNameDisplay').textContent = admin.name || 'Админ';
    document.getElementById('adminAvatar').textContent = (admin.name || 'A')[0].toUpperCase();

    // Форматирование даты
    function formatDate(d) { return d ? new Date(d).toLocaleDateString('ru-RU') : '—'; }

    // Загрузка списка преподавателей
    async function loadTeachers() {
        try {
            const { data, error } = await supabase
                .from('teacher_profiles')
                .select('*, teacher_payments(paid_until)')
                .order('created_at', { ascending: false });

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
                    <td><button class="btn-icon view-card" data-id="${t.id}"><i class="fas fa-id-card"></i></button></td>
                </tr>`;
            }).join('');

            document.querySelectorAll('.view-card').forEach(btn => {
                btn.addEventListener('click', () => openCard(btn.dataset.id));
            });
        } catch (err) {
            console.error(err);
            tbody.innerHTML = `<tr><td colspan="7">Ошибка загрузки</td></tr>`;
        }
    }

    // Открытие карточки преподавателя (без изменений, как в предыдущей версии)
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

            modalTitle.textContent = profile.teacher_name || 'Преподаватель';

            modalContent.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-item"><div class="stat-value">${lessons}</div><div class="stat-label">уроков</div></div>
                    <div class="stat-item"><div class="stat-value">${students}</div><div class="stat-label">учеников</div></div>
                    <div class="stat-item"><div class="stat-value">${payments.length}</div><div class="stat-label">платежей</div></div>
                </div>
                <h3>Редактирование</h3>
                <form id="editForm">
                    <div class="form-grid">
                        <div class="form-group"><label>Имя</label><input id="editName" value="${profile.teacher_name || ''}"></div>
                        <div class="form-group"><label>Email</label><input id="editEmail" value="${profile.email}"></div>
                        <div class="form-group"><label>Пароль</label><input id="editPassword" placeholder="Новый пароль"></div>
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

            document.getElementById('editForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const newPass = document.getElementById('editPassword').value;
                const updates = {
                    teacher_name: document.getElementById('editName').value,
                    email: document.getElementById('editEmail').value,
                    subscription_plan: document.getElementById('editPlan').value,
                    access_until: document.getElementById('editAccess').value,
                    activity_status: document.getElementById('editStatus').value
                };
                await supabase.from('teacher_profiles').update(updates).eq('id', teacherId);
                if (newPass) {
                    // Обновление пароля через встроенную функцию Supabase
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

    // ========== НОВОЕ: ДОБАВЛЕНИЕ УЧИТЕЛЯ ЧЕРЕЗ SIGNUP ==========
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
            // 1. Регистрируем пользователя через Supabase Auth
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { teacher_name: name }
                }
            });

            if (signUpError) throw signUpError;

            const userId = signUpData.user?.id;
            if (!userId) throw new Error('Не удалось получить ID пользователя');

            // 2. Добавляем запись в teacher_profiles
            const accessDateObj = accessDate ? new Date(accessDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
            
            // 2. Добавляем или обновляем запись в teacher_profiles
const { error: profileError } = await supabase
.from('teacher_profiles')
.upsert({
    id: userId,
    email: email,
    teacher_name: name,
    subscription_plan: plan,
    plain_password: password,
    access_until: accessDateObj.toISOString(),
    activity_status: status
}, { onConflict: 'id' });

            if (profileError) throw profileError;

            // Успех
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
        const { error } = await supabase.from('announcements').insert({ title, content, scheduled_date: scheduled, is_published: false });
        if (error) {
            announceMsg.innerHTML = `<span style="color:#d32f2f;">Ошибка: ${error.message}</span>`;
        } else {
            announceMsg.innerHTML = '<span style="color:#2C4C3B;">✓ Уведомление создано</span>';
            announceForm.reset();
            loadAnnouncements();
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



    



})();