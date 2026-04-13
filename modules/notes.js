// modules/notes.js
import supabase from './supabaseClient.js';
import { getCurrentUser } from './auth.js';
import { renderPage } from './ui.js';
import { fetchStudentsForSelect } from './students.js';
import { fetchGroupsForSelect } from './groups.js';

// --- КЭШ ---
let notesList = [];
let notesLoaded = false;
let currentNoteId = null;
let students = [];
let groups = [];
let folders = new Set();

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
export async function initNotesPage() {
  renderPage('notes');
  
  if (!notesLoaded) {
    await loadData();
    notesLoaded = true;
  }
  renderFilters();
  renderNotesList();
  bindEvents();
}

async function loadData() {
  const [notesRes, studentsRes, groupsRes] = await Promise.all([
    supabase.from('notes').select('*').eq('teacher_id', getCurrentUser().id).order('updated_at', { ascending: false }),
    fetchStudentsForSelect(),
    fetchGroupsForSelect()
  ]);
  if (notesRes.error) console.error(notesRes.error);
  notesList = notesRes.data || [];
  students = studentsRes || [];
  groups = groupsRes || [];
  
  // Собираем папки
  folders.clear();
  notesList.forEach(n => { if (n.folder) folders.add(n.folder); });
}

// ==================== ФИЛЬТРЫ ====================
function renderFilters() {
  const folderSelect = document.getElementById('folderFilterSelect');
  const studentSelect = document.getElementById('studentFilterSelect');
  const groupSelect = document.getElementById('groupFilterSelect');
  
  folderSelect.innerHTML = '<option value="">Все папки</option>';
  [...folders].sort().forEach(f => {
    folderSelect.innerHTML += `<option value="${f}">${f}</option>`;
  });
  
  studentSelect.innerHTML = '<option value="">Все ученики</option>';
  students.forEach(s => {
    studentSelect.innerHTML += `<option value="${s.id}">${s.child_name}</option>`;
  });
  
  groupSelect.innerHTML = '<option value="">Все группы</option>';
  groups.forEach(g => {
    groupSelect.innerHTML += `<option value="${g.id}">${g.group_name}</option>`;
  });
}

function getFilteredNotes() {
  const search = document.getElementById('notesSearchInput')?.value.trim().toLowerCase() || '';
  const folder = document.getElementById('folderFilterSelect')?.value || '';
  const studentId = document.getElementById('studentFilterSelect')?.value || '';
  const groupId = document.getElementById('groupFilterSelect')?.value || '';
  
  return notesList.filter(note => {
    if (search && !note.title?.toLowerCase().includes(search)) return false;
    if (folder && note.folder !== folder) return false;
    if (studentId && note.student_id !== studentId) return false;
    if (groupId && note.group_id !== groupId) return false;
    return true;
  });
}

