// modules/chat.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export function initSupportChat() {
    bindChatButton();
}

function bindChatButton() {
    document.getElementById('supportChatBtn')?.addEventListener('click', openChatModal);
}

// ==================== ОКНО ЧАТА ====================
async function openChatModal() {
    // Закрываем уже открытое окно
    document.querySelector('.modal.chat-modal')?.remove();

    const user = getCurrentUser();
    if (!user) return;

    // Получаем или создаём чат
    const chat = await getOrCreateChat();

    // Создаём окно
    const modal = document.createElement('div');
    modal.className = 'modal chat-modal';
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 500px; height: 600px; display: flex; flex-direction: column;">
            <div class="modal-header">
                <h2><i class="fas fa-headset"></i> Чат с поддержкой</h2>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-icon" id="refreshChatBtn" title="Обновить">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="close-modal">&times;</button>
                </div>
            </div>
            <div class="chat-messages" id="chatMessagesContainer" style="flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
                <p style="text-align: center; color: var(--text-muted);">Загрузка...</p>
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
    const refreshBtn = modal.querySelector('#refreshChatBtn');

    // Функция загрузки сообщений из базы
    async function refreshMessages() {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Загрузка...</p>';
        
        const { data: messages } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: true });

        container.innerHTML = '';
        
        if (!messages?.length) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">Нет сообщений</p>';
            return;
        }

        messages.forEach(msg => {
            const isOwn = msg.sender_type === 'teacher';
            appendMessage(msg, container, isOwn);
        });
        
        container.scrollTop = container.scrollHeight;
    }

    // Загружаем сообщения при открытии
    await refreshMessages();

    // Кнопка обновления
    refreshBtn.addEventListener('click', refreshMessages);

    // Отправка сообщения
    async function sendMessage() {
        const message = input.value.trim();
        if (!message) return;

        // Сохраняем в базу
        const { data: newMsg, error } = await supabase
            .from('chat_messages')
            .insert({
                chat_id: chat.id,
                sender_type: 'teacher',
                sender_id: user.id,
                message,
                is_read: false
            })
            .select('*')
            .single();

        if (error) {
            alert('Ошибка отправки');
            return;
        }

        // Очищаем поле
        input.value = '';

        // Добавляем сообщение на экран
        appendMessage(newMsg, container, true);
        container.scrollTop = container.scrollHeight;
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Закрытие чата
    function closeChat() {
        modal.remove();
    }

    modal.querySelector('.close-modal').addEventListener('click', closeChat);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeChat();
    });
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
async function getOrCreateChat() {
    const user = getCurrentUser();
    
    // Ищем открытый чат
    let { data: chat } = await supabase
        .from('chats')
        .select('*')
        .eq('teacher_id', user.id)
        .eq('status', 'open')
        .maybeSingle();

    // Если нет — создаём
    if (!chat) {
        const { data: newChat } = await supabase
            .from('chats')
            .insert({ teacher_id: user.id, status: 'open' })
            .select('*')
            .single();
        chat = newChat;
    }
    
    return chat;
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
    time.textContent = new Date(msg.created_at).toLocaleTimeString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });

    div.appendChild(bubble);
    div.appendChild(time);
    container.appendChild(div);
}