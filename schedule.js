// @ts-nocheck
// ==========================================
// SIMPLEED CRM — МОДУЛЬ РАСПИСАНИЯ (ИСПРАВЛЕННЫЙ)
// ==========================================

// @ts-nocheck
// ==========================================
// SIMPLEED CRM — МОДУЛЬ РАСПИСАНИЯ
// ==========================================

(function() {
    // Ждём, пока window._supabase и window.currentUser будут доступны
    function waitForSupabase() {
        return new Promise((resolve) => {
            const check = () => {
                if (typeof window._supabase !== 'undefined') {
                    resolve();
                } else {
                    console.log('⏳ Ожидание Supabase...');
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
    
    function waitForUser() {
        return new Promise((resolve) => {
            const check = () => {
                if (window.currentUser) {
                    resolve(window.currentUser);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    let teacherUser = null;
    let calendar = null;
    let studentsList = [];
    let groupsList = [];

    // ===== ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ РАСПИСАНИЯ =====
    window.initSchedulePage = async function() {
        console.log('📅 Инициализация страницы расписания...');
        
        // Дожидаемся Supabase
        await waitForSupabase();
        
        // Дожидаемся currentUser
        if (!window.currentUser) {
            console.log('⏳ Ожидание авторизации...');
            teacherUser = await waitForUser();
        } else {
            teacherUser = window.currentUser;
        }
        
        console.log('✅ Пользователь:', teacherUser.email);
        
        await loadStudentsAndGroups();
        renderCalendar();
        
        const addBtn = document.getElementById('addLessonFromCalendarBtn');
        if (addBtn) {
            const newBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newBtn, addBtn);
            newBtn.addEventListener('click', () => openLessonModal());
        }
    };

    // ... остальной код без изменений (везде используем window._supabase и teacherUser) ...

    // Загрузка учеников и групп для выпадающих списков
    async function loadStudentsAndGroups() {
        try {
            console.log('📥 Загрузка учеников и групп...');
            const [studentsRes, groupsRes] = await Promise.all([
                window._supabase.from('students').select('id, child_name').eq('teacher_id', teacherUser.id).order('child_name'),
                window._supabase.from('student_groups').select('id, group_name').eq('teacher_id', teacherUser.id).order('group_name')
            ]);
            studentsList = studentsRes.data || [];
            groupsList = groupsRes.data || [];
            console.log(`✅ Загружено: ${studentsList.length} учеников, ${groupsList.length} групп`);
        } catch (err) {
            console.error('❌ Ошибка загрузки учеников/групп:', err);
        }
    }

    // Рендеринг календаря
    function renderCalendar() {
        const calendarEl = document.getElementById('calendar');
        if (!calendarEl) {
            console.error('❌ Элемент #calendar не найден');
            return;
        }

        console.log('📅 Рендеринг календаря...');

        // Если календарь уже существует — уничтожаем
        if (calendar) {
            calendar.destroy();
        }

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'timeGridWeek',
            locale: 'ru',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            buttonText: {
                today: 'Сегодня',
                month: 'Месяц',
                week: 'Неделя',
                day: 'День'
            },
            height: 'auto',
            slotMinTime: '08:00:00',
            slotMaxTime: '22:00:00',
            allDaySlot: false,
            nowIndicator: true,
            events: async (fetchInfo, successCallback, failureCallback) => {
                try {
                    console.log('📥 Загрузка уроков для периода:', fetchInfo.start, fetchInfo.end);
                    
                    const { data: lessons, error } = await window._supabase
                        .from('lessons')
                        .select('*, students(child_name), student_groups(group_name)')
                        .eq('teacher_id', teacherUser.id)
                        .gte('lesson_date', fetchInfo.start.toISOString())
                        .lte('lesson_date', fetchInfo.end.toISOString());

                    if (error) throw error;

                    console.log(`✅ Загружено ${lessons.length} уроков`);

                    const events = lessons.map(lesson => {
                        const title = lesson.student_id 
                            ? `${lesson.students?.child_name || 'Ученик'}`
                            : `${lesson.student_groups?.group_name || 'Группа'}`;
                        
                        const startDate = new Date(lesson.lesson_date);
                        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1 час

                        return {
                            id: lesson.id,
                            title: `${title} — ${lesson.topic || 'Без темы'}`,
                            start: startDate,
                            end: endDate,
                            extendedProps: {
                                studentId: lesson.student_id,
                                groupId: lesson.group_id,
                                topic: lesson.topic,
                                homework: lesson.homework,
                                isCompleted: lesson.is_completed
                            },
                            backgroundColor: lesson.is_completed ? '#5B8C6F' : '#D4A373',
                            borderColor: lesson.is_completed ? '#4A6E58' : '#B8835E',
                            textColor: 'white'
                        };
                    });

                    successCallback(events);
                } catch (err) {
                    console.error('❌ Ошибка загрузки уроков:', err);
                    failureCallback(err);
                }
            },
            dateClick: (info) => {
                console.log('📅 Клик по дате:', info.date);
                openLessonModal(null, info.date);
            },
            eventClick: (info) => {
                console.log('🖱️ Клик по событию:', info.event);
                openLessonModal(info.event);
            },
            eventDrop: async (info) => {
                const lessonId = info.event.id;
                const newDate = info.event.start.toISOString();
                console.log('🔄 Перетаскивание урока:', lessonId, 'новая дата:', newDate);
                
                const { error } = await window._supabase
                    .from('lessons')
                    .update({ lesson_date: newDate })
                    .eq('id', lessonId);
                    
                if (error) {
                    console.error('❌ Ошибка обновления даты:', error);
                    info.revert();
                } else {
                    console.log('✅ Дата урока обновлена');
                }
            }
        });

        calendar.render();
        console.log('✅ Календарь отрендерен');
    }

    // Открытие модального окна добавления/редактирования урока
    function openLessonModal(event = null, defaultDate = null) {
        console.log('🪟 Открытие модального окна урока');
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <h2>${event ? 'Редактировать урок' : 'Новый урок'}</h2>
                    <button class="btn-icon close-modal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <form id="lessonForm">
                        <div class="form-group">
                            <label>Тип занятия</label>
                            <select id="lessonType">
                                <option value="student" ${event?.extendedProps?.studentId || !event?.extendedProps?.groupId ? 'selected' : ''}>Индивидуальное</option>
                                <option value="group" ${event?.extendedProps?.groupId ? 'selected' : ''}>Групповое</option>
                            </select>
                        </div>
                        <div class="form-group" id="studentSelectGroup">
                            <label>Ученик</label>
                            <select id="studentSelect">
                                <option value="">Выберите ученика</option>
                                ${studentsList.map(s => `<option value="${s.id}" ${event?.extendedProps?.studentId === s.id ? 'selected' : ''}>${s.child_name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group hidden" id="groupSelectGroup">
                            <label>Группа</label>
                            <select id="groupSelect">
                                <option value="">Выберите группу</option>
                                ${groupsList.map(g => `<option value="${g.id}" ${event?.extendedProps?.groupId === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Дата и время</label>
                            <input type="datetime-local" id="lessonDate" value="${getDefaultDateTime(event, defaultDate)}" required>
                        </div>
                        <div class="form-group">
                            <label>Тема урока</label>
                            <input type="text" id="lessonTopic" placeholder="Например: Циклы в Python" value="${event?.extendedProps?.topic || ''}">
                        </div>
                        <div class="form-group">
                            <label>Домашнее задание</label>
                            <textarea id="lessonHomework" rows="3" placeholder="Что задать ученикам...">${event?.extendedProps?.homework || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="lessonCompleted" ${event?.extendedProps?.isCompleted ? 'checked' : ''}>
                                Урок проведён
                            </label>
                        </div>
                        ${event ? '<button type="button" class="btn btn-danger" id="deleteLessonBtn" style="width:100%; margin-bottom:1rem;"><i class="fas fa-trash"></i> Удалить урок</button>' : ''}
                        <div class="form-actions">
                            <button type="submit" class="btn btn-success">${event ? 'Сохранить изменения' : 'Создать урок'}</button>
                            <button type="button" class="btn btn-secondary close-modal">Отмена</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Переключение типа (ученик / группа)
        const typeSelect = modal.querySelector('#lessonType');
        const studentGroup = modal.querySelector('#studentSelectGroup');
        const groupGroup = modal.querySelector('#groupSelectGroup');
        
        const toggleTypeFields = () => {
            if (typeSelect.value === 'student') {
                studentGroup.classList.remove('hidden');
                groupGroup.classList.add('hidden');
            } else {
                studentGroup.classList.add('hidden');
                groupGroup.classList.remove('hidden');
            }
        };
        
        typeSelect.addEventListener('change', toggleTypeFields);
        toggleTypeFields(); // Вызываем сразу

        // Закрытие модалки
        const closeModal = () => {
            console.log('🪟 Закрытие модального окна');
            modal.remove();
        };
        
        modal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Сохранение
        const form = modal.querySelector('#lessonForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('💾 Сохранение урока...');
            
            const lessonData = {
                teacher_id: teacherUser.id,
                lesson_date: new Date(document.getElementById('lessonDate').value).toISOString(),
                topic: document.getElementById('lessonTopic').value.trim() || null,
                homework: document.getElementById('lessonHomework').value.trim() || null,
                is_completed: document.getElementById('lessonCompleted').checked
            };

            if (typeSelect.value === 'student') {
                lessonData.student_id = document.getElementById('studentSelect').value || null;
                lessonData.group_id = null;
            } else {
                lessonData.group_id = document.getElementById('groupSelect').value || null;
                lessonData.student_id = null;
            }

            if (!lessonData.student_id && !lessonData.group_id) {
                alert('Пожалуйста, выберите ученика или группу');
                return;
            }

            if (!lessonData.lesson_date) {
                alert('Пожалуйста, укажите дату и время урока');
                return;
            }

            console.log('📤 Отправка данных:', lessonData);

            let error;
            if (event) {
                ({ error } = await window._supabase.from('lessons').update(lessonData).eq('id', event.id));
            } else {
                ({ error } = await window._supabase.from('lessons').insert(lessonData));
            }

            if (error) {
                console.error('❌ Ошибка сохранения:', error);
                alert('Ошибка при сохранении урока: ' + error.message);
                return;
            }

            console.log('✅ Урок сохранён');
            closeModal();
            calendar.refetchEvents();
        });

        // Удаление
        if (event) {
            modal.querySelector('#deleteLessonBtn').addEventListener('click', async () => {
                if (!confirm('Вы уверены, что хотите удалить этот урок?')) return;
                
                console.log('🗑️ Удаление урока:', event.id);
                const { error } = await window._supabase.from('lessons').delete().eq('id', event.id);
                
                if (error) {
                    console.error('❌ Ошибка удаления:', error);
                    alert('Ошибка при удалении урока: ' + error.message);
                    return;
                }
                
                console.log('✅ Урок удалён');
                closeModal();
                calendar.refetchEvents();
            });
        }
    }

    // Вспомогательная функция для форматирования даты
    function getDefaultDateTime(event, defaultDate) {
        if (event?.start) {
            const date = new Date(event.start);
            const offset = date.getTimezoneOffset();
            date.setMinutes(date.getMinutes() - offset);
            return date.toISOString().slice(0, 16);
        }
        if (defaultDate) {
            const date = new Date(defaultDate);
            const offset = date.getTimezoneOffset();
            date.setMinutes(date.getMinutes() - offset);
            return date.toISOString().slice(0, 16);
        }
        const today = new Date();
        today.setHours(15, 0, 0, 0);
        const offset = today.getTimezoneOffset();
        today.setMinutes(today.getMinutes() - offset);
        return today.toISOString().slice(0, 16);
    }

    console.log('✅ Модуль расписания загружен');
})();