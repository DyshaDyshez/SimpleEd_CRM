// modules/auth.js
import supabase from './supabaseClient.js';

let currentUser = null;
let teacherProfile = null;

export async function initializeAuth() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    console.warn('Пользователь не авторизован');
    window.location.href = 'auth.html';
    return false;
  }
  currentUser = user;

  const { data: profile } = await supabase
    .from('teacher_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    const defaultName = user.email?.split('@')[0] || 'Учитель';
    const { data: newProfile } = await supabase
      .from('teacher_profiles')
      .insert({ id: user.id, teacher_name: defaultName })
      .select('*')
      .single();
    teacherProfile = newProfile;
  } else {
    teacherProfile = profile;
  }
  return true;
}

export function getCurrentUser() {
  return currentUser;
}

export function getTeacherProfile() {
  return teacherProfile;
}

export async function updateTeacherProfile(updates) {
  if (!currentUser) throw new Error('Не авторизован');
  const { data, error } = await supabase
    .from('teacher_profiles')
    .update(updates)
    .eq('id', currentUser.id)
    .select('*')
    .single();
  if (error) throw error;
  teacherProfile = data;
  return data;
}

export async function fetchTeacherProfile() {
  if (!currentUser) return null;
  const { data, error } = await supabase
    .from('teacher_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) throw error;
  teacherProfile = data;
  return data;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Ошибка выхода:', error);
    alert('Не удалось выйти');
    return;
  }
  currentUser = null;
  teacherProfile = null;
  window.location.href = 'auth.html';
}