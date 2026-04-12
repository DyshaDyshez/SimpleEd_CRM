// auth.js
import supabase from './supabaseClient.js';

let currentUser = null;
let teacherProfile = null;

// Экспортируем только то, что нужно другим модулям
export async function initializeAuth() {
  const { data: user } = await supabase.auth.getUser();
  currentUser = user?.user || null;
  if (!currentUser) {
    window.location.href = 'auth.html';
    return false;
  }

  // Загружаем профиль учителя
  const { data: profile } = await supabase
    .from('teacher_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  teacherProfile = profile || null;
  return true;
}

export function getCurrentUser() {
  return currentUser;
}

export function getTeacherProfile() {
  return teacherProfile;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = 'auth.html';
}