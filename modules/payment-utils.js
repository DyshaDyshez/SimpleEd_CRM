// modules/payment-utils.js
import supabase from './supabaseClient.js';

/**
 * Находит подходящую оплату для списания урока.
 * Правила:
 * 1. Оплата должна быть для этого ученика.
 * 2. Дата оплаты РАНЬШЕ или РАВНА дате урока.
 * 3. В оплате ещё остались неиспользованные уроки (lessons_used < lessons_paid).
 * 4. Берётся самая НОВАЯ оплата (LIFO - Last In First Out).
 * 
 * @param {string} studentId - ID ученика
 * @param {string} lessonDate - Дата урока (ISO строка)
 * @returns {object|null} - Объект оплаты или null, если подходящей нет
 */
export async function findAvailablePayment(studentId, lessonDate) {
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', studentId)
        .eq('status', 'paid')
        .lte('payment_date', lessonDate)
        .gt('lessons_paid', 0)
        .order('payment_date', { ascending: false }); // ✅ ИЗМЕНЕНО: false для LIFO (сначала новые)

    if (error || !data?.length) return null;

    for (const payment of data) {
        const used = payment.lessons_used || 0;
        const paid = payment.lessons_paid || 0;
        if (used < paid) {
            return payment;
        }
    }
    return null;
}

/**
 * Списывает урок с оплаты: увеличивает lessons_used и привязывает урок к платежу.
 * ПРОВЕРЯЕТ, не был ли урок уже привязан ранее.
 * @param {string} lessonId - ID урока
 * @param {string} paymentId - ID оплаты
 */
export async function linkLessonToPayment(lessonId, paymentId) {
    if (!paymentId) return;
    
    // 1. Проверяем, не привязан ли урок уже к этой оплате
    const { data: lesson } = await supabase
        .from('lessons')
        .select('payment_id')
        .eq('id', lessonId)
        .single();
    
    if (lesson?.payment_id === paymentId) {
        // Уже привязан, ничего не делаем
        return;
    }
    
    // 2. Если привязан к другой оплате - сначала отвязываем
    if (lesson?.payment_id) {
        await unlinkLessonFromPayment(lessonId, lesson.payment_id);
    }

    // 3. Получаем текущее значение lessons_used
    const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('lessons_used')
        .eq('id', paymentId)
        .single();
    
    if (fetchError) throw fetchError;

    const newLessonsUsed = (payment.lessons_used || 0) + 1;

    // 4. Обновляем счётчик в оплате
    const { error: updateError } = await supabase
        .from('payments')
        .update({ lessons_used: newLessonsUsed })
        .eq('id', paymentId);
    
    if (updateError) throw updateError;

    // 5. Привязываем урок к оплате
    const { error: linkError } = await supabase
        .from('lessons')
        .update({ payment_id: paymentId })
        .eq('id', lessonId);
    
    if (linkError) throw linkError;
}

/**
 * Отвязывает урок от оплаты (при удалении урока или смене статуса)
 * ПРОВЕРЯЕТ корректность данных перед уменьшением
 * @param {string} lessonId - ID урока
 * @param {string} paymentId - ID оплаты (если был привязан)
 */
export async function unlinkLessonFromPayment(lessonId, paymentId) {
    if (!paymentId) return;
    
    // 1. Проверяем, привязан ли вообще урок к этой оплате
    const { data: lesson } = await supabase
        .from('lessons')
        .select('payment_id')
        .eq('id', lessonId)
        .single();
    
    if (!lesson || lesson.payment_id !== paymentId) {
        // Урок не привязан к этой оплате, ничего не делаем
        return;
    }

    // 2. Получаем текущее значение lessons_used
    const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('lessons_used')
        .eq('id', paymentId)
        .single();
    
    if (fetchError) return;

    const newLessonsUsed = Math.max((payment.lessons_used || 0) - 1, 0);

    // 3. Обновляем счётчик в оплате
    const { error: updateError } = await supabase
        .from('payments')
        .update({ lessons_used: newLessonsUsed })
        .eq('id', paymentId);
    
    if (updateError) {
        console.error('Ошибка при обновлении lessons_used:', updateError);
        return;
    }

    // 4. Убираем связь с урока
    const { error: unlinkError } = await supabase
        .from('lessons')
        .update({ payment_id: null })
        .eq('id', lessonId);
    
    if (unlinkError) {
        console.error('Ошибка при отвязке урока:', unlinkError);
    }
}

/**
 * ✅ НОВАЯ ФУНКЦИЯ: Массовое списание уроков для группового занятия
 * @param {string} groupId - ID группы
 * @param {string} lessonId - ID урока
 * @param {string} lessonDate - Дата урока
 * @param {Array<string>} attendedStudentIds - ID учеников, кто присутствовал
 */
export async function linkGroupLessonToPayments(groupId, lessonId, lessonDate, attendedStudentIds) {
    if (!attendedStudentIds || attendedStudentIds.length === 0) return;
    
    const results = [];
    
    for (const studentId of attendedStudentIds) {
        try {
            const availablePayment = await findAvailablePayment(studentId, lessonDate);
            if (availablePayment) {
                await linkLessonToPayment(lessonId, availablePayment.id);
                results.push({
                    studentId,
                    success: true,
                    paymentId: availablePayment.id
                });
            } else {
                results.push({
                    studentId,
                    success: false,
                    error: 'Нет доступной оплаты'
                });
            }
        } catch (error) {
            results.push({
                studentId,
                success: false,
                error: error.message
            });
        }
    }
    
    return results;
}