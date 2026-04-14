// admin_modules/admin-chats.js
// Чаты с преподавателями: список, сообщения, отправка, удаление, архив.

import { showLoader, hideLoader, formatDateTime } from './admin-ui.js';

let supabase = null;
let selectedChatId = null;      // ID выбранного чата
let adminId = null;             // UUID админа
let showArchivedChats = false;  // Показывать архивные чаты

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initChatsModule(supabaseClient) {
    supabase = supabaseClient;
    
    // Привязываем кнопки
    document.getElementById('toggleArchiveFilterBtn')?.addEventListener('click', toggleArchiveFilter);
    
    // Загружаем список чатов при открытии вкладки
    const observer = new MutationObserver(() => {
        if (document.getElementById('chatsTab')?.classList.contains('active')) {
            initializeChats();
        }
    });
    observer.observe(document.getElementById('chatsTab'), { 
        attributes: true, 
        attributeFilter: ['class'] 
    });
}

async function initializeChats() {
    // Получаем UUID админа
    const adminData = JSON.parse(localStorage.getItem('adminAuth'));
    if (adminData?.email) {
        const { data } = await supabase
            .from('platform_admins')
            .select('id')
            .eq('email', adminData.email)
            .single();
        adminId = data?.id || null;
    }
    
    await loadChatsList();
    updateUnreadBadge();
    
    // Подписываемся на новые сообщения (realtime)
    supabase
        .channel('admin-chats')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages'
        }, async (payload) => {
            const msg = payload.new;
            
            // Если это сообщение в выбранный чат — добавляем на экран
            if (selectedChatId && msg.chat_id === selectedChatId) {
                const container = document.getElementById('adminChatMessages');
                appendMessageToContainer(msg, container);
                
                // Отмечаем прочитанным, если от учителя
                if (msg.sender_type === 'teacher') {
                    await supabase.from('chat_messages')
                        .update({ is_read: true })
                        .eq('id', msg.id);
                }
            }
            
            // Обновляем список чатов и счётчик
            await loadChatsList();
            updateUnreadBadge();
        })
        .subscribe();
}

// ==================== СПИСОК ЧАТОВ ====================
async function loadChatsList() {
    const container = document.getElementById('chatsListContainer');
    if (!container) return;

    let query = supabase
        .from('chats')
        .select(`
            *,
            teacher_profiles(teacher_name, email),
            chat_messages(message, created_at, sender_type, is_read)
        `)
        .order('updated_at', { ascending: false });

    // Фильтр по статусу (архив / открытые)
    if (!showArchivedChats) {
        query = query.eq('status', 'open');
    }

    const { data: chats } = await query;

    if (!chats?.length) {
        container.innerHTML = '<p style="padding: 1rem; color: var(--text-muted);">Нет чатов</p>';
        return;
    }

    container.innerHTML = chats.map(chat => {
        // Последнее сообщение
        const messages = chat.chat_messages || [];
        const lastMsg = messages.sort((a, b) => 
            new Date(b.created_at) - new Date(a.created_at)
        )[0];
        
        // Есть ли непрочитанные от учителя
        const hasUnread = messages.some(m => 
            m.sender_type === 'teacher' && !m.is_read
        );

        return `
            <div class="chat-item ${hasUnread ? 'unread' : ''}" 
                 data-chat-id="${chat.id}" 
                 style="padding: 1rem; border-bottom: 1px solid var(--neutral-gray); cursor: pointer; ${hasUnread ? 'background: var(--primary-soft);' : ''}">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${chat.teacher_profiles?.teacher_name || 'Без имени'}</strong>
                    <span>${chat.status === 'open' ? '🟢' : '🔴'}</span>
                </div>
                <p style="font-size: 0.85rem; margin: 0.25rem 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${lastMsg?.message || 'Нет сообщений'}
                </p>
                <small>${chat.teacher_profiles?.email || ''}</small>
            </div>
        `;
    }).join('');

    // Привязываем выбор чата
    container.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => selectChat(el.dataset.chatId));
    });
}

// ==================== ВЫБОР ЧАТА ====================
async function selectChat(chatId) {
    selectedChatId = chatId;
    
    // Подсветка активного
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');
    
    // Показываем поле ввода
    document.getElementById('adminChatInput').style.display = 'block';
    
    await loadChatMessages(chatId);
}