// ==================== РЕНДЕРИНГ СПИСКА ====================
function renderNotesList() {
  const container = document.getElementById('notesListContainer');
  if (!container) return;
  
  const filtered = getFilteredNotes();
  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-muted">Нет заметок</p>';
    return;
  }
  
  container.innerHTML = filtered.map(note => `
    <div class="note-item ${note.id === currentNoteId ? 'active' : ''}" data-id="${note.id}">
      <div class="note-item-title">${escapeHtml(note.title) || 'Без названия'}</div>
      <div class="note-item-meta">
        ${note.folder ? `<span class="badge">${escapeHtml(note.folder)}</span>` : ''}
        <span class="note-item-date">${new Date(note.updated_at).toLocaleDateString()}</span>
      </div>
    </div>
  `).join('');
  
  container.querySelectorAll('.note-item').forEach(el => {
    el.addEventListener('click', () => selectNote(el.dataset.id));
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==================== РЕДАКТОР ====================
function selectNote(id) {
  currentNoteId = id;
  const note = notesList.find(n => n.id === id);
  renderNotesList();
  renderEditor(note);
}

function renderEditor(note) {
  const container = document.getElementById('notesEditorContainer');
  if (!container) return;
  
  if (!note) {
    container.innerHTML = `
      <div class="notes-editor-placeholder">
        <i class="fas fa-sticky-note" style="font-size: 3rem; color: var(--neutral-gray);"></i>
        <p>Выберите или создайте заметку</p>
      </div>
    `;
    return;
  }
  
  const studentName = students.find(s => s.id === note.student_id)?.child_name || '';
  const groupName = groups.find(g => g.id === note.group_id)?.group_name || '';
  
  container.innerHTML = `
    <form class="note-editor-form" id="noteEditorForm">
      <div class="form-row">
        <div class="form-group">
          <label>Название *</label>
          <input type="text" id="noteTitle" value="${escapeHtml(note.title) || ''}" required>
        </div>
        <div class="form-group">
          <label>Папка</label>
          <input type="text" id="noteFolder" value="${escapeHtml(note.folder) || ''}" list="folderDatalist" placeholder="Новая или существующая">
          <datalist id="folderDatalist">
            ${[...folders].map(f => `<option value="${f}">`).join('')}
          </datalist>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Ученик</label>
          <select id="noteStudent">
            <option value="">Не выбрано</option>
            ${students.map(s => `<option value="${s.id}" ${note.student_id === s.id ? 'selected' : ''}>${s.child_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Группа</label>
          <select id="noteGroup">
            <option value="">Не выбрано</option>
            ${groups.map(g => `<option value="${g.id}" ${note.group_id === g.id ? 'selected' : ''}>${g.group_name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Предмет / тема</label>
        <input type="text" id="noteSubject" value="${escapeHtml(note.subject) || ''}">
      </div>
      <div class="form-group">
        <label>Содержание</label>
        <textarea id="noteContent" rows="8">${escapeHtml(note.content) || ''}</textarea>
      </div>
      <div class="note-editor-actions">
        <button type="button" class="btn btn-danger" id="deleteNoteBtn"><i class="fas fa-trash"></i> Удалить</button>
        <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Сохранить</button>
      </div>
    </form>
  `;
  
  document.getElementById('noteEditorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCurrentNote();
  });
  document.getElementById('deleteNoteBtn').addEventListener('click', async () => {
    if (confirm('Удалить заметку?')) await deleteCurrentNote();
  });
}

// ==================== СОХРАНЕНИЕ ====================
async function saveCurrentNote() {
  const title = document.getElementById('noteTitle')?.value.trim();
  if (!title) { alert('Введите название'); return; }
  
  const folder = document.getElementById('noteFolder')?.value.trim() || null;
  const studentId = document.getElementById('noteStudent')?.value || null;
  const groupId = document.getElementById('noteGroup')?.value || null;
  const subject = document.getElementById('noteSubject')?.value.trim() || null;
  const content = document.getElementById('noteContent')?.value.trim() || null;
  
  const noteData = {
    teacher_id: getCurrentUser().id,
    title,
    folder,
    student_id: studentId,
    group_id: groupId,
    subject,
    content,
    updated_at: new Date().toISOString()
  };
  
  let savedNote;
  if (currentNoteId) {
    const { data, error } = await supabase.from('notes').update(noteData).eq('id', currentNoteId).select().single();
    if (error) { alert('Ошибка: ' + error.message); return; }
    savedNote = data;
    const idx = notesList.findIndex(n => n.id === currentNoteId);
    if (idx !== -1) notesList[idx] = savedNote;
  } else {
    const { data, error } = await supabase.from('notes').insert({ ...noteData, created_at: new Date().toISOString() }).select().single();
    if (error) { alert('Ошибка: ' + error.message); return; }
    savedNote = data;
    notesList.unshift(savedNote);
  }
  
  if (savedNote.folder) folders.add(savedNote.folder);
  currentNoteId = savedNote.id;
  renderFilters();
  renderNotesList();
  renderEditor(savedNote);
}

async function deleteCurrentNote() {
  if (!currentNoteId) return;
  const { error } = await supabase.from('notes').delete().eq('id', currentNoteId);
  if (error) { alert('Ошибка удаления'); return; }
  notesList = notesList.filter(n => n.id !== currentNoteId);
  currentNoteId = null;
  renderFilters();
  renderNotesList();
  renderEditor(null);
}

// ==================== НОВАЯ ЗАМЕТКА ====================
function createNewNote() {
  currentNoteId = null;
  renderNotesList();
  const container = document.getElementById('notesEditorContainer');
  container.innerHTML = `
    <form class="note-editor-form" id="noteEditorForm">
      <div class="form-row">
        <div class="form-group"><label>Название *</label><input type="text" id="noteTitle" required autofocus></div>
        <div class="form-group"><label>Папка</label><input type="text" id="noteFolder" list="folderDatalist"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Ученик</label><select id="noteStudent"><option value="">Не выбрано</option>${students.map(s => `<option value="${s.id}">${s.child_name}</option>`).join('')}</select></div>
        <div class="form-group"><label>Группа</label><select id="noteGroup"><option value="">Не выбрано</option>${groups.map(g => `<option value="${g.id}">${g.group_name}</option>`).join('')}</select></div>
      </div>
      <div class="form-group"><label>Предмет / тема</label><input type="text" id="noteSubject"></div>
      <div class="form-group"><label>Содержание</label><textarea id="noteContent" rows="8"></textarea></div>
      <div class="note-editor-actions">
        <button type="submit" class="btn btn-primary">Сохранить</button>
      </div>
    </form>
  `;
  document.getElementById('noteEditorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveCurrentNote();
  });
}

// ==================== ПРИВЯЗКА ====================
function bindEvents() {
  document.getElementById('newNoteBtn')?.addEventListener('click', createNewNote);
  document.getElementById('notesSearchInput')?.addEventListener('input', renderNotesList);
  document.getElementById('folderFilterSelect')?.addEventListener('change', renderNotesList);
  document.getElementById('studentFilterSelect')?.addEventListener('change', renderNotesList);
  document.getElementById('groupFilterSelect')?.addEventListener('change', renderNotesList);
  document.getElementById('clearFiltersBtn')?.addEventListener('click', () => {
    document.getElementById('notesSearchInput').value = '';
    document.getElementById('folderFilterSelect').value = '';
    document.getElementById('studentFilterSelect').value = '';
    document.getElementById('groupFilterSelect').value = '';
    renderNotesList();
  });
}

export function resetNotesCache() {
  notesLoaded = false;
  notesList = [];
  currentNoteId = null;
}