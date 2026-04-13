// modules/profile.js
import supabase from './supabaseClient.js';
import { getCurrentUser, getTeacherProfile, updateTeacherProfile, fetchTeacherProfile } from './auth.js';

// Простые функции лоадера (без импорта из ui.js, чтобы не трогать его)
function showLoader() {
  document.getElementById('globalLoader')?.classList.remove('hidden');
}
function hideLoader() {
  document.getElementById('globalLoader')?.classList.add('hidden');
}

/**
 * Открывает модальное окно профиля учителя
 */
export async function openProfileModal() {
  if (document.querySelector('.modal.profile-modal')) return;

  const template = document.getElementById('profileModalTemplate');
  if (!template) {
    console.error('Шаблон profileModalTemplate не найден');
    return;
  }

  const clone = template.content.cloneNode(true);
  const modal = clone.querySelector('.modal');
  modal.classList.add('profile-modal');
  document.body.appendChild(modal);

  const nameInput = modal.querySelector('#teacherName');
  const birthdayInput = modal.querySelector('#teacherBirthday');
  const emailInput = modal.querySelector('#teacherEmail');
  const errorDiv = modal.querySelector('#profileFormError');

  // Загружаем данные
  showLoader();
  try {
    const profile = await fetchTeacherProfile();
    const user = getCurrentUser();
    nameInput.value = profile?.teacher_name || '';
    birthdayInput.value = profile?.birthday || '';
    emailInput.value = user?.email || '';
  } catch (err) {
    console.error('Ошибка загрузки профиля:', err);
    errorDiv.textContent = 'Не удалось загрузить данные';
  } finally {
    hideLoader();
  }

  // Сохранение
  modal.querySelector('#profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = nameInput.value.trim();
    if (!newName) {
      errorDiv.textContent = 'Введите имя';
      return;
    }

    showLoader();
    try {
      await updateTeacherProfile({
        teacher_name: newName,
        birthday: birthdayInput.value || null
      });
      
      // Обновляем имя в шапке
      const teacherNameSpan = document.getElementById('teacherNameDisplay');
      const userAvatar = document.getElementById('userAvatar');
      if (teacherNameSpan) teacherNameSpan.textContent = newName;
      if (userAvatar) userAvatar.textContent = newName.charAt(0).toUpperCase();
      
      modal.remove();
    } catch (err) {
      console.error('Ошибка сохранения:', err);
      errorDiv.textContent = `Ошибка: ${err.message}`;
    } finally {
      hideLoader();
    }
  });

  // Закрытие
  modal.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}