async function loadChatMessages(chatId) {
    // Загружаем данные чата
    const { data: chat } = await supabase
        .from('chats')
        .select('*, teacher_profiles(teacher_name, email)')
        .eq('id', chatId)
        .single();

    // Загружаем сообщения
    const { data: messages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    // Рендерим заголовок
    document.getElementById('adminChatHeader').innerHTML = `
        <div style="display: flex; justify-content: space-between;">
            <div>
                <h3 style="margin:0;">${chat.teacher_profiles?.teacher_name || '—'}</h3>
                <p style="margin:0; font-size:0.9rem;">${chat.teacher_profiles?.email || ''}</p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-sm ${chat.status === 'open' ? 'btn-warning' : 'btn-success'}" id="toggleChatStatusBtn">
                    ${chat.status === 'open' ? 'Закрыть' : 'Открыть'}
                </button>
                <button class="btn btn-sm btn-danger" id="deleteChatBtn">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        </div>
    `;

    // Рендерим сообщения
    const container = document.getElementById('adminChatMessages');
    container.innerHTML = '';
    (messages || []).forEach(msg => appendMessageToContainer(msg, container));
    container.scrollTop = container.scrollHeight;

    // Отмечаем сообщения учителя прочитанными
    const unreadTeacherMessages = (messages || [])
        .filter(m => m.sender_type === 'teacher' && !m.is_read);
    
    for (const msg of unreadTeacherMessages) {
        await supabase.from('chat_messages')
            .update({ is_read: true })
            .eq('id', msg.id);
    }
    
    updateUnreadBadge();

    // Обработчик смены статуса (открыть/закрыть)
    document.getElementById('toggleChatStatusBtn')?.addEventListener('click', async () => {
        const newStatus = chat.status === 'open' ? 'closed' : 'open';
        await supabase.from('chats').update({ status: newStatus }).eq('id', chatId);
        selectChat(chatId);
        loadChatsList();
    });

    // Обработчик удаления чата
document.getElementById('deleteChatBtn')?.addEventListener('click', async () => {
    if (!confirm('УДАЛИТЬ ЧАТ ПОЛНОСТЬЮ?\n\nЭто действие нельзя отменить. Все сообщения будут потеряны.')) return;
    
    console.log('Удаляем чат:', chatId);
    
    // 1. Удаляем ВСЕ сообщения этого чата
    const { error: msgError } = await supabase
        .from('chat_messages')
        .delete()
        .eq('chat_id', chatId);
    
    if (msgError) {
        console.error('Ошибка удаления сообщений:', msgError);
        alert('Не удалось удалить сообщения: ' + msgError.message);
        return;
    }
    
    // 2. Удаляем сам чат
    const { error: chatError } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);
    
    if (chatError) {
        console.error('Ошибка удаления чата:', chatError);
        alert('Не удалось удалить чат: ' + chatError.message);
        return;
    }
    
    console.log('Чат и все сообщения удалены');
    
    // 3. Очищаем правую панель
    selectedChatId = null;
    document.getElementById('adminChatHeader').innerHTML = '<p style="color: var(--text-muted); margin: 0;">Выберите чат слева</p>';
    document.getElementById('adminChatMessages').innerHTML = '<p style="text-align: center; color: var(--text-muted); margin-top: 2rem;">👈 Выберите диалог</p>';
    document.getElementById('adminChatInput').style.display = 'none';
    
    // 4. Обновляем список чатов
    await loadChatsList();
    updateUnreadBadge();
    
    alert('Чат удалён');
});

    // Настраиваем отправку сообщения
    setupMessageInput(chatId);
}

// ==================== ОТПРАВКА СООБЩЕНИЯ ====================
function setupMessageInput(chatId) {
    const sendBtn = document.getElementById('sendAdminMessageBtn');
    const input = document.getElementById('adminMessageInput');
    
    // Убираем старые обработчики
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
        if (e.key === 'Enter') {
            e.preventDefault();
            newSendBtn.click();
        }
    };
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function appendMessageToContainer(msg, container) {
    const isAdmin = msg.sender_type === 'admin';
    
    const div = document.createElement('div');
    div.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: ${isAdmin ? 'flex-end' : 'flex-start'};
        margin-bottom: 0.5rem;
    `;
    
    div.innerHTML = `
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
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
            <small style="color: var(--text-muted); font-size: 0.7rem;">
                ${formatTime(msg.created_at)}
            </small>
            <button class="btn-icon delete-message-btn" data-msg-id="${msg.id}" style="font-size: 0.7rem; padding: 2px 4px;" title="Удалить сообщение">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
    
    // 👇 ОБРАБОТЧИК УДАЛЕНИЯ СООБЩЕНИЯ
    const deleteBtn = div.querySelector('.delete-message-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation(); // чтобы не всплывало
            
            if (!confirm('Удалить это сообщение?')) return;
            
            const msgId = deleteBtn.dataset.msgId;
            console.log('Удаляем сообщение:', msgId);
            
            const { error } = await supabase
                .from('chat_messages')
                .delete()
                .eq('id', msgId);
            
            if (error) {
                console.error('Ошибка удаления сообщения:', error);
                alert('Не удалось удалить сообщение: ' + error.message);
                return;
            }
            
            // Удаляем элемент из DOM
            div.remove();
            
            // Обновляем список чатов (меняется последнее сообщение)
            loadChatsList();
            
            console.log('Сообщение удалено');
        });
    }
    
    container.appendChild(div);
}

// Форматирование времени (добавь если нет)
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

async function updateUnreadBadge() {
    const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_type', 'teacher')
        .eq('is_read', false);

    const badge = document.getElementById('adminUnreadChatsBadge');
    if (!badge) return;
    
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function toggleArchiveFilter() {
    showArchivedChats = !showArchivedChats;
    document.getElementById('toggleArchiveFilterBtn').textContent = 
        showArchivedChats ? 'Открытые' : 'Архив';
    loadChatsList();
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Экспортируем для вызова извне
export { loadChatsList, updateUnreadBadge };