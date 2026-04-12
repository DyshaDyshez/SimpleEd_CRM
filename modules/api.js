// modules/api.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

// ----- ГРУППЫ -----
export async function fetchGroups() {
  const { data, error } = await supabase
    .from('student_groups')
    .select('*')
    .eq('teacher_id', getCurrentUser().id)
    .order('group_name');
  if (error) throw error;
  return data || [];
}

export async function createGroup(groupData) {
  const { error } = await supabase
    .from('student_groups')
    .insert({ ...groupData, teacher_id: getCurrentUser().id });
  if (error) throw error;
}

export async function updateGroup(id, updates) {
  const { error } = await supabase
    .from('student_groups')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteGroup(id) {
  const { error } = await supabase.from('student_groups').delete().eq('id', id);
  if (error) throw error;
}

// ----- УЧЕНИКИ (для групп) -----
export async function fetchGroupStudents(groupId) {
  const { data, error } = await supabase
    .from('students')
    .select('id, child_name, child_age, parent_name, phone_number')
    .eq('group_id', groupId);
  if (error) throw error;
  return data || [];
}

export async function fetchAvailableStudents() {
  const { data, error } = await supabase
    .from('students')
    .select('id, child_name')
    .eq('teacher_id', getCurrentUser().id)
    .is('group_id', null);
  if (error) throw error;
  return data || [];
}

export async function addStudentToGroup(studentId, groupId) {
  const { error } = await supabase
    .from('students')
    .update({ group_id: groupId })
    .eq('id', studentId);
  if (error) throw error;
}

export async function removeStudentFromGroup(studentId) {
  const { error } = await supabase
    .from('students')
    .update({ group_id: null })
    .eq('id', studentId);
  if (error) throw error;
}

// ----- УРОКИ -----
export async function fetchGroupLessons(groupId) {
  const { data, error } = await supabase
    .from('lessons')
    .select('id, lesson_date, topic')
    .eq('group_id', groupId)
    .order('lesson_date', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createLesson(lessonData) {
  const { error } = await supabase
    .from('lessons')
    .insert({ ...lessonData, teacher_id: getCurrentUser().id });
  if (error) throw error;
}

export async function deleteLesson(id) {
  const { error } = await supabase.from('lessons').delete().eq('id', id);
  if (error) throw error;
}