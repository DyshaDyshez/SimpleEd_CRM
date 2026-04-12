// modules/modal.js

/**
 * Создаёт модальное окно и добавляет его в body
 * @param {Object} options - настройки окна
 * @param {string} options.title - заголовок
 * @param {string} options.content - HTML-содержимое (без кнопок)
 * @param {Array} options.actions - массив кнопок [{ text, class, handler }]
 * @param {string} options.className - дополнительный класс для модалки
 * @returns {HTMLElement} созданное модальное окно (уже в DOM)
 */
export function createModal({ title, content, actions = [], className = '' }) {
    const modal = document.createElement('div');
    modal.className = `modal ${className}`.trim();
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-actions">
          ${actions.map(a => `<button class="btn ${a.class || ''}">${a.text}</button>`).join('')}
        </div>
      </div>
    `;
  
    // Привязываем обработчики к кнопкам
    const actionButtons = modal.querySelectorAll('.modal-actions .btn');
    actions.forEach((action, index) => {
      if (action.handler && actionButtons[index]) {
        actionButtons[index].addEventListener('click', async (e) => {
          e.preventDefault();
          await action.handler(modal);
        });
      }
    });
  
    // Закрытие по крестику и клику на фон
    modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  
    document.body.appendChild(modal);
    return modal;
  }
  
  /**
   * Показывает простое окно подтверждения
   * @param {string} message - текст вопроса
   * @returns {Promise<boolean>} true если подтверждено
   */
  export function confirmModal(message) {
    return new Promise((resolve) => {
      const modal = createModal({
        title: 'Подтверждение',
        content: `<p>${message}</p>`,
        actions: [
          { text: 'Да', class: 'btn-primary', handler: () => { modal.remove(); resolve(true); } },
          { text: 'Отмена', class: 'btn-secondary', handler: () => { modal.remove(); resolve(false); } }
        ]
      });
    });
  }
  
  /**
   * Показывает модалку с формой и возвращает данные при сохранении
   * @param {string} title - заголовок
   * @param {string} formHtml - HTML формы (без кнопок)
   * @param {Function} onSave - функция, вызываемая при сохранении, получает данные формы
   */
  export function formModal(title, formHtml, onSave) {
    const modal = createModal({
      title,
      content: formHtml,
      actions: [
        { text: 'Сохранить', class: 'btn-primary', handler: async () => {
          const form = modal.querySelector('form');
          if (form && form.checkValidity && !form.checkValidity()) {
            form.reportValidity();
            return;
          }
          const formData = new FormData(form);
          const data = Object.fromEntries(formData.entries());
          await onSave(data, modal);
        }},
        { text: 'Отмена', class: 'btn-secondary', handler: () => modal.remove() }
      ]
    });
    return modal;
  }