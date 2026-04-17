// modules/paymentReminder.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import CONFIG from './config.js';

/**
 * Проверяет, остался ли у ученика 1 оплаченный урок
 * @param {string} studentId - ID ученика
 * @returns {Promise<boolean>}
 */
export async function hasOnlyOneLessonLeft(studentId) {
    const { data: payments, error } = await supabase
        .from('payments')
        .select('lessons_paid, lessons_used')
        .eq('student_id', studentId)
        .eq('status', 'paid');

    if (error || !payments) return false;

    const totalPaid = payments.reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
    const totalUsed = payments.reduce((sum, p) => sum + (p.lessons_used || 0), 0);
    
    return (totalPaid - totalUsed) === 1;
}

/**
 * Получает данные для шаблона напоминания
 * @param {string} studentId - ID ученика
 * @returns {Promise<Object>} данные ученика, статистика, последние темы
 */
export async function getReminderData(studentId) {
    // Данные ученика
    const { data: student } = await supabase
        .from('students')
        .select('child_name, child_age')
        .eq('id', studentId)
        .single();

    // Проведённые уроки (последние 5)
    const { data: completedLessons } = await supabase
        .from('lessons')
        .select('lesson_date, topic')
        .eq('student_id', studentId)
        .eq('status', 'completed')
        .order('lesson_date', { ascending: false })
        .limit(5);

    // Всего проведено уроков
    const { count: totalCompleted } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', studentId)
        .eq('status', 'completed');

    return {
        student,
        completedLessons: completedLessons || [],
        totalCompleted: totalCompleted || 0,
        lastTopics: (completedLessons || []).map(l => l.topic).filter(Boolean)
    };
}

/**
 * Генерирует сообщение через ИИ (Edge Function)
 */
async function generateAIMessage(prompt) {
    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/super-function`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
                student: { child_name: 'ученик' },
                period: { start: '', end: '' },
                stats: { completed: 0, missed: 0 },
                lessons: [],
                notes: prompt
            })
        });
        const data = await response.json();
        return data.recommendations || null;
    } catch (err) {
        console.error('Ошибка генерации:', err);
        return null;
    }
}

/**
 * Открывает модальное окно с напоминанием для родителя
 * @param {string} studentId - ID ученика
 */
export async function openReminderModal(studentId) {
    const data = await getReminderData(studentId);
    const studentName = data.student?.child_name || 'Ученик';
    const totalCompleted = data.totalCompleted;
    const lastTopics = data.lastTopics.slice(0, 3).join(', ') || 'различные темы';

    const modal = document.createElement('div');
    modal.className = 'modal reminder-modal';
    modal.innerHTML = `
        <div class="modal-card" style="max-width: 600px;">
            <div class="modal-header">
                <h3><i class="fas fa-bell"></i> Напоминание для родителя</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p style="margin-bottom: 1rem;">
                    <strong>${studentName}</strong> — остался <span style="color: #d32f2f;">1 оплаченный урок</span>.
                </p>
                
                <div class="form-group">
                    <label>📊 Статистика</label>
                    <div style="background: var(--neutral-light); padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
                        ✅ Проведено уроков: <strong>${totalCompleted}</strong><br>
                        📚 Последние темы: ${lastTopics}
                    </div>
                </div>

                <div class="form-group">
                    <label>📝 Текст сообщения</label>
                    <textarea id="reminderMessage" rows="6" style="width: 100%; padding: 0.75rem; border-radius: 8px; border: 1px solid var(--neutral-gray);">Здравствуйте! У ${studentName} остался 1 оплаченный урок. Мы прошли уже ${totalCompleted} занятий, включая такие темы как ${lastTopics}. Чтобы не прерывать прогресс, предлагаю оплатить следующие уроки. Буду рад(а) продолжить занятия!</textarea>
                </div>

                <div class="form-group">
                    <label>✨ Улучшить с ИИ</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="aiPrompt" placeholder="Например: добавь благодарность за прогресс" style="flex: 1;">
                        <button class="btn btn-sm btn-primary" id="generateAIBtn">
                            <i class="fas fa-robot"></i> Сгенерировать
                        </button>
                    </div>
                </div>

                <div class="form-group">
                    <label>📋 Быстрые вставки</label>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-outline quick-insert" data-text="${studentName}">Имя</button>
                        <button class="btn btn-sm btn-outline quick-insert" data-text="${totalCompleted}">Кол-во уроков</button>
                        <button class="btn btn-sm btn-outline quick-insert" data-text="${lastTopics}">Темы</button>
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-success" id="copyReminderBtn">
                    <i class="fas fa-copy"></i> Копировать
                </button>
                <button class="btn btn-secondary close-modal">Закрыть</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const textarea = modal.querySelector('#reminderMessage');
    const closeModal = () => modal.remove();
    
    modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModal));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Быстрые вставки
    modal.querySelectorAll('.quick-insert').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.dataset.text;
            textarea.value += (textarea.value ? ' ' : '') + text;
        });
    });

    // Генерация через ИИ
    modal.querySelector('#generateAIBtn').addEventListener('click', async () => {
        const prompt = modal.querySelector('#aiPrompt').value.trim();
        if (!prompt) {
            alert('Введите запрос для ИИ');
            return;
        }
        const btn = modal.querySelector('#generateAIBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Генерация...';
        
        const aiMessage = await generateAIMessage(prompt);
        if (aiMessage) {
            textarea.value = aiMessage;
        } else {
            alert('Не удалось сгенерировать сообщение');
        }
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-robot"></i> Сгенерировать';
    });

    // Копирование
    modal.querySelector('#copyReminderBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value);
        alert('Сообщение скопировано!');
    });
}