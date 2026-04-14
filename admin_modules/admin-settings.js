// admin_modules/admin-settings.js
// Настройки: тарифы, уведомления, экспорт

import { showLoader, hideLoader } from './admin-ui.js';

let supabase = null;

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initSettingsModule(supabaseClient) {
    supabase = supabaseClient;
    
    // Загружаем данные при открытии вкладки
    const observer = new MutationObserver(() => {
        if (document.getElementById('settingsTab')?.classList.contains('active')) {
            loadTariffs();
            loadAnnouncements();
        }
    });
    observer.observe(document.getElementById('settingsTab'), { 
        attributes: true, 
        attributeFilter: ['class'] 
    });
    
    // Привязываем события
    bindSettingsEvents();
}

function bindSettingsEvents() {
    document.getElementById('addTariffBtn')?.addEventListener('click', addTariff);
    document.getElementById('resetTariffsBtn')?.addEventListener('click', resetTariffs);
    document.getElementById('newAnnouncementForm')?.addEventListener('submit', createAnnouncement);
    document.getElementById('exportTeachersBtn')?.addEventListener('click', exportTeachers);
    document.getElementById('exportPaymentsBtn')?.addEventListener('click', exportPayments);
}

// ==================== ТАРИФЫ ====================
async function loadTariffs() {
    const tbody = document.getElementById('tariffsTableBody');
    if (!tbody) return;

    const { data, error } = await supabase.from('tariffs').select('*').order('price');
    
    if (error) {
        tbody.innerHTML = '<tr><td colspan="5">Ошибка загрузки</td></tr>';
        return;
    }
    
    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="5">Нет тарифов</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(t => `
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
            
            await supabase.from('tariffs').update({ name, price, duration_days: duration, features }).eq('id', id);
            loadTariffs();
        });
    });

    document.querySelectorAll('.delete-tariff').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Удалить тариф?')) return;
            await supabase.from('tariffs').delete().eq('id', btn.dataset.id);
            loadTariffs();
        });
    });
}

async function addTariff() {
    const name = prompt('Название тарифа (например, "premium"):');
    if (!name) return;
    const price = prompt('Цена (₽):', '1990');
    const duration = prompt('Длительность (дней):', '30');
    const features = prompt('Возможности (описание):', '');
    
    await supabase.from('tariffs').insert({ 
        name, 
        price: Number(price), 
        duration_days: Number(duration), 
        features 
    });
    loadTariffs();
}

async function resetTariffs() {
    if (!confirm('Сбросить тарифы до стандартных?')) return;
    
    await supabase.from('tariffs').delete().neq('name', '');
    
    const defaults = [
        { name: 'trial', price: 0, duration_days: 14, features: 'Базовый функционал' },
        { name: 'pro', price: 2990, duration_days: 30, features: 'Расширенные возможности' },
        { name: 'vip', price: 5990, duration_days: 30, features: 'Максимальный пакет' }
    ];
    
    await supabase.from('tariffs').insert(defaults);
    loadTariffs();
}

// ==================== УВЕДОМЛЕНИЯ ====================
async function loadAnnouncements() {
    const tbody = document.getElementById('announcementsTableBody');
    if (!tbody) return;

    const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('scheduled_date', { ascending: true });

    if (error) {
        tbody.innerHTML = '<tr><td colspan="4">Ошибка</td></tr>';
        return;
    }
    
    if (!data?.length) {
        tbody.innerHTML = '<tr><td colspan="4">Нет уведомлений</td></tr>';
        return;
    }

    const today = new Date().toISOString().slice(0, 10);
    
    tbody.innerHTML = data.map(a => {
        const isPublished = a.is_published;
        const isFuture = a.scheduled_date > today;
        const status = isPublished ? '✅ Опубликовано' : (isFuture ? '⏳ Запланировано' : '⚠️ Просрочено');
        
        return `
            <tr>
                <td>${a.title}</td>
                <td>${new Date(a.scheduled_date).toLocaleDateString('ru-RU')}</td>
                <td>${status}</td>
                <td>
                    ${!isPublished ? `<button class="btn-icon publish-announce" data-id="${a.id}"><i class="fas fa-check-circle"></i></button>` : ''}
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

async function createAnnouncement(e) {
    e.preventDefault();
    
    const title = document.getElementById('announceTitle').value.trim();
    const content = document.getElementById('announceContent').value.trim();
    const scheduled = document.getElementById('announceDate').value;
    const msgDiv = document.getElementById('announceFormMessage');
    
    if (!title || !content || !scheduled) {
        msgDiv.innerHTML = '<span style="color:#d32f2f;">Заполните все поля</span>';
        return;
    }

    // Сохраняем объявление
    await supabase.from('announcements').insert({ 
        title, content, scheduled_date: scheduled, is_published: true 
    });

    // Получаем активных преподавателей
    const { data: teachers } = await supabase
        .from('teacher_profiles')
        .select('id')
        .eq('activity_status', 'active');

    // Рассылаем уведомления
    if (teachers?.length) {
        const notifications = teachers.map(t => ({
            teacher_id: t.id,
            type: 'announcement',
            title: title,
            content: content,
            is_read: false,
            created_at: new Date().toISOString()
        }));
        await supabase.from('notifications').insert(notifications);
    }

    msgDiv.innerHTML = '<span style="color:#2C4C3B;">✓ Уведомление отправлено</span>';
    document.getElementById('newAnnouncementForm').reset();
    loadAnnouncements();
}

// ==================== ЭКСПОРТ ====================
async function exportTeachers() {
    const { data } = await supabase.from('teacher_profiles').select('*');
    if (!data?.length) { alert('Нет данных'); return; }
    
    const csv = [
        ['Имя', 'Email', 'Тариф', 'Доступ до', 'Статус'].join(','),
        ...data.map(t => [
            t.teacher_name || '', 
            t.email, 
            t.subscription_plan, 
            t.access_until || '', 
            t.activity_status
        ].join(','))
    ].join('\n');
    
    downloadCSV(csv, `teachers_${new Date().toISOString().slice(0,10)}.csv`);
}

async function exportPayments() {
    const { data } = await supabase
        .from('teacher_payments')
        .select('*, teacher_profiles(teacher_name, email)');
        
    if (!data?.length) { alert('Нет данных'); return; }
    
    const csv = [
        ['Дата', 'Преподаватель', 'Email', 'Сумма', 'Оплачено до', 'Заметка'].join(','),
        ...data.map(p => [
            p.payment_date,
            p.teacher_profiles?.teacher_name || '',
            p.teacher_profiles?.email || '',
            p.amount,
            p.paid_until,
            p.notes || ''
        ].join(','))
    ].join('\n');
    
    downloadCSV(csv, `payments_${new Date().toISOString().slice(0,10)}.csv`);
}

function downloadCSV(csv, filename) {
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}