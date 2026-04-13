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



// После создания модалки
const importBtn = modal.querySelector('#importDataBtn');
const fileInput = modal.querySelector('#importFileInput');

if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await importTeacherData(file);
        fileInput.value = ''; // очищаем, чтобы можно было выбрать тот же файл повторно
    });
}




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

// После того как модалка создана и добавлена в DOM
const exportBtn = modal.querySelector('#exportDataBtn');
if (exportBtn) {
    exportBtn.addEventListener('click', exportTeacherData);
}

  // Закрытие
  modal.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => modal.remove());
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

// ==================== ЭКСПОРТ ДАННЫХ УЧИТЕЛЯ ====================
// ==================== КРАСИВЫЙ ЭКСПОРТ В EXCEL ====================
async function exportTeacherData() {
    showLoader();
    try {
        const user = getCurrentUser();
        if (!user) throw new Error('Не авторизован');

        // Загружаем все данные
        const [
            studentsRes,
            groupsRes,
            lessonsRes,
            paymentsRes,
            profileRes
        ] = await Promise.all([
            supabase.from('students').select('*, student_groups(group_name)').eq('teacher_id', user.id),
            supabase.from('student_groups').select('*').eq('teacher_id', user.id),
            supabase.from('lessons').select('*, student_groups(group_name), students(child_name)').eq('teacher_id', user.id),
            supabase.from('payments').select('*, students(child_name), student_groups(group_name)').eq('teacher_id', user.id),
            supabase.from('teacher_profiles').select('*').eq('id', user.id).single()
        ]);

        // Создаём новую книгу Excel
        const wb = XLSX.utils.book_new();

        // ===== ЛИСТ 1: ПРОФИЛЬ =====
        if (profileRes.data) {
            const p = profileRes.data;
            const profileData = [
                ['ПРОФИЛЬ ПРЕПОДАВАТЕЛЯ'],
                [],
                ['Имя', p.teacher_name || ''],
                ['Email', p.email || ''],
                ['Дата рождения', p.birthday ? new Date(p.birthday).toLocaleDateString('ru-RU') : ''],
                ['Тариф', p.subscription_plan || ''],
                ['Доступ до', p.access_until ? new Date(p.access_until).toLocaleDateString('ru-RU') : ''],
                ['Статус', p.activity_status || '']
            ];
            const wsProfile = XLSX.utils.aoa_to_sheet(profileData);
            wsProfile['!cols'] = [{ wch: 20 }, { wch: 30 }];
            XLSX.utils.book_append_sheet(wb, wsProfile, 'Профиль');
        }

        // ===== ЛИСТ 2: УЧЕНИКИ =====
        if (studentsRes.data && studentsRes.data.length > 0) {
            const studentsData = [
                ['Имя', 'Возраст', 'Родитель', 'Телефон', 'Группа', 'Статус', 'Заметка']
            ];
            studentsRes.data.forEach(s => {
                studentsData.push([
                    s.child_name || '',
                    s.child_age || '',
                    s.parent_name || '',
                    s.phone_number || '',
                    s.student_groups?.group_name || '',
                    s.status === 'active' ? 'Активен' : 'Неактивен',
                    s.parent_pain || ''
                ]);
            });
            const wsStudents = XLSX.utils.aoa_to_sheet(studentsData);
            wsStudents['!cols'] = [
                { wch: 20 }, { wch: 8 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 30 }
            ];
            XLSX.utils.book_append_sheet(wb, wsStudents, 'Ученики');
        }

        // ===== ЛИСТ 3: ГРУППЫ =====
        if (groupsRes.data && groupsRes.data.length > 0) {
            const groupsData = [
                ['Название группы', 'Предмет', 'Заметки']
            ];
            groupsRes.data.forEach(g => {
                groupsData.push([
                    g.group_name || '',
                    g.subject || '',
                    g.notes || ''
                ]);
            });
            const wsGroups = XLSX.utils.aoa_to_sheet(groupsData);
            wsGroups['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsGroups, 'Группы');
        }

        // ===== ЛИСТ 4: УРОКИ =====
        if (lessonsRes.data && lessonsRes.data.length > 0) {
            const lessonsData = [
                ['Дата', 'Тема', 'Группа/Ученик', 'Статус', 'Заметки']
            ];
            lessonsRes.data.forEach(l => {
                const related = l.student_groups?.group_name || l.students?.child_name || '';
                const statusText = {
                    'planned': 'Запланирован',
                    'completed': 'Проведён',
                    'cancelled': 'Отменён',
                    'rescheduled': 'Перенесён'
                }[l.status] || l.status;
                lessonsData.push([
                    l.lesson_date ? new Date(l.lesson_date).toLocaleString('ru-RU') : '',
                    l.topic || '',
                    related,
                    statusText,
                    l.notes || ''
                ]);
            });
            const wsLessons = XLSX.utils.aoa_to_sheet(lessonsData);
            wsLessons['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsLessons, 'Уроки');
        }

        // ===== ЛИСТ 5: ПЛАТЕЖИ =====
        if (paymentsRes.data && paymentsRes.data.length > 0) {
            const paymentsData = [
                ['Дата', 'Ученик', 'Группа', 'Сумма (₽)', 'Уроков', 'Период', 'Заметка', 'Статус']
            ];
            paymentsRes.data.forEach(p => {
                const period = p.period_start ? `${p.period_start} – ${p.period_end}` : '';
                paymentsData.push([
                    p.payment_date || '',
                    p.students?.child_name || '',
                    p.student_groups?.group_name || '',
                    p.amount || '',
                    p.lessons_paid || '',
                    period,
                    p.description || '',
                    p.status === 'paid' ? 'Оплачен' : 'Отменён'
                ]);
            });
            const wsPayments = XLSX.utils.aoa_to_sheet(paymentsData);
            wsPayments['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, wsPayments, 'Платежи');
        }

        // Сохраняем файл
        const fileName = `SimpleEd_backup_${new Date().toISOString().slice(0,10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

    } catch (err) {
        console.error('Ошибка экспорта:', err);
        alert('Не удалось экспортировать данные: ' + err.message);
    } finally {
        hideLoader();
    }
}

// ==================== ИМПОРТ ДАННЫХ ИЗ EXCEL (С КОРРЕКТНОЙ ОБРАБОТКОЙ ДАТ) ====================
async function importTeacherData(file) {
    showLoader();
    try {
        const user = getCurrentUser();
        if (!user) throw new Error('Не авторизован');

        // Читаем файл
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });
        
        const results = {
            students: { added: 0, updated: 0, skipped: 0 },
            groups: { added: 0, updated: 0, skipped: 0 },
            lessons: { added: 0, updated: 0, skipped: 0 },
            payments: { added: 0, updated: 0, skipped: 0 }
        };

        // Вспомогательная функция для преобразования даты Excel в строку YYYY-MM-DD
        function excelDateToISOString(value) {
            if (!value) return null;
            
            // Если это уже строка в формате даты
            if (typeof value === 'string') {
                const parsed = new Date(value);
                if (!isNaN(parsed.getTime())) {
                    return parsed.toISOString().split('T')[0];
                }
                return null;
            }
            
            // Если это число (серийный номер Excel)
            if (typeof value === 'number') {
                // Excel начинает отсчёт с 1900-01-01 (с учётом бага високосного года 1900)
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
                if (!isNaN(date.getTime())) {
                    return date.toISOString().split('T')[0];
                }
            }
            
            // Если это объект Date
            if (value instanceof Date) {
                return value.toISOString().split('T')[0];
            }
            
            return null;
        }

        function excelDateTimeToISOString(value) {
            if (!value) return null;
            
            if (typeof value === 'string') {
                const parsed = new Date(value);
                if (!isNaN(parsed.getTime())) {
                    return parsed.toISOString();
                }
                return null;
            }
            
            if (typeof value === 'number') {
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
                if (!isNaN(date.getTime())) {
                    return date.toISOString();
                }
            }
            
            if (value instanceof Date) {
                return value.toISOString();
            }
            
            return null;
        }

        // ===== ИМПОРТ ГРУПП =====
        const groupsSheet = workbook.Sheets['Группы'];
        if (groupsSheet) {
            const groupsData = XLSX.utils.sheet_to_json(groupsSheet, { header: 1 });
            for (let i = 1; i < groupsData.length; i++) {
                const row = groupsData[i];
                if (!row[0]) continue;
                
                const groupName = String(row[0]).trim();
                const subject = row[1] ? String(row[1]).trim() : null;
                const notes = row[2] ? String(row[2]).trim() : null;
                
                const { data: existing } = await supabase
                    .from('student_groups')
                    .select('id')
                    .eq('teacher_id', user.id)
                    .eq('group_name', groupName)
                    .maybeSingle();
                
                if (existing) {
                    await supabase
                        .from('student_groups')
                        .update({ subject, notes })
                        .eq('id', existing.id);
                    results.groups.updated++;
                } else {
                    await supabase
                        .from('student_groups')
                        .insert({
                            teacher_id: user.id,
                            group_name: groupName,
                            subject,
                            notes
                        });
                    results.groups.added++;
                }
            }
        }

        // Загружаем свежий список групп
        const { data: groupsList } = await supabase
            .from('student_groups')
            .select('id, group_name')
            .eq('teacher_id', user.id);
        
        const groupMap = new Map();
        groupsList?.forEach(g => groupMap.set(g.group_name, g.id));

        // ===== ИМПОРТ УЧЕНИКОВ =====
        const studentsSheet = workbook.Sheets['Ученики'];
        if (studentsSheet) {
            const studentsData = XLSX.utils.sheet_to_json(studentsSheet, { header: 1 });
            for (let i = 1; i < studentsData.length; i++) {
                const row = studentsData[i];
                if (!row[0]) continue;
                
                const childName = String(row[0]).trim();
                const childAge = row[1] ? parseInt(row[1]) : null;
                const parentName = row[2] ? String(row[2]).trim() : null;
                const phone = row[3] ? String(row[3]).trim() : null;
                const groupName = row[4] ? String(row[4]).trim() : null;
                const statusText = row[5] ? String(row[5]).toLowerCase() : '';
                const status = statusText.includes('актив') ? 'active' : 'inactive';
                const parentPain = row[6] ? String(row[6]).trim() : null;
                
                const groupId = groupName ? groupMap.get(groupName) : null;
                
                const { data: existing } = await supabase
                    .from('students')
                    .select('id')
                    .eq('teacher_id', user.id)
                    .eq('child_name', childName)
                    .maybeSingle();
                
                const studentData = {
                    teacher_id: user.id,
                    child_name: childName,
                    child_age: childAge,
                    parent_name: parentName,
                    phone_number: phone,
                    group_id: groupId,
                    status,
                    parent_pain: parentPain
                };
                
                if (existing) {
                    await supabase.from('students').update(studentData).eq('id', existing.id);
                    results.students.updated++;
                } else {
                    await supabase.from('students').insert(studentData);
                    results.students.added++;
                }
            }
        }

        // Загружаем учеников для маппинга
        const { data: studentsList } = await supabase
            .from('students')
            .select('id, child_name')
            .eq('teacher_id', user.id);
        
        const studentMap = new Map();
        studentsList?.forEach(s => studentMap.set(s.child_name, s.id));

        // ===== ИМПОРТ УРОКОВ =====
        const lessonsSheet = workbook.Sheets['Уроки'];
        if (lessonsSheet) {
            const lessonsData = XLSX.utils.sheet_to_json(lessonsSheet, { header: 1 });
            
            const { data: existingLessons } = await supabase
                .from('lessons')
                .select('id, lesson_date, group_id, student_id')
                .eq('teacher_id', user.id);
            
            const lessonKeys = new Set();
            existingLessons?.forEach(l => {
                const key = `${l.lesson_date}|${l.group_id || ''}|${l.student_id || ''}`;
                lessonKeys.add(key);
            });
            
            for (let i = 1; i < lessonsData.length; i++) {
                const row = lessonsData[i];
                if (!row[0]) continue;
                
                // Преобразуем дату урока
                const lessonDate = excelDateTimeToISOString(row[0]);
                if (!lessonDate) {
                    console.warn('Не удалось распарсить дату урока:', row[0]);
                    continue;
                }
                
                const topic = row[1] ? String(row[1]).trim() : null;
                const relatedName = row[2] ? String(row[2]).trim() : '';
                const statusText = row[3] ? String(row[3]) : '';
                const statusMap = {
                    'Запланирован': 'planned',
                    'Проведён': 'completed',
                    'Отменён': 'cancelled',
                    'Перенесён': 'rescheduled'
                };
                const status = statusMap[statusText] || 'planned';
                const notes = row[4] ? String(row[4]).trim() : null;
                
                let groupId = groupMap.get(relatedName);
                let studentId = studentMap.get(relatedName);
                
                const key = `${lessonDate}|${groupId || ''}|${studentId || ''}`;
                
                if (lessonKeys.has(key)) {
                    results.lessons.skipped++;
                    continue;
                }
                
                const lessonData = {
                    teacher_id: user.id,
                    lesson_date: lessonDate,
                    topic,
                    group_id: groupId || null,
                    student_id: studentId || null,
                    status,
                    notes
                };
                
                await supabase.from('lessons').insert(lessonData);
                results.lessons.added++;
                lessonKeys.add(key);
            }
        }

        // ===== ИМПОРТ ПЛАТЕЖЕЙ =====
        const paymentsSheet = workbook.Sheets['Платежи'];
        if (paymentsSheet) {
            const paymentsData = XLSX.utils.sheet_to_json(paymentsSheet, { header: 1 });
            
            const { data: existingPayments } = await supabase
                .from('payments')
                .select('id, payment_date, student_id, amount, lessons_paid')
                .eq('teacher_id', user.id);
            
            const paymentKeys = new Set();
            existingPayments?.forEach(p => {
                const key = `${p.payment_date}|${p.student_id}|${p.amount}|${p.lessons_paid}`;
                paymentKeys.add(key);
            });
            
            for (let i = 1; i < paymentsData.length; i++) {
                const row = paymentsData[i];
                if (!row[0]) continue;
                
                const paymentDate = excelDateToISOString(row[0]);
                if (!paymentDate) {
                    console.warn('Не удалось распарсить дату платежа:', row[0]);
                    continue;
                }
                
                const studentName = row[1] ? String(row[1]).trim() : '';
                const groupName = row[2] ? String(row[2]).trim() : '';
                const amount = row[3] ? parseFloat(row[3]) : null;
                const lessonsPaid = row[4] ? parseInt(row[4]) : null;
                const period = row[5] ? String(row[5]).trim() : '';
                const description = row[6] ? String(row[6]).trim() : null;
                const statusText = row[7] ? String(row[7]).toLowerCase() : '';
                const status = statusText.includes('оплач') ? 'paid' : 'cancelled';
                
                const studentId = studentMap.get(studentName);
                const groupId = groupMap.get(groupName);
                
                if (!studentId) {
                    results.payments.skipped++;
                    continue;
                }
                
                let periodStart = null, periodEnd = null;
                if (period && period.includes('–')) {
                    const parts = period.split('–').map(s => s.trim());
                    periodStart = excelDateToISOString(parts[0]) || parts[0];
                    periodEnd = excelDateToISOString(parts[1]) || parts[1];
                }
                
                const key = `${paymentDate}|${studentId}|${amount}|${lessonsPaid}`;
                if (paymentKeys.has(key)) {
                    results.payments.skipped++;
                    continue;
                }
                
                const paymentData = {
                    teacher_id: user.id,
                    payment_date: paymentDate,
                    student_id: studentId,
                    group_id: groupId || null,
                    amount,
                    lessons_paid: lessonsPaid,
                    period_start: periodStart,
                    period_end: periodEnd,
                    description,
                    status
                };
                
                await supabase.from('payments').insert(paymentData);
                results.payments.added++;
                paymentKeys.add(key);
            }
        }

        // Показываем итоги
        const message = `
Импорт завершён!

Группы: добавлено ${results.groups.added}, обновлено ${results.groups.updated}
Ученики: добавлено ${results.students.added}, обновлено ${results.students.updated}
Уроки: добавлено ${results.lessons.added}, пропущено ${results.lessons.skipped}
Платежи: добавлено ${results.payments.added}, пропущено ${results.payments.skipped}
        `.trim();
        
        alert(message);

    } catch (err) {
        console.error('Ошибка импорта:', err);
        alert('Не удалось импортировать данные: ' + err.message);
    } finally {
        hideLoader();
    }
}