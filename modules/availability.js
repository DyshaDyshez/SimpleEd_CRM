// modules/availability.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

let calendar = null;
let availabilityData = new Map();
let selectedDate = null;
let busySlots = new Map();
let selectedDates = new Set(); // хранит выбранные даты
let isShiftPressed = false;

// ==================== ГЛОБАЛЬНЫЕ НАСТРОЙКИ ====================
const DEFAULT_START = '10:00';
const DEFAULT_END = '20:00';
const DEFAULT_SLOT = 60;

function getGlobalSettings() {
    return {
        start_time: localStorage.getItem('availability_start') || DEFAULT_START,
        end_time: localStorage.getItem('availability_end') || DEFAULT_END,
        slot_duration: parseInt(localStorage.getItem('availability_slot')) || DEFAULT_SLOT
    };
}

function saveGlobalSettings(start, end, slot) {
    localStorage.setItem('availability_start', start);
    localStorage.setItem('availability_end', end);
    localStorage.setItem('availability_slot', slot);
}

// ==================== КРАСИВОЕ УВЕДОМЛЕНИЕ ====================
function showToast(message, type = 'success') {
    document.querySelectorAll('.toast-notification').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}" style="font-size: 1.5rem;"></i>
        <span>${message}</span>
      </div>
      <button class="toast-close" style="margin-left: auto; background: none; border: none; color: inherit; cursor: pointer;">&times;</button>
    `;
    
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'success' ? '#2C4C3B' : '#d32f2f'};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 1rem;
      z-index: 10000;
      animation: slideIn 0.3s ease;
      max-width: 350px;
    `;
    
    document.body.appendChild(toast);
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== ОСНОВНАЯ ФУНКЦИЯ ====================
export async function openAvailabilityModal() {
  if (document.querySelector('.modal.availability-modal')) return;

  const settings = getGlobalSettings();

  const modal = document.createElement('div');
  modal.className = 'modal availability-modal';
  modal.innerHTML = `
    <div class="modal-card" style="max-width: 950px; width: 95%;">
      <div class="modal-header">
        <h2><i class="fas fa-calendar-alt"></i> Рабочее расписание</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--primary-soft); border-radius: 8px;">
          <label style="font-weight: 600; margin-right: 1rem;">Настройки по умолчанию:</label>
          <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-top: 0.5rem;">
            <div><label>С:</label><input type="time" id="globalStartTime" value="${settings.start_time}" style="width: 100px;"></div>
            <div><label>До:</label><input type="time" id="globalEndTime" value="${settings.end_time}" style="width: 100px;"></div>
            <div><label>Слот (мин):</label>
              <select id="globalSlotDuration" style="width: 90px;">
                <option value="30" ${settings.slot_duration === 30 ? 'selected' : ''}>30</option>
                <option value="45" ${settings.slot_duration === 45 ? 'selected' : ''}>45</option>
                <option value="60" ${settings.slot_duration === 60 ? 'selected' : ''}>60</option>
                <option value="90" ${settings.slot_duration === 90 ? 'selected' : ''}>90</option>
                <option value="120" ${settings.slot_duration === 120 ? 'selected' : ''}>120</option>
              </select>
            </div>
            <button class="btn btn-sm btn-primary" id="saveGlobalSettingsBtn">Сохранить настройки</button>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.5rem;">💡 Эти настройки будут применяться при создании нового рабочего дня</p>
        </div>

        <div id="currentDaySettings" style="margin-bottom: 1rem; padding: 1rem; background: var(--neutral-light); border-radius: 8px; display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
            <div><strong id="selectedDateDisplay"></strong><span id="currentStatusBadge" style="margin-left: 1rem; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.85rem;"></span></div>
            <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
              <div><label>С:</label><input type="time" id="dayStartTime" style="width: 100px;" disabled></div>
              <div><label>До:</label><input type="time" id="dayEndTime" style="width: 100px;" disabled></div>
              <div><label>Слот (мин):</label>
                <select id="daySlotDuration" style="width: 90px;" disabled>
                  <option value="30">30</option><option value="45">45</option><option value="60">60</option><option value="90">90</option><option value="120">120</option>
                </select>
              </div>
            </div>
          </div>
          <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem;">
            <button class="btn btn-sm btn-secondary" id="clearDayBtn">Очистить день</button>
          </div>
        </div>

        <div id="availabilityCalendar"></div>

        <div style="display: flex; gap: 1.5rem; margin-top: 1rem; justify-content: center; flex-wrap: wrap;">
          <div><span class="legend-box available"></span> Рабочий</div>
          <div><span class="legend-box dayoff"></span> Выходной</div>
          <div><span class="legend-box vacation"></span> Отпуск</div>
          <div><span class="legend-box notset"></span> Не назначено</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
          <p style="color: var(--text-secondary); font-size: 0.9rem;">💡 Клик — переключить статус. Shift+клик — выделить несколько. ПКМ — массовая настройка.</p>
          <button class="btn btn-sm btn-secondary" id="clearSelectionBtn" style="display: none;">Сбросить выделение (0)</button>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
          <button class="btn btn-primary" id="saveAvailabilityBtn">Сохранить всё</button>
          <button class="btn btn-secondary close-modal">Закрыть</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  await loadBusySlots();
  await loadAvailabilityData();
  initCalendar(modal);
  bindEvents(modal);

  modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ==================== ЗАГРУЗКА ЗАНЯТЫХ СЛОТОВ ====================
async function loadBusySlots() {
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('lesson_date, lesson_end')
    .eq('teacher_id', getCurrentUser().id)
    .neq('status', 'cancelled');

  if (error) { console.error('Ошибка загрузки уроков:', error); return; }

  busySlots.clear();
  lessons?.forEach(lesson => {
    const start = new Date(lesson.lesson_date);
    const end = new Date(lesson.lesson_end || new Date(start.getTime() + 60 * 60 * 1000));
    const year = start.getFullYear();
    const month = String(start.getMonth() + 1).padStart(2, '0');
    const day = String(start.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    if (!busySlots.has(dateStr)) busySlots.set(dateStr, []);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes();
    busySlots.get(dateStr).push({ start: startMin, end: endMin });
  });
}

// ==================== ЗАГРУЗКА ДАННЫХ ДОСТУПНОСТИ ====================
async function loadAvailabilityData() {
  const { data, error } = await supabase
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', getCurrentUser().id);

  if (error) { console.error('Ошибка загрузки расписания:', error); return; }

  availabilityData.clear();
  data?.forEach(item => {
    const normalizedDate = item.date.split('T')[0];
    availabilityData.set(normalizedDate, { ...item, date: normalizedDate });
  });
}

// ==================== ПОДСЧЁТ СВОБОДНЫХ СЛОТОВ ====================
function countFreeSlots(dateStr, startTime, endTime, slotDuration) {
    const busy = busySlots.get(dateStr) || [];
    const startMin = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);
    const endMin = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    
    let totalSlots = 0;
    let freeCount = 0;
    
    for (let slotStart = startMin; slotStart + slotDuration <= endMin; slotStart += slotDuration) {
      totalSlots++;
      const slotEnd = slotStart + slotDuration;
      const isOverlapping = busy.some(b => 
        (slotStart >= b.start && slotStart < b.end) || (slotEnd > b.start && slotEnd <= b.end) || (slotStart <= b.start && slotEnd >= b.end)
      );
      if (!isOverlapping) freeCount++;
    }
    
    return { total: totalSlots, free: freeCount };
  }

// ==================== КАЛЕНДАРЬ ====================
function initCalendar(modal) {
  const calendarEl = document.getElementById('availabilityCalendar');
  if (calendar) calendar.destroy();

  calendar = new FullCalendar.Calendar(calendarEl, {
    initialView: 'dayGridMonth', height: 'auto', locale: 'ru',
    dateClick: handleDateClick,
    dayCellDidMount: renderDayCell,
    headerToolbar: { left: 'prev,next today', center: 'title', right: '' }
  });
  calendar.render();

  // Отслеживаем Shift внутри модалки
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Shift') isShiftPressed = true;
  });
  modal.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') isShiftPressed = false;
  });
  modal.setAttribute('tabindex', '-1');
  modal.focus();

  calendarEl.addEventListener('contextmenu', (e) => {
    const cell = e.target.closest('.fc-day');
    if (!cell) return;
    e.preventDefault();
    const dateStr = cell.dataset.date;
    if (dateStr) showManualSettingsModal(dateStr);
  });
}

function renderDayCell(info) {
    const year = info.date.getFullYear();
    const month = String(info.date.getMonth() + 1).padStart(2, '0');
    const day = String(info.date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const data = availabilityData.get(dateStr);
    const cell = info.el;
  
    const dayNumber = cell.querySelector('.fc-daygrid-day-number');
    cell.innerHTML = '';
    if (dayNumber) cell.appendChild(dayNumber);
  
    cell.classList.remove('availability-available', 'availability-dayoff', 'availability-vacation', 'availability-notset', 'availability-selected');
  
    if (!data || data.status === 'not_set') {
      cell.classList.add('availability-notset');
    } else if (data.status === 'available') {
      cell.classList.add('availability-available');
      const timeDiv = document.createElement('div');
      timeDiv.style.cssText = 'font-size:10px;margin-top:4px;text-align:center;color:#2E7D32;';
      const start = data.start_time?.slice(0,5) || '10:00';
      const end = data.end_time?.slice(0,5) || '20:00';
      const slotDuration = data.slot_duration || 60;
      
      const { total, free } = countFreeSlots(dateStr, start, end, slotDuration);
      
      timeDiv.innerHTML = `${start}-${end}<br>🕒 Свободно ${free} из ${total}`;
      cell.appendChild(timeDiv);
    } else if (data.status === 'day_off') {
      cell.classList.add('availability-dayoff');
    } else if (data.status === 'vacation') {
      cell.classList.add('availability-vacation');
    }
    cell.dataset.date = dateStr;
  }

// ==================== КЛИК ПО ДНЮ ====================
function handleDateClick(info) {
  const dateStr = info.dateStr;
  const dayEl = info.dayEl;
  
  if (isShiftPressed) {
    if (selectedDates.has(dateStr)) {
      selectedDates.delete(dateStr);
      dayEl.classList.remove('availability-selected');
    } else {
      selectedDates.add(dateStr);
      dayEl.classList.add('availability-selected');
    }
    updateSelectedCount();
    return;
  }
  
  clearSelection();
  
  let data = availabilityData.get(dateStr);
  if (!data) {
    const settings = getGlobalSettings();
    data = { date: dateStr, status: 'available', start_time: settings.start_time, end_time: settings.end_time, slot_duration: settings.slot_duration };
  } else {
    const statusOrder = ['available', 'day_off', 'vacation', 'not_set'];
    const nextIndex = (statusOrder.indexOf(data.status) + 1) % statusOrder.length;
    data.status = statusOrder[nextIndex];
    if (data.status === 'available' && !data.start_time) {
      const settings = getGlobalSettings();
      data.start_time = settings.start_time; data.end_time = settings.end_time; data.slot_duration = settings.slot_duration;
    }
  }
  availabilityData.set(dateStr, data);

  if (dayEl) {
    const dayNumber = dayEl.querySelector('.fc-daygrid-day-number');
    dayEl.innerHTML = '';
    if (dayNumber) dayEl.appendChild(dayNumber);
    dayEl.classList.remove('availability-available', 'availability-dayoff', 'availability-vacation', 'availability-notset', 'availability-selected');
    if (data.status === 'available') {
        dayEl.classList.add('availability-available');
        const timeDiv = document.createElement('div');
        timeDiv.style.cssText = 'font-size:10px;margin-top:4px;text-align:center;color:#2E7D32;';
        const start = data.start_time?.slice(0,5) || '10:00';
        const end = data.end_time?.slice(0,5) || '20:00';
        const slotDuration = data.slot_duration || 60;
        
        const { total, free } = countFreeSlots(dateStr, start, end, slotDuration);
        
        timeDiv.innerHTML = `${start}-${end}<br>🕒 Свободно ${free} из ${total}`;
        dayEl.appendChild(timeDiv);
    } else if (data.status === 'day_off') {
      dayEl.classList.add('availability-dayoff');
    } else if (data.status === 'vacation') {
      dayEl.classList.add('availability-vacation');
    } else {
      dayEl.classList.add('availability-notset');
    }
    dayEl.dataset.date = dateStr;
  }
  updateDaySettings(dateStr);
}

function clearSelection() {
  selectedDates.forEach(date => {
    const el = document.querySelector(`.fc-day[data-date="${date}"]`);
    if (el) el.classList.remove('availability-selected');
  });
  selectedDates.clear();
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = selectedDates.size;
  const btn = document.getElementById('clearSelectionBtn');
  if (btn) {
    btn.textContent = `Сбросить выделение (${count})`;
    btn.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

// ==================== ОБНОВЛЕНИЕ ПАНЕЛИ ====================
function updateDaySettings(dateStr) {
  const data = availabilityData.get(dateStr);
  if (!data) { document.getElementById('currentDaySettings').style.display = 'none'; return; }
  selectedDate = dateStr;
  document.getElementById('selectedDateDisplay').textContent = new Date(dateStr).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  const statusNames = { 'available': { text: 'Рабочий день', class: 'available' }, 'day_off': { text: 'Выходной', class: 'dayoff' }, 'vacation': { text: 'Отпуск', class: 'vacation' }, 'not_set': { text: 'Не назначено', class: 'notset' } };
  const info = statusNames[data.status] || statusNames.not_set;
  const badge = document.getElementById('currentStatusBadge');
  badge.textContent = info.text; badge.className = 'status-badge ' + info.class;
  const isAvailable = data.status === 'available';
  document.getElementById('dayStartTime').value = data.start_time?.slice(0,5) || '10:00';
  document.getElementById('dayEndTime').value = data.end_time?.slice(0,5) || '20:00';
  document.getElementById('daySlotDuration').value = data.slot_duration || 60;
  document.getElementById('dayStartTime').disabled = !isAvailable;
  document.getElementById('dayEndTime').disabled = !isAvailable;
  document.getElementById('daySlotDuration').disabled = !isAvailable;
  document.getElementById('currentDaySettings').style.display = 'block';
}

// ==================== ПРИВЯЗКА СОБЫТИЙ ====================
function bindEvents(modal) {
  modal.querySelector('#saveGlobalSettingsBtn').addEventListener('click', () => {
    const start = modal.querySelector('#globalStartTime').value;
    const end = modal.querySelector('#globalEndTime').value;
    const slot = modal.querySelector('#globalSlotDuration').value;
    saveGlobalSettings(start, end, slot);
    showToast('Настройки по умолчанию сохранены!', 'success');
  });

  modal.querySelector('#clearDayBtn').addEventListener('click', () => {
    if (!selectedDate) return;
    availabilityData.delete(selectedDate);
    const dayEl = document.querySelector(`.fc-day[data-date="${selectedDate}"]`);
    if (dayEl) {
      const dayNumber = dayEl.querySelector('.fc-daygrid-day-number');
      dayEl.innerHTML = ''; if (dayNumber) dayEl.appendChild(dayNumber);
      dayEl.classList.remove('availability-available', 'availability-dayoff', 'availability-vacation', 'availability-selected');
      dayEl.classList.add('availability-notset');
    }
    document.getElementById('currentDaySettings').style.display = 'none';
  });

  modal.querySelector('#clearSelectionBtn').addEventListener('click', clearSelection);

  modal.querySelector('#dayStartTime').addEventListener('change', (e) => updateDayField('start_time', e.target.value));
  modal.querySelector('#dayEndTime').addEventListener('change', (e) => updateDayField('end_time', e.target.value));
  modal.querySelector('#daySlotDuration').addEventListener('change', (e) => updateDayField('slot_duration', parseInt(e.target.value)));

  modal.querySelector('#saveAvailabilityBtn').addEventListener('click', saveAllChanges);
}

function updateDayField(field, value) {
    if (!selectedDate) return;
    const data = availabilityData.get(selectedDate);
    if (data) {
      data[field] = value;
      availabilityData.set(selectedDate, data);
      const dayEl = document.querySelector(`.fc-day[data-date="${selectedDate}"]`);
      if (dayEl && data.status === 'available') {
        const timeDiv = dayEl.querySelector('div:not(.fc-daygrid-day-number)');
        if (timeDiv) {
          const start = data.start_time?.slice(0,5) || '10:00';
          const end = data.end_time?.slice(0,5) || '20:00';
          const slotDuration = data.slot_duration || 60;
          const { total, free } = countFreeSlots(selectedDate, start, end, slotDuration);
          timeDiv.innerHTML = `${start}-${end}<br>🕒 Свободно ${free} из ${total}`;
        }
      }
    }
  }

// ==================== СОХРАНЕНИЕ ====================
async function saveAllChanges() {
  const records = Array.from(availabilityData.values()).map(item => ({
    teacher_id: getCurrentUser().id,
    date: item.date.split('T')[0],
    status: item.status,
    start_time: item.start_time,
    end_time: item.end_time,
    slot_duration: item.slot_duration,
    updated_at: new Date().toISOString()
  }));

  try {
    await supabase.from('teacher_availability').delete().eq('teacher_id', getCurrentUser().id);
    if (records.length > 0) {
      const { error } = await supabase.from('teacher_availability').insert(records);
      if (error) throw error;
    }
    showToast('Расписание успешно сохранено!', 'success');
    setTimeout(() => document.querySelector('.modal.availability-modal')?.remove(), 500);
    if (typeof window.updateMainCalendarAvailability === 'function') window.updateMainCalendarAvailability();
  } catch (error) {
    showToast('Ошибка сохранения: ' + error.message, 'error');
  }
}

// ==================== МОДАЛКА РУЧНОЙ НАСТРОЙКИ ====================
function showManualSettingsModal(dateStr) {
    const hasSelection = selectedDates.size > 0;
    const targetDates = hasSelection ? Array.from(selectedDates) : [dateStr];
    const firstDate = targetDates[0];
    const data = availabilityData.get(firstDate) || { date: firstDate, status: 'not_set', start_time: '10:00', end_time: '20:00', slot_duration: 60 };
  
    const modal = document.createElement('div');
    modal.className = 'modal manual-settings-modal';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:400px;">
        <div class="modal-header"><h3>${hasSelection ? `Настройка ${targetDates.length} дней` : 'Настройка дня'}</h3><button class="close-modal">&times;</button></div>
        <div class="modal-body">
          ${hasSelection ? `<p>Применить к ${targetDates.length} выбранным дням</p>` : `<p><strong>${new Date(firstDate).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></p>`}
          <div class="form-group"><label>Статус</label>
            <select id="manualStatus">
              <option value="available" ${data.status==='available'?'selected':''}>Рабочий день</option>
              <option value="day_off" ${data.status==='day_off'?'selected':''}>Выходной</option>
              <option value="vacation" ${data.status==='vacation'?'selected':''}>Отпуск</option>
              <option value="not_set" ${data.status==='not_set'?'selected':''}>Не назначено</option>
            </select>
          </div>
          <div class="form-group" id="manualTimeGroup" style="display:${data.status==='available'?'block':'none'};">
            <label>Время начала</label><input type="time" id="manualStartTime" value="${data.start_time?.slice(0,5)||'10:00'}">
            <label style="margin-top:0.5rem;">Время окончания</label><input type="time" id="manualEndTime" value="${data.end_time?.slice(0,5)||'20:00'}">
            <label style="margin-top:0.5rem;">Длительность слота (мин)</label>
            <select id="manualSlotDuration">
              <option value="30" ${data.slot_duration===30?'selected':''}>30</option><option value="45" ${data.slot_duration===45?'selected':''}>45</option><option value="60" ${data.slot_duration===60?'selected':''}>60</option><option value="90" ${data.slot_duration===90?'selected':''}>90</option><option value="120" ${data.slot_duration===120?'selected':''}>120</option>
            </select>
          </div>
          ${hasSelection ? '' : '<p style="font-size:0.85rem;color:var(--text-secondary);">💡 Зажмите Shift для выбора нескольких дней</p>'}
        </div>
        <div class="modal-actions"><button class="btn btn-primary" id="saveManualSettingsBtn">Применить</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    const closeModal = () => modal.remove();
    modal.querySelector('.close-modal').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    
    const statusSelect = modal.querySelector('#manualStatus');
    const timeGroup = modal.querySelector('#manualTimeGroup');
    statusSelect.addEventListener('change', () => timeGroup.style.display = statusSelect.value === 'available' ? 'block' : 'none');
    
    modal.querySelector('#saveManualSettingsBtn').addEventListener('click', () => {
      const newStatus = statusSelect.value;
      const newStart = newStatus === 'available' ? modal.querySelector('#manualStartTime').value : null;
      const newEnd = newStatus === 'available' ? modal.querySelector('#manualEndTime').value : null;
      const newSlot = newStatus === 'available' ? parseInt(modal.querySelector('#manualSlotDuration').value) : null;
      
      targetDates.forEach(date => {
        const newData = { date, status: newStatus, start_time: newStart, end_time: newEnd, slot_duration: newSlot };
        availabilityData.set(date, newData);
        
        // ✅ Ищем ячейку и полностью перерисовываем
        const dayEl = document.querySelector(`.fc-day[data-date="${date}"]`);
        if (dayEl) {
          // Вызываем renderDayCell вручную для этой ячейки
          const year = parseInt(date.split('-')[0]);
          const month = parseInt(date.split('-')[1]) - 1;
          const day = parseInt(date.split('-')[2]);
          const fakeInfo = { date: new Date(year, month, day), el: dayEl };
          renderDayCell(fakeInfo);
        }
      });
      
      // Сбрасываем выделение
      clearSelection();
      
      // Обновляем панель для первого дня
      if (!hasSelection) updateDaySettings(firstDate);
      else {
        // Если было множественное выделение, скрываем панель
        document.getElementById('currentDaySettings').style.display = 'none';
      }
      
      closeModal();
      showToast(`Применено к ${targetDates.length} дню/дням`, 'success');
    });
  }

// ==================== ГЛОБАЛЬНЫЕ ОБРАБОТЧИКИ ====================
document.addEventListener('keydown', (e) => { if (e.key === 'Shift') isShiftPressed = true; });
document.addEventListener('keyup', (e) => { if (e.key === 'Shift') isShiftPressed = false; });