// modules/helpers.js

/**
 * Форматирует дату в российский формат "ДД месяц, ЧЧ:ММ"
 * @param {string|Date} date - дата в формате ISO или объект Date
 * @returns {string} отформатированная строка
 */
export function formatLessonDate(date) {
    if (!date) return 'Нет занятий';
    return new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  /**
   * Безопасно получает значение поля формы по ID
   * @param {string} id - ID элемента формы
   * @returns {string} обрезанное значение или пустая строка
   */
  export function getFormValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }
  
  /**
   * Показывает простое уведомление об ошибке в указанном контейнере
   * @param {string} containerId - ID контейнера для ошибки
   * @param {string} message - текст ошибки
   */
  export function showFormError(containerId, message) {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }
  
  /**
   * Скрывает контейнер с ошибкой
   * @param {string} containerId - ID контейнера
   */
  export function clearFormError(containerId) {
    const el = document.getElementById(containerId);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }
  
  /**
   * Проверяет, не пустое ли значение, и возвращает его или null
   * @param {string} value - строка для проверки
   * @returns {string|null}
   */
  export function optional(value) {
    return value && value.trim() !== '' ? value.trim() : null;
  }