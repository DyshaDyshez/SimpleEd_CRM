// modules/lessonForm.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { fetchGroupsForSelect } from './groups.js';
import { fetchStudentsForSelect } from './students.js';
import { findAvailablePayment, linkLessonToPayment, unlinkLessonFromPayment, linkGroupLessonToPayments } from './payment-utils.js';
import { showConfirmModal } from './dashboard.js';

let groupsForLessons = [];
let studentsForLessons = [];

// ==================== ЗАГРУЗКА ДАННЫХ ====================
async function loadSelectData() {
    if (groupsForLessons.length === 0 || studentsForLessons.length === 0) {
        [groupsForLessons, studentsForLessons] = await Promise.all([
            fetchGroupsForSelect(),
            fetchStudentsForSelect()
        ]);
    }
}

// ==================== ПРОВЕРКА БАЛАНСА УЧЕНИКА ====================
async function getStudentBalance(studentId) {
  if (!studentId) return 0;
  
  const { data: payments } = await supabase
    .from('payments')
    .select('lessons_paid, lessons_used')
    .eq('student_id', studentId)
    .eq('status', 'paid');
  
  const totalPaid = (payments || []).reduce((sum, p) => sum + (p.lessons_paid || 0), 0);
  const totalUsed = (payments || []).reduce((sum, p) => sum + (p.lessons_used || 0), 0);
  
  return totalPaid - totalUsed;
}

// ==================== КОНВЕРТЕРЫ ВРЕМЕНИ ====================
function localToUTC(localDateTimeString) {
    const localDate = new Date(localDateTimeString);
    return new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000));
}

function utcToLocal(utcString) {
    const utcDate = new Date(utcString);
    return new Date(utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000));
}

