/* =========================================================
 * SIMPLEED CRM – SCHEDULE MODULE  (clean & bullet-proof)
 * ========================================================= */
(function () {
    'use strict';
  
    /* ---------- 1.  HELPERS  ---------- */
    const log = (m) => console.log(`[SCHEDULE] ${m}`);
    const err = (m) => console.error(`[SCHEDULE] ${m}`);
  
    /** Возвращает строку вида YYYY-MM-DDTHH:mm для <input type="datetime-local"> */
    const isoLocal = (d) => {
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
  
    /** Показать alert с текстом ошибки и записать в консоль */
    const handleError = (prefix, error) => {
      const msg = error?.message || error || 'Неизвестная ошибка';
      err(`${prefix}: ${msg}`);
      alert(`Ошибка: ${msg}`);
    };
  
    /* ---------- 2.  STATE  ---------- */
    let teacherUser   = null;
    let calendar      = null;
    let studentsList  = [];
    let groupsList    = [];
  
    /* ---------- 3.  WAIT-FOR UTILS  ---------- */
    const waitForGlobal = (name) =>
      new Promise((res) => {
        const t = setInterval(() => {
          if (window[name]) {
            clearInterval(t);
            res(window[name]);
          }
        }, 100);
      });
  
    const waitForUser = () =>
      new Promise((res) => {
        const t = setInterval(() => {
          if (window.currentUser) {
            clearInterval(t);
            res(window.currentUser);
          }
        }, 100);
      });
  
    /* ---------- 4.  INIT ENTRY POINT  ---------- */
    window.initSchedulePage = async () => {
      log('Инициализация страницы расписания…');
  
      // 4.1. Проверяем FullCalendar
      if (typeof FullCalendar === 'undefined') {
        err('FullCalendar не загружен – расписание невозможно отобразить');
        return;
      }
  
      // 4.2. Ждём Supabase и пользователя
      await waitForGlobal('_supabase');
      teacherUser = await waitForUser();
      log(`Пользователь авторизован: ${teacherUser.email}`);
  
      // 4.3. Загружаем справочники
      await loadStudentsAndGroups();
  
      // 4.4. Рисуем календарь
      renderCalendar();
  
      // 4.5. Вешаем кнопку «Добавить урок»
      const addBtn = document.getElementById('addLessonFromCalendarBtn');
      if (addBtn) addBtn.addEventListener('click', () => openLessonModal());
      else log('Кнопка #addLessonFromCalendarBtn не найдена – добавление только через календарь');
    };
  
    /* ---------- 5.  LOAD STUDENTS & GROUPS  ---------- */
    async function loadStudentsAndGroups() {
      try {
        log('Загрузка учеников и групп…');
        const [st, gr] = await Promise.all([
          window._supabase.from('students').select('id, child_name').eq('teacher_id', teacherUser.id).order('child_name'),
          window._supabase.from('student_groups').select('id, group_name').eq('teacher_id', teacherUser.id).order('group_name')
        ]);
        if (st.error) throw st.error;
        if (gr.error) throw gr.error;
        studentsList = st.data || [];
        groupsList   = gr.data || [];
        log(`Загружено: ${studentsList.length} учеников, ${groupsList.length} групп`);
      } catch (e) {
        handleError('Не удалось загрузить справочники', e);
      }
    }
  
    /* ---------- 6.  RENDER CALENDAR  ---------- */
    function renderCalendar() {
      const el = document.getElementById('calendar');
      if (!el) {
        err('Элемент #calendar не найден на странице');
        return;
      }
      if (calendar) calendar.destroy();
  
      calendar = new FullCalendar.Calendar(el, {
        initialView: 'timeGridWeek',
        locale: 'ru',
        headerToolbar: {
          left : 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: { today: 'Сегодня', month: 'Месяц', week: 'Неделя', day: 'День' },
        height: 'auto',
        slotMinTime: '08:00:00',
        slotMaxTime: '22:00:00',
        allDaySlot: false,
        nowIndicator: true,
  
        events: async ({ start, end }, success, failure) => {
          try {
            const { data, error } = await window._supabase
              .from('lessons')
              .select('*, students(child_name), student_groups(group_name)')
              .eq('teacher_id', teacherUser.id)
              .gte('lesson_date', start.toISOString())
              .lte('lesson_date', end.toISOString());
            if (error) throw error;
  
            const events = (data || []).map(l => {
              const isGroup = !!l.group_id;
              const title   = isGroup ? (l.student_groups?.group_name || 'Группа')
                                      : (l.students?.child_name || 'Ученик');
              const startD  = new Date(l.lesson_date);
              const endD    = new Date(startD.getTime() + 60 * 60 * 1000); // +1 ч
              return {
                id: l.id,
                title: `${title} — ${l.topic || 'Без темы'}`,
                start: startD,
                end: endD,
                extendedProps: {
                  studentId : l.student_id,
                  groupId   : l.group_id,
                  topic     : l.topic,
                  homework  : l.homework,
                  isCompleted: l.is_completed
                },
                backgroundColor: l.is_completed ? '#5B8C6F' : '#D4A373',
                borderColor   : l.is_completed ? '#4A6E58' : '#B8835E',
                textColor: 'white'
              };
            });
            success(events);
          } catch (e) {
            handleError('Ошибка загрузки уроков', e);
            failure(e);
          }
        },
  
        dateClick: ({ date }) => openLessonModal(null, date),
        eventClick: ({ event }) => openLessonModal(event),
  
        eventDrop: async ({ event }) => {
          const newDate = event.start.toISOString();
          const { error } = await window._supabase
            .from('lessons')
            .update({ lesson_date: newDate })
            .eq('id', event.id);
          if (error) {
            handleError('Не удалось изменить дату урока', error);
            event.revert();
          } else log(`Дата урока ${event.id} обновлена`);
        }
      });
  
      calendar.render();
      log('Календарь отрендерен');
    }
  
    /* ---------- 7.  MODAL  ---------- */
    function openLessonModal(fcEvent = null, defaultDate = null) {
      log('Открытие модального окна урока');
  
      const isEdit = !!fcEvent;
      const props  = fcEvent?.extendedProps || {};
  
      // 7.1. Формируем HTML
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-card">
          <div class="modal-header">
            <h2>${isEdit ? 'Редактировать урок' : 'Новый урок'}</h2>
            <button class="btn-icon close-modal" aria-label="Закрыть"><i class="fas fa-times"></i></button>
          </div>
          <div class="modal-body">
            <form id="lessonForm">
              <div class="form-group">
                <label>Тип занятия</label>
                <select id="lessonType">
                  <option value="student" ${props.studentId || !props.groupId ? 'selected' : ''}>Индивидуальное</option>
                  <option value="group"   ${props.groupId ? 'selected' : ''}>Групповое</option>
                </select>
              </div>
  
              <div class="form-group" id="studentSelectGroup">
                <label>Ученик</label>
                <select id="studentSelect">
                  ${studentsList.length
                    ? `<option value="">Выберите ученика</option>` +
                      studentsList.map(s => `<option value="${s.id}" ${props.studentId === s.id ? 'selected' : ''}>${s.child_name}</option>`).join('')
                    : '<option value="">Нет доступных учеников</option>'}
                </select>
              </div>
  
              <div class="form-group hidden" id="groupSelectGroup">
                <label>Группа</label>
                <select id="groupSelect">
                  ${groupsList.length
                    ? `<option value="">Выберите группу</option>` +
                      groupsList.map(g => `<option value="${g.id}" ${props.groupId === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')
                    : '<option value="">Нет доступных групп</option>'}
                </select>
              </div>
  
              <div class="form-group">
                <label>Дата и время</label>
                <input type="datetime-local" id="lessonDate" required
                       value="${isEdit ? isoLocal(fcEvent.start) : defaultDate ? isoLocal(defaultDate) : isoLocal(new Date())}">
              </div>
  
              <div class="form-group">
                <label>Тема урока</label>
                <input type="text" id="lessonTopic" placeholder="Например: Циклы в Python"
                       value="${props.topic || ''}">
              </div>
  
              <div class="form-group">
                <label>Домашнее задание</label>
                <textarea id="lessonHomework" rows="3" placeholder="Что задать ученикам...">${props.homework || ''}</textarea>
              </div>
  
              <div class="form-group">
                <label><input type="checkbox" id="lessonCompleted" ${props.isCompleted ? 'checked' : ''}>
                   Урок проведён
                </label>
              </div>
  
              ${isEdit
                ? '<button type="button" class="btn btn-danger" id="deleteLessonBtn" style="width:100%;margin-bottom:1rem;"><i class="fas fa-trash"></i> Удалить урок</button>'
                : ''}
  
              <div class="form-actions">
                <button type="submit" class="btn btn-success">${isEdit ? 'Сохранить изменения' : 'Создать урок'}</button>
                <button type="button" class="btn btn-secondary close-modal">Отмена</button>
              </div>
            </form>
          </div>
        </div>`;
  
      document.body.appendChild(modal);
  
      // 7.2. Переключение «индивидуально / группа»
      const typeSel      = modal.querySelector('#lessonType');
      const studentGroup = modal.querySelector('#studentSelectGroup');
      const groupGroup   = modal.querySelector('#groupSelectGroup');
      const toggleType = () => {
        if (typeSel.value === 'student') {
          studentGroup.classList.remove('hidden');
          groupGroup.classList.add('hidden');
        } else {
          studentGroup.classList.add('hidden');
          groupGroup.classList.remove('hidden');
        }
      };
      typeSel.addEventListener('change', toggleType);
      toggleType();
  
      // 7.3. Закрытие
      const closeModal = () => modal.remove();
      modal.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', closeModal));
      modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  
      // 7.4. Сохранение
      modal.querySelector('#lessonForm').addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
          teacher_id : teacherUser.id,
          lesson_date: new Date(modal.querySelector('#lessonDate').value).toISOString(),
          topic      : modal.querySelector('#lessonTopic').value.trim() || null,
          homework   : modal.querySelector('#lessonHomework').value.trim() || null,
          is_completed: modal.querySelector('#lessonCompleted').checked
        };
        if (typeSel.value === 'student') {
          data.student_id = modal.querySelector('#studentSelect').value || null;
          data.group_id   = null;
          if (!data.student_id) { alert('Выберите ученика'); return; }
        } else {
          data.group_id   = modal.querySelector('#groupSelect').value || null;
          data.student_id = null;
          if (!data.group_id) { alert('Выберите группу'); return; }
        }
  
        let error;
        if (isEdit) ({ error } = await window._supabase.from('lessons').update(data).eq('id', fcEvent.id));
        else ({ error } = await window._supabase.from('lessons').insert(data));
  
        if (error) { handleError('Ошибка сохранения урока', error); return; }
  
        closeModal();
        calendar.refetchEvents();
      });
  
      // 7.5. Удаление
      if (isEdit) {
        modal.querySelector('#deleteLessonBtn').addEventListener('click', async () => {
          if (!confirm('Вы уверены, что хотите удалить этот урок?')) return;
          const { error } = await window._supabase.from('lessons').delete().eq('id', fcEvent.id);
          if (error) { handleError('Не удалось удалить урок', error); return; }
          closeModal();
          calendar.refetchEvents();
        });
      }
    }
  
    log('Модуль расписания загружен');
  })();
  