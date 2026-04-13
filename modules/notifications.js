// modules/notifications.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

let unreadCount = 0;

// ==================== ИНИЦИАЛИЗАЦИЯ КОЛОКОЛЬЧИКА ====================
export async function initNotifications() {
    await updateUnreadCount();
    bindBellClick();
    // Периодическая проверка новых уведомлений (каждые 2 минуты)
    setInterval(updateUnreadCount, 120000);
}

async function updateUnreadCount() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('teacher_id', user.id)
            .eq('is_read', false);

        if (error) {
            console.error('Ошибка подсчёта уведомлений:', error);
            return;
        }

        unreadCount = count || 0;
        const badge = document.getElementById('unreadBadge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function bindBellClick() {
    const bell = document.getElementById('notificationsBell');
    if (!bell) return;

    bell.addEventListener('click', openNotificationsModal);
}

// ==================== МОДАЛЬНОЕ ОКНО УВЕДОМЛЕНИЙ ====================
async function openNotificationsModal() {
    // Удаляем старое окно, если есть
    document.querySelector('.modal.notifications-modal')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal notifications-modal';
    modal.innerHTML = `
        <div class="modal-card">
            <div class="modal-header">
                <h2><i class="fas fa-bell"></i> Уведомления</h2>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body" id="notificationsList">
                <p style="text-align: center; padding: 2rem;">Загрузка...</p>
            </div>
            <div class="notification-actions">
                <button class="btn btn-sm btn-secondary" id="markAllReadBtn">Отметить все прочитанными</button>
                <button class="btn btn-sm btn-danger" id="clearAllBtn">Очистить все</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Загружаем уведомления
    await loadNotifications();

    // Закрытие
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Кнопки
    modal.querySelector('#markAllReadBtn').addEventListener('click', markAllAsRead);
    modal.querySelector('#clearAllBtn').addEventListener('click', clearAllNotifications);
}

async function loadNotifications() {
    const container = document.getElementById('notificationsList');
    if (!container) return;

    try {
        const user = getCurrentUser();
        if (!user) throw new Error('Не авторизован');

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('teacher_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--text-muted);">Нет уведомлений</p>';
            return;
        }

        container.innerHTML = data.map(n => `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notification-icon">
                    <i class="fas ${getIconForType(n.type)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${escapeHtml(n.title)}</div>
                    <div class="notification-text">${escapeHtml(n.content)}</div>
                    <div class="notification-time">${formatTime(n.created_at)}</div>
                </div>
            </div>
        `).join('');

        // При клике на уведомление — помечаем прочитанным
        container.querySelectorAll('.notification-item').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.dataset.id;
                await supabase.from('notifications').update({ is_read: true }).eq('id', id);
                el.classList.remove('unread');
                await updateUnreadCount();
            });
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<p style="color: #d32f2f; text-align: center;">Ошибка загрузки</p>';
    }
}

function getIconForType(type) {
    switch (type) {
        case 'birthday': return 'fa-birthday-cake';
        case 'payment': return 'fa-credit-card';
        case 'lesson': return 'fa-calendar-check';
        case 'system': return 'fa-info-circle';
        default: return 'fa-bell';
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function markAllAsRead() {
    const user = getCurrentUser();
    if (!user) return;
    
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('teacher_id', user.id)
        .eq('is_read', false);
    
    if (error) {
        console.error('Ошибка:', error);
        return;
    }
    
    // Визуальный отклик — показываем сообщение на 2 секунды
    const container = document.getElementById('notificationsList');
    const originalHtml = container.innerHTML;
    container.innerHTML = '<p style="text-align: center; padding: 2rem; color: #2C4C3B;"><i class="fas fa-check-circle"></i> Все уведомления отмечены прочитанными</p>';
    
    setTimeout(async () => {
        await loadNotifications();
    }, 1000);
    
    await updateUnreadCount();
}

async function clearAllNotifications() {
    if (!confirm('Удалить все уведомления?')) return;
    const user = getCurrentUser();
    if (!user) return;
    await supabase.from('notifications').delete().eq('teacher_id', user.id);
    document.querySelector('.modal.notifications-modal')?.remove();
    await updateUnreadCount();
}