function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================
export async function openLessonForm({
    lessonId = null,
    prefillDate = null,
    prefillGroupId = null,
    prefillStudentId = null,
    initialStatus = 'planned',
    onSuccess = null
} = {}) {
    await loadSelectData();

    const isEditing = !!lessonId;
    let lesson = null;

    if (isEditing) {
        const { data, error } = await supabase
            .from('lessons')
            .select(`*, student_groups ( group_name ), students ( child_name )`)
            .eq('id', lessonId)
            .eq('teacher_id', getCurrentUser().id)
            .single();
        if (error) {
            alert('Ошибка загрузки урока');
            return;
        }
        lesson = data;
    }

    const modal = document.createElement('div');
    modal.className = 'modal lesson-form-modal';
    modal.innerHTML = renderFormHTML({
        lesson,
        prefillDate,
        prefillGroupId,
        prefillStudentId,
        initialStatus
    });
    document.body.appendChild(modal);

    const form = modal.querySelector('#lessonForm');
    const dateInput = modal.querySelector('#lessonDate');
    const durationInput = modal.querySelector('#lessonDuration');
    const endDateDisplay = modal.querySelector('#lessonEndDateDisplay');
    const endDateHidden = modal.querySelector('#lessonEndDate');
    const errorDiv = modal.querySelector('#lessonFormError');
    const cancelBtn = modal.querySelector('#cancelLessonForm');
    const deleteBtn = modal.querySelector('#deleteLessonBtn');
    const statusSelect = modal.querySelector('#lessonStatus');
    const paymentStatusSelect = modal.querySelector('#lessonPaymentStatus');
    const typeSelect = modal.querySelector('#lessonTypeSelect');
    const groupSelect = modal.querySelector('#lessonGroupSelect');
    const studentSelect = modal.querySelector('#lessonStudentSelect');

    // ==================== ПРОВЕРКА ВЫХОДНОГО/ОТПУСКА ПРИ ВЫБОРЕ ДАТЫ ====================
    dateInput.addEventListener('change', async () => {
        const selectedDate = dateInput.value.split('T')[0];
        
        const { data, error } = await supabase
            .from('teacher_availability')
            .select('status')
            .eq('teacher_id', getCurrentUser().id)
            .eq('date', selectedDate)
            .maybeSingle();
        
        if (error) {
            console.error('Ошибка проверки доступности:', error);
            return;
        }
        
        if (data && (data.status === 'day_off' || data.status === 'vacation')) {
            const statusText = data.status === 'day_off' ? 'выходной' : 'отпуск';
            
            showConfirmModal(
                `Вы выбрали дату, которая отмечена как "${statusText}". Вы уверены, что хотите назначить урок на этот день?`,
                () => console.log('Урок назначен на выходной/отпуск'),
                () => dateInput.value = ''
            );
        }
    });

    // ==================== ПРОВЕРКА БАЛАНСА ПРИ ВЫБОРЕ УЧЕНИКА ====================
    if (!isEditing && studentSelect) {
        studentSelect.addEventListener('change', async () => {
            const studentId = studentSelect.value;
            if (!studentId) return;
            
            const balance = await getStudentBalance(studentId);
            
            if (balance <= 0) {
                showConfirmModal(
                    `У этого ученика закончились оплаченные уроки. Всё равно назначить урок?`,
                    () => {},
                    () => studentSelect.value = ''
                );
            }
            
            // Проверка каникул
            const { data: student } = await supabase
                .from('students')
                .select('status, vacation_start, vacation_end')
                .eq('id', studentId)
                .single();
            
            if (student?.status === 'vacation') {
                const today = new Date().toISOString().split('T')[0];
                const isOnVacation = student.vacation_start && student.vacation_end &&
                    today >= student.vacation_start && today <= student.vacation_end;
                
                if (isOnVacation) {
                    const period = `${new Date(student.vacation_start).toLocaleDateString('ru-RU')} – ${new Date(student.vacation_end).toLocaleDateString('ru-RU')}`;
                    showConfirmModal(
                        `У этого ученика каникулы (${period}). Вы уверены, что хотите назначить урок?`,
                        () => {},
                        () => studentSelect.value = ''
                    );
                }
            }
        });
    }

    // ==================== ПОКАЗ/СКРЫТИЕ СТАТУСА ОПЛАТЫ ====================
    const paymentGroup = modal.querySelector('#paymentStatusGroup');
    const paymentSelect = modal.querySelector('#lessonPaymentStatus');

    function togglePaymentStatus() {
        if (statusSelect.value === 'completed') {
            paymentGroup.style.display = 'block';
            if (!isEditing && paymentSelect) paymentSelect.value = 'paid';
        } else {
            paymentGroup.style.display = 'none';
        }
    }

    statusSelect.addEventListener('change', togglePaymentStatus);
    if (initialStatus === 'completed') {
        statusSelect.value = 'completed';
        togglePaymentStatus();
    } else {
        togglePaymentStatus();
    }

    // ==================== ОБНОВЛЕНИЕ ВРЕМЕНИ ОКОНЧАНИЯ ====================
    function updateEndTime() {
        if (!dateInput.value) return;
        const startLocal = new Date(dateInput.value);
        const duration = parseInt(durationInput.value) || 60;
        const endLocal = new Date(startLocal.getTime() + duration * 60000);
        endDateDisplay.value = formatDateTimeLocal(endLocal);
        const endUTC = new Date(endLocal.getTime() - (endLocal.getTimezoneOffset() * 60000));
        endDateHidden.value = endUTC.toISOString();
    }

    dateInput.addEventListener('change', updateEndTime);
    durationInput.addEventListener('input', updateEndTime);

    modal.querySelectorAll('.duration-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            durationInput.value = btn.dataset.minutes;
            updateEndTime();
            modal.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // ==================== УСТАНОВКА НАЧАЛЬНЫХ ЗНАЧЕНИЙ ====================
    if (lesson?.lesson_end) {
        const endLocal = utcToLocal(lesson.lesson_end);
        endDateDisplay.value = formatDateTimeLocal(endLocal);
        endDateHidden.value = lesson.lesson_end;
        const startUTC = new Date(lesson.lesson_date);
        const endUTC = new Date(lesson.lesson_end);
        const duration = Math.round((endUTC - startUTC) / 60000);
        durationInput.value = duration;
    } else {
        updateEndTime();
    }

    // ==================== ПЕРЕКЛЮЧЕНИЕ ТИПА ЗАНЯТИЯ + ПОСЕЩАЕМОСТЬ ====================
    if (!isEditing) {
        const groupWrapper = modal.querySelector('#groupSelectWrapper');
        const studentWrapper = modal.querySelector('#studentSelectWrapper');
        const attendanceGroup = modal.querySelector('#attendanceGroup');

        if (typeSelect) {
            typeSelect.addEventListener('change', async () => {
                if (typeSelect.value === 'group') {
                    groupWrapper.classList.remove('hidden');
                    studentWrapper.classList.add('hidden');
                    if (attendanceGroup) {
                        attendanceGroup.classList.remove('hidden');
                        const groupId = groupSelect?.value;
                        if (groupId) {
                            const attendanceList = modal.querySelector('#attendanceList');
                            attendanceList.innerHTML = await renderAttendanceCheckboxes(groupId);
                        }
                    }
                } else {
                    groupWrapper.classList.add('hidden');
                    studentWrapper.classList.remove('hidden');
                    if (attendanceGroup) attendanceGroup.classList.add('hidden');
                }
            });
        }

        if (groupSelect) {
            groupSelect.addEventListener('change', async () => {
                const attendanceList = modal.querySelector('#attendanceList');
                if (attendanceList && groupSelect.value) {
                    attendanceList.innerHTML = await renderAttendanceCheckboxes(groupSelect.value);
                }
            });
        }

        if (prefillGroupId) {
            if (typeSelect) typeSelect.value = 'group';
            groupWrapper.classList.remove('hidden');
            studentWrapper.classList.add('hidden');
            if (attendanceGroup) {
                attendanceGroup.classList.remove('hidden');
                const attendanceList = modal.querySelector('#attendanceList');
                attendanceList.innerHTML = await renderAttendanceCheckboxes(prefillGroupId);
            }
        } else if (prefillStudentId) {
            if (typeSelect) typeSelect.value = 'student';
            groupWrapper.classList.add('hidden');
            studentWrapper.classList.remove('hidden');
            if (attendanceGroup) attendanceGroup.classList.add('hidden');
        }
    }

    // ==================== КНОПКИ ОТКРЫТИЯ ГРУППЫ/УЧЕНИКА ====================
    if (isEditing) {
        const hasGroup = !!lesson?.group_id;
        const hasStudent = !!lesson?.student_id;

        if (hasGroup) {
            modal.querySelector('#openGroupFromLesson')?.addEventListener('click', async () => {
                const { openFullGroupCard } = await import('./groups.js');
                openFullGroupCard(lesson.group_id);
            });
        }
        if (hasStudent) {
            modal.querySelector('#openStudentFromLesson')?.addEventListener('click', async () => {
                const { openStudentCard } = await import('./students.js');
                openStudentCard(lesson.student_id);
            });
        }
    }

    // ==================== ЗАКРЫТИЕ ====================
    const closeModal = () => modal.remove();
    cancelBtn.addEventListener('click', closeModal);
    modal.querySelector('.close-modal')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // ==================== УДАЛЕНИЕ ====================
    if (isEditing) {
        deleteBtn.addEventListener('click', async () => {
            showConfirmModal(
                'Удалить урок безвозвратно?',
                async () => {
                    if (lesson.payment_id) {
                        await unlinkLessonFromPayment(lessonId, lesson.payment_id);
                    }
                    const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
                    if (error) {
                        alert(`Ошибка удаления: ${error.message}`);
                        return;
                    }
                    closeModal();
                    if (onSuccess) onSuccess();
                }
            );
        });
    }

    // ==================== СОХРАНЕНИЕ ====================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorDiv.textContent = '';

        const lessonDate = dateInput.value;
        if (!lessonDate) {
            errorDiv.textContent = 'Выберите дату и время начала';
            return;
        }

        const topic = modal.querySelector('#lessonTopic').value.trim() || null;
        const status = statusSelect.value;
        const notes = modal.querySelector('#lessonNotes').value.trim() || null;
        let paymentStatus = paymentStatusSelect?.value || 'debt';

        const startUTC = localToUTC(lessonDate);
        const endUTC = endDateHidden.value;

        const lessonData = {
            teacher_id: getCurrentUser().id,
            lesson_date: startUTC.toISOString(),
            lesson_end: endUTC,
            topic,
            status,
            notes,
            is_free: paymentStatus === 'free'
        };

        if (!isEditing) {
            if (typeSelect) {
                if (typeSelect.value === 'group') {
                    lessonData.group_id = groupSelect?.value || null;
                    lessonData.student_id = null;
                } else {
                    lessonData.group_id = null;
                    lessonData.student_id = studentSelect?.value || null;
                }
            }
        }

        let res;
        if (isEditing) {
            res = await supabase.from('lessons').update(lessonData).eq('id', lessonId);
        } else {
            res = await supabase.from('lessons').insert(lessonData).select('id').single();
        }

        if (res.error) {
            errorDiv.textContent = `Ошибка: ${res.error.message}`;
            return;
        }

        const savedLessonId = isEditing ? lessonId : res.data?.id;
        const studentId = isEditing ? lesson?.student_id : lessonData.student_id;

        // ==================== ОБРАБОТКА ОПЛАТЫ ====================
        if (status === 'completed') {
            const isGroupLesson = typeSelect && typeSelect.value === 'group';

            if (isGroupLesson) {
                const attendedCheckboxes = modal.querySelectorAll('.attendance-checkbox:checked');
                const attendedStudentIds = Array.from(attendedCheckboxes).map(cb => cb.value);

                if (attendedStudentIds.length > 0 && lessonData.group_id) {
                    await linkGroupLessonToPayments(
                        lessonData.group_id,
                        savedLessonId,
                        startUTC.toISOString(),
                        attendedStudentIds
                    );
                }
            } else if (studentId) {
                const balance = await getStudentBalance(studentId);

                if (paymentStatus === 'paid') {
                    if (balance > 0) {
                        // Есть оплаченные уроки — списываем
                        const availablePayment = await findAvailablePayment(studentId, startUTC.toISOString());
                        if (availablePayment) {
                            await linkLessonToPayment(savedLessonId, availablePayment.id);
                        } else {
                            // На всякий случай создаём новую оплату
                            const { data: newPayment } = await supabase
                                .from('payments')
                                .insert({
                                    teacher_id: getCurrentUser().id,
                                    student_id: studentId,
                                    lessons_paid: 1,
                                    payment_date: new Date().toISOString().split('T')[0],
                                    status: 'paid',
                                    description: `Оплата урока ${new Date(lessonDate).toLocaleDateString()}`
                                })
                                .select('id')
                                .single();
                            if (newPayment) {
                                await linkLessonToPayment(savedLessonId, newPayment.id);
                            }
                        }
                    } else {
                        // Нет оплаченных уроков — автоматически переводим в долг
                        paymentStatus = 'debt';
                        await supabase.from('lessons').update({
                            payment_id: null,
                            is_free: false
                        }).eq('id', savedLessonId);
                        
                        showConfirmModal(
                            'У ученика закончились оплаченные уроки. Урок будет отмечен как "Долг".',
                            () => {},
                            () => {}
                        );
                    }
                } else {
                    // Статус не "paid" — отвязываем от старой оплаты
                    if (isEditing && lesson?.payment_id) {
                        await unlinkLessonFromPayment(savedLessonId, lesson.payment_id);
                    }
                    await supabase.from('lessons').update({
                        payment_id: null,
                        is_free: paymentStatus === 'free'
                    }).eq('id', savedLessonId);
                }
            }
        }

        closeModal();
        if (onSuccess) onSuccess();
    });
}

// ==================== ГЕНЕРАЦИЯ HTML ====================
function renderFormHTML({ lesson, prefillDate, prefillGroupId, prefillStudentId, initialStatus }) {
    const isEditing = !!lesson;
    const title = isEditing
        ? 'Редактировать урок'
        : (initialStatus === 'completed' ? 'Добавить проведённый урок' : 'Назначить урок');
    const submitText = isEditing ? 'Сохранить' : 'Создать';

    let dateValue = '';
    if (lesson?.lesson_date) {
        const localDate = utcToLocal(lesson.lesson_date);
        dateValue = formatDateTimeLocal(localDate);
    } else {
        dateValue = prefillDate || '';
    }

    const relatedName = lesson?.student_groups?.group_name || lesson?.students?.child_name || 'Не указано';
    const hasGroup = !!lesson?.group_id;
    const hasStudent = !!lesson?.student_id;

    let defaultDuration = 60;
    if (lesson?.lesson_end) {
        defaultDuration = Math.round((new Date(lesson.lesson_end) - new Date(lesson.lesson_date)) / 60000);
    }

    const typeOptions = !isEditing ? `
        <div class="form-group">
            <label>Тип занятия</label>
            <select id="lessonTypeSelect">
                <option value="group" ${prefillGroupId ? 'selected' : ''}>Группа</option>
                <option value="student" ${prefillStudentId ? 'selected' : ''}>Индивидуально</option>
            </select>
        </div>
        <div class="form-group ${prefillStudentId ? 'hidden' : ''}" id="groupSelectWrapper">
            <label>Группа</label>
            <select id="lessonGroupSelect">
                <option value="">Выберите группу</option>
                ${groupsForLessons.map(g => `<option value="${g.id}" ${g.id === prefillGroupId ? 'selected' : ''}>${g.group_name}</option>`).join('')}
            </select>
        </div>
        <div class="form-group ${prefillGroupId ? 'hidden' : ''}" id="studentSelectWrapper">
            <label>Ученик</label>
            <select id="lessonStudentSelect">
                <option value="">Выберите ученика</option>
                ${studentsForLessons.map(s => `<option value="${s.id}" ${s.id === prefillStudentId ? 'selected' : ''}>${s.child_name}</option>`).join('')}
            </select>
        </div>
    ` : '';

    const attendanceSection = !isEditing ? `
        <div class="form-group hidden" id="attendanceGroup">
            <label>Присутствовали на уроке:</label>
            <div id="attendanceList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--neutral-gray); border-radius: 8px; padding: 0.5rem;">
                <p style="color: var(--text-secondary);">Сначала выберите группу</p>
            </div>
            <small style="color: var(--text-secondary); margin-top: 0.5rem; display: block;">
                Уроки спишутся только с отмеченных учеников
            </small>
        </div>
    ` : '';

    const deleteButton = isEditing
        ? `<button type="button" class="btn btn-danger" id="deleteLessonBtn">Удалить урок</button>`
        : '';

    const paymentStatusOptions = `
        <div class="form-group" id="paymentStatusGroup" style="display: none;">
            <label>Статус оплаты</label>
            <select id="lessonPaymentStatus">
                <option value="debt">⚠️ Долг</option>
                <option value="free">🎁 Бесплатный</option>
                <option value="paid" selected>✅ Оплачен (списать 1 урок)</option>
            </select>
        </div>
    `;

    return `
        <div class="modal-card" style="max-width: 600px;">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <form id="lessonForm">
                <div class="form-grid">
                    <div class="form-group">
                        <label>Дата и время начала *</label>
                        <input type="datetime-local" id="lessonDate" value="${dateValue}" required>
                    </div>
                    <div class="form-group">
                        <label>Длительность (минут)</label>
                        <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                            <button type="button" class="btn btn-sm btn-outline duration-btn" data-minutes="30">30</button>
                            <button type="button" class="btn btn-sm btn-outline duration-btn" data-minutes="45">45</button>
                            <button type="button" class="btn btn-sm btn-outline duration-btn" data-minutes="60">60</button>
                            <button type="button" class="btn btn-sm btn-outline duration-btn" data-minutes="90">90</button>
                            <button type="button" class="btn btn-sm btn-outline duration-btn" data-minutes="120">120</button>
                        </div>
                        <input type="number" id="lessonDuration" min="5" max="300" step="5" value="${defaultDuration}" style="width: 100px;">
                    </div>
                    <div class="form-group">
                        <label>Время окончания</label>
                        <input type="datetime-local" id="lessonEndDateDisplay" disabled style="background: var(--neutral-light);">
                        <input type="hidden" id="lessonEndDate">
                    </div>
                    ${isEditing ? `
                    <div class="form-group">
                        <label>Связано с</label>
                        <div style="display: flex; gap: 0.5rem;">
                            <input type="text" value="${relatedName}" disabled style="flex:1;">
                            ${hasGroup ? `<button type="button" class="btn btn-sm btn-secondary" id="openGroupFromLesson">Открыть группу</button>` : ''}
                            ${hasStudent ? `<button type="button" class="btn btn-sm btn-secondary" id="openStudentFromLesson">Открыть ученика</button>` : ''}
                        </div>
                    </div>
                    ` : ''}
                </div>
                ${typeOptions}
                ${attendanceSection}
                <div class="form-group">
                    <label>Тема</label>
                    <input type="text" id="lessonTopic" value="${lesson?.topic || ''}" placeholder="Например: Present Perfect">
                </div>
                <div class="form-group">
                    <label>Статус</label>
                    <select id="lessonStatus">
                        <option value="planned" ${(lesson?.status || initialStatus) === 'planned' ? 'selected' : ''}>Запланирован</option>
                        <option value="completed" ${(lesson?.status || initialStatus) === 'completed' ? 'selected' : ''}>Проведён</option>
                        <option value="cancelled" ${lesson?.status === 'cancelled' ? 'selected' : ''}>Отменён</option>
                        <option value="rescheduled" ${lesson?.status === 'rescheduled' ? 'selected' : ''}>Перенесён</option>
                    </select>
                </div>
                ${paymentStatusOptions}
                <div class="form-group">
                    <label>Заметки</label>
                    <textarea id="lessonNotes" rows="3" placeholder="Что прошли, что задано...">${lesson?.notes || ''}</textarea>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-success">${submitText}</button>
                    <button type="button" class="btn btn-secondary" id="cancelLessonForm">Отмена</button>
                    ${deleteButton}
                </div>
                <div id="lessonFormError" class="error-message"></div>
            </form>
        </div>
    `;
}

// ==================== HELPER: ЧЕКБОКСЫ ПОСЕЩАЕМОСТИ ====================
async function renderAttendanceCheckboxes(groupId) {
    if (!groupId) return '<p style="color: var(--text-secondary);">Сначала выберите группу</p>';

    const { data: students } = await supabase
        .from('students')
        .select('id, child_name')
        .eq('group_id', groupId)
        .eq('teacher_id', getCurrentUser().id)
        .order('child_name');

    if (!students?.length) {
        return '<p style="color: var(--text-secondary);">В группе нет учеников</p>';
    }

    return students.map(s => `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; cursor: pointer; border-radius: 4px; transition: background 0.2s;">
            <input type="checkbox" class="attendance-checkbox" value="${s.id}" checked style="cursor: pointer;">
            <span>${s.child_name}</span>
        </label>
    `).join('');
}