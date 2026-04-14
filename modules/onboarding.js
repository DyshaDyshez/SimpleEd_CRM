// modules/onboarding.js
import { getCurrentUser } from './auth.js';
import supabase from './supabaseClient.js';

let tour;

// ==================== ЗАПУСК ТУРА ====================
export function startOnboarding() {
    if (tour && tour.isActive()) return;
    if (typeof Shepherd === 'undefined') {
        console.error('Shepherd не загружен');
        return;
    }

    tour = new Shepherd.Tour({
        useModalOverlay: true,
        defaultStepOptions: {
            classes: 'shepherd-theme-custom',
            scrollTo: true,
            cancelIcon: { enabled: true }
        }
    });

    // Шаг 1: Приветствие
    tour.addStep({
        id: 'welcome',
        text: `
            <h3>👋 Добро пожаловать в SimpleEd CRM!</h3>
            <p>Я проведу тебя по основным разделам системы. Это займёт 3 минуты.</p>
            <p><small>Можешь закрыть тур в любой момент и вернуться позже через кнопку «Помощь».</small></p>
        `,
        buttons: [
            { text: 'Пропустить', action: () => tour.cancel() },
            { text: 'Начнём!', action: () => tour.next() }
        ]
    });

    // Шаг 2: Главная страница
    tour.addStep({
        id: 'dashboard',
        text: `
            <h3>📊 Главная страница</h3>
            <p>Это твой дашборд. Здесь ты видишь:</p>
            <ul>
                <li><strong>Статистику</strong> — сколько уроков проведено и заработано</li>
                <li><strong>Ближайшие уроки</strong> — на ближайшую неделю</li>
                <li><strong>Проведённые уроки</strong> — последние занятия</li>
            </ul>
            <p>Кликни на любой урок, чтобы быстро его отредактировать.</p>
        `,
        attachTo: { element: '.dashboard-grid', on: 'bottom' },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 3: Переход к ученикам
    tour.addStep({
        id: 'goto-students',
        text: `
            <h3>👥 Ученики</h3>
            <p>Давай посмотрим раздел с учениками. Это основа CRM.</p>
            <p>Нажми «Далее», и я переведу тебя туда.</p>
        `,
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { 
                text: 'К ученикам', 
                action: () => {
                    document.querySelector('[data-page="students"]')?.click();
                    setTimeout(() => tour.next(), 500);
                }
            }
        ]
    });

    // Шаг 4: Таблица учеников
    tour.addStep({
        id: 'students-table',
        text: `
            <h3>📋 Таблица учеников</h3>
            <p>Здесь список всех твоих учеников:</p>
            <ul>
                <li><strong>➕ Добавить ученика</strong> — создать новую карточку</li>
                <li><strong>👁️ Открыть</strong> — посмотреть полную информацию</li>
                <li><strong>✏️ Редактировать</strong> — изменить данные</li>
                <li><strong>🗑️ Удалить</strong> — убрать из системы</li>
            </ul>
            <p>Попробуй добавить своего первого ученика после тура.</p>
        `,
        attachTo: { element: '.table-responsive', on: 'top' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="students"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 300));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 5: Карточка ученика
    tour.addStep({
        id: 'student-card',
        text: `
            <h3>🎓 Карточка ученика</h3>
            <p>Когда откроешь ученика, увидишь 4 вкладки:</p>
            <ul>
                <li><strong>Информация</strong> — контакты, группа, заметки</li>
                <li><strong>Оплаты</strong> — история платежей и баланс уроков</li>
                <li><strong>Уроки</strong> — все занятия с учеником</li>
                <li><strong>Отчёт</strong> — генерация отчёта для родителя (можно с ИИ!)</li>
            </ul>
            <p>Это сердце системы — вся история ученика в одном месте.</p>
        `,
        attachTo: { element: '.table-responsive', on: 'bottom' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="students"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 300));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 6: Переход к расписанию
    tour.addStep({
        id: 'goto-schedule',
        text: `
            <h3>📅 Расписание</h3>
            <p>Теперь посмотрим календарь уроков.</p>
        `,
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { 
                text: 'К расписанию', 
                action: () => {
                    document.querySelector('[data-page="schedule"]')?.click();
                    setTimeout(() => tour.next(), 800);
                }
            }
        ]
    });

    // Шаг 7: Календарь
    tour.addStep({
        id: 'schedule',
        text: `
            <h3>🗓️ Календарь уроков</h3>
            <p>Здесь всё твоё расписание:</p>
            <ul>
                <li><strong>Кликни на день</strong> — создать новый урок</li>
                <li><strong>Кликни на урок</strong> — редактировать (тема, статус, заметки)</li>
                <li><strong>Перетаскивай</strong> — чтобы перенести занятие</li>
                <li><strong>Цвета</strong> — показывают статус:
                    <br>🟡 запланирован | 🟢 проведён | 🔴 отменён
                </li>
            </ul>
        `,
        attachTo: { element: '#calendar', on: 'top' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="schedule"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 500));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 8: Переход к финансам
    tour.addStep({
        id: 'goto-finance',
        text: `
            <h3>💰 Финансы</h3>
            <p>Давай глянем, как учитывать оплаты.</p>
        `,
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { 
                text: 'К финансам', 
                action: () => {
                    document.querySelector('[data-page="finance"]')?.click();
                    setTimeout(() => tour.next(), 500);
                }
            }
        ]
    });

    // Шаг 9: Страница финансов
    tour.addStep({
        id: 'finance',
        text: `
            <h3>💳 Учёт оплат</h3>
            <p>На этой странице:</p>
            <ul>
                <li><strong>Сводка</strong> — общая выручка и количество оплат</li>
                <li><strong>Фильтры</strong> — по ученику, группе, дате, статусу</li>
                <li><strong>Таблица</strong> — все платежи с возможностью редактирования</li>
                <li><strong>➕ Добавить платёж</strong> — ручное внесение оплаты</li>
            </ul>
            <p>Также в карточке ученика есть вкладка «Оплаты» с детальной историей.</p>
        `,
        attachTo: { element: '.finance-summary', on: 'bottom' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="finance"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 300));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 10: Переход к заметкам
    tour.addStep({
        id: 'goto-notes',
        text: `
            <h3>📝 Заметки</h3>
            <p>И последний важный раздел — личные заметки.</p>
        `,
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { 
                text: 'К заметкам', 
                action: () => {
                    document.querySelector('[data-page="notes"]')?.click();
                    setTimeout(() => tour.next(), 500);
                }
            }
        ]
    });

    // Шаг 11: Страница заметок
    tour.addStep({
        id: 'notes',
        text: `
            <h3>📋 Личные заметки</h3>
            <p>Здесь ты можешь:</p>
            <ul>
                <li>Создавать заметки с форматированием</li>
                <li>Привязывать заметку к ученику или группе</li>
                <li>Группировать по папкам</li>
                <li>Искать по названию и фильтровать</li>
            </ul>
            <p>Удобно для хранения методических материалов и наблюдений.</p>
        `,
        attachTo: { element: '.notes-container', on: 'top' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="notes"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 300));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 12: Профиль и уведомления
    tour.addStep({
        id: 'profile',
        text: `
            <h3>👤 Профиль и уведомления</h3>
            <p>В правом верхнем углу:</p>
            <ul>
                <li><strong>🔔 Колокольчик</strong> — уведомления от системы и админа</li>
                <li><strong>👤 Аватар</strong> — настройки профиля, экспорт/импорт данных</li>
                <li><strong>🚪 Выйти</strong> — завершить сеанс</li>
            </ul>
        `,
        attachTo: { element: '.user-profile', on: 'bottom' },
        beforeShowPromise: function() {
            document.querySelector('[data-page="dashboard"]')?.click();
            return new Promise(resolve => setTimeout(resolve, 300));
        },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 13: Статистика и все уроки
    tour.addStep({
        id: 'extra',
        text: `
            <h3>📈 Дополнительные разделы</h3>
            <p>В боковом меню ещё есть:</p>
            <ul>
                <li><strong>Статистика</strong> — графики доходов и активности</li>
                <li><strong>Все уроки</strong> — полный журнал всех занятий с фильтрами</li>
            </ul>
            <p>Они помогут анализировать твою работу.</p>
        `,
        attachTo: { element: '.sidebar', on: 'right' },
        buttons: [
            { text: 'Назад', action: () => tour.back() },
            { text: 'Далее', action: () => tour.next() }
        ]
    });

    // Шаг 14: Завершение
    tour.addStep({
        id: 'finish',
        text: `
            <h3>🎉 Ты готов к работе!</h3>
            <p>Теперь ты знаешь основы SimpleEd CRM.</p>
            <p><strong>С чего начать:</strong></p>
            <ol>
                <li>Добавь первого ученика (кнопка «+ Добавить ученика»)</li>
                <li>Создай урок в расписании</li>
                <li>После урока — отметь статус и добавь заметки</li>
            </ol>
            <p>Если будут вопросы — кнопка <strong>«Помощь»</strong> в сайдбаре запустит этот тур снова.</p>
            <p>Удачи и продуктивных уроков! 🚀</p>
        `,
        buttons: [
            { text: 'Завершить', action: () => completeOnboarding() }
        ]
    });

    tour.start();
}

// ==================== ЗАВЕРШЕНИЕ ТУРА ====================
async function completeOnboarding() {
    const user = getCurrentUser();
    if (user) {
        await supabase
            .from('teacher_profiles')
            .update({ onboarding_completed: true })
            .eq('id', user.id);
    }
    tour.complete();
    document.querySelector('[data-page="dashboard"]')?.click();
}

// ==================== ПРОВЕРКА ПЕРВОГО ВХОДА ====================
export async function checkFirstTimeOnboarding() {
    const user = getCurrentUser();
    if (!user) return;

    const { data: profile } = await supabase
        .from('teacher_profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();

    if (!profile?.onboarding_completed) {
        setTimeout(() => startOnboarding(), 1500);
    }
}