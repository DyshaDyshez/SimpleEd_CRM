// modules/chat.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

let currentChatId = null;
let unreadCount = 0;

export function initSupportChat() {
    bindChatButton();
    checkUnreadMessages();
    setInterval(checkUnreadMessages, 30000);
}

function bindChatButton() {
    document.getElementById('supportChatBtn')?.addEventListener('click', openChatModal);
}

async function checkUnreadMessages() {
    const user = getCurrentUser();
    if (!user) return;

    const { data: chats } = await supabase
        .from('chats')
        .select('id')
        .eq('teacher_id', user.id)
        .eq('status', 'open');

    if (!chats?.length) return;

    const chatIds = chats.map(c => c.id);
    const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .in('chat_id', chatIds)
        .eq('sender_type', 'admin')
        .eq('is_read', false);

    unreadCount = count || 0;
    updateUnreadBadge();
}

function updateUnreadBadge() {
    const badge = document.getElementById('unreadMessagesBadge');
    if (!badge) return;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

async function openChatModal() {
    document.querySelector('.modal.chat-modal')?.remove();

    const user = getCurrentUser();
    if (!user) return;

    let chat = await getOrCreateChat();

    const modal = document.createElement('div');
    modal.className = 'modal chat-modal';
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 500px; height: 600px; display: flex; flex-direction: column;">
            <div class="modal-header">
                <h2><i class="fas fa-headset"></i> Чат с поддержкой</h2>
                <button class="close-modal">&times;</button>
            </div>
            <div class="chat-messages" id="chatMessagesContainer" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="text-align: center; color: var(--text-muted);">Загрузка сообщений...</p>
            </div>
            <div class="chat-input" style="padding: 1rem; border-top: 1px solid var(--neutral-gray); display: flex; gap: 0.5rem;">
                <input type="text" id="chatMessageInput" placeholder="Напишите сообщение..." style="flex: 1; padding: 0.75rem; border: 1px solid var(--neutral-gray); border-radius: 8px;">
                <button class="btn btn-primary" id="sendMessageBtn" style="padding: 0.75rem 1.25rem;">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const container = modal.querySelector('#chatMessagesContainer');
    const input = modal.querySelector('#chatMessageInput');
    const sendBtn = modal.querySelector('#sendMessageBtn');

    await loadMessages(chat.id, container);

    // Отмечаем все сообщения админа как прочитанные
    const { data: adminMessages } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('chat_id', chat.id)
        .eq('sender_type', 'admin')
        .eq('is_read', false);

    if (adminMessages?.length) {
        await supabase
            .from('chat_messages')
            .update({ is_read: true })
            .in('id', adminMessages.map(m => m.id));
    }
    await checkUnreadMessages();

    // Realtime подписка
    const subscription = supabase
        .channel(`chat-${chat.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `chat_id=eq.${chat.id}`
        }, async (payload) => {
            const msg = payload.new;
            const isOwn = msg.sender_type === 'teacher';
            appendMessage(msg, container, isOwn);
            
            if (msg.sender_type === 'admin') {
                await supabase.from('chat_messages').update({ is_read: true }).eq('id', msg.id);
                await checkUnreadMessages();
            }
        })
        .subscribe();

    // Внутри openChatModal, замени функцию sendMessage:
    async function sendMessage() {
        const message = input.value.trim();
        if (!message) return;
    
        // Отправляем сообщение в Supabase
        const { error } = await supabase
            .from('chat_messages')
            .insert({
                chat_id: chat.id,
                sender_type: 'teacher',
                sender_id: user.id,
                message
            });
    
        if (error) {
            console.error('Ошибка отправки:', error);
            return;
        }
    
        // Очищаем поле ввода
        input.value = '';
        
        // 🔥 НЕ добавляем сообщение вручную — это сделает Realtime подписка!
        // Сообщение появится автоматически через подписку.
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    modal.querySelector('.close-modal').addEventListener('click', () => {
        subscription.unsubscribe();
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            subscription.unsubscribe();
            modal.remove();
        }
    });
}

async function getOrCreateChat() {
    const user = getCurrentUser();
    let { data: chat } = await supabase
        .from('chats')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('status', 'open')
        .maybeSingle();

    if (!chat) {
        const { data: newChat } = await supabase
            .from('chats')
            .insert({ teacher_id: user.id })
            .select('*')
            .single();
        chat = newChat;
    }
    currentChatId = chat.id;
    return chat;
}

async function loadMessages(chatId, container) {
    const { data: messages } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

    container.innerHTML = '';
    const user = getCurrentUser();
    (messages || []).forEach(msg => {
        appendMessage(msg, container, user.id === msg.sender_id);
    });
    container.scrollTop = container.scrollHeight;
}

function appendMessage(msg, container, isOwn) {
    const div = document.createElement('div');
    div.style.cssText = `
        display: flex;
        flex-direction: column;
        align-self: ${isOwn ? 'flex-end' : 'flex-start'};
        max-width: 80%;
    `;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
        background: ${isOwn ? 'var(--primary-warm)' : 'var(--neutral-light)'};
        color: ${isOwn ? 'white' : 'var(--text-primary)'};
        padding: 0.75rem 1rem;
        border-radius: 12px;
        border-bottom-right-radius: ${isOwn ? '4px' : '12px'};
        border-bottom-left-radius: ${isOwn ? '12px' : '4px'};
        word-wrap: break-word;
    `;
    bubble.textContent = msg.message;

    const time = document.createElement('small');
    time.style.cssText = `
        color: var(--text-muted);
        font-size: 0.7rem;
        margin-top: 0.25rem;
        align-self: ${isOwn ? 'flex-end' : 'flex-start'};
    `;
    time.textContent = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    div.appendChild(bubble);
    div.appendChild(time);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}