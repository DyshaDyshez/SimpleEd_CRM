// modules/payment-utils.js
import supabase from './supabaseClient.js';

/**
 * Находит подходящую оплату для списания урока.
 * Правила:
 * 1. Оплата должна быть для этого ученика.
 * 2. Дата оплаты РАНЬШЕ или РАВНА дате урока.
 * 3. В оплате ещё остались неиспользованные уроки (lessons_used < lessons_paid).
 * 4. Берётся самая ранняя оплата (FIFO).
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
        .order('payment_date', { ascending: true });

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
 * @param {string} lessonId - ID урока
 * @param {string} paymentId - ID оплаты
 */
export async function linkLessonToPayment(lessonId, paymentId) {
    // 1. Получаем текущее значение lessons_used
    const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('lessons_used')
        .eq('id', paymentId)
        .single();
    
    if (fetchError) throw fetchError;

    const newLessonsUsed = (payment.lessons_used || 0) + 1;

    // 2. Обновляем счётчик в оплате
    const { error: updateError } = await supabase
        .from('payments')
        .update({ lessons_used: newLessonsUsed })
        .eq('id', paymentId);
    
    if (updateError) throw updateError;

    // 3. Привязываем урок к оплате
    const { error: linkError } = await supabase
        .from('lessons')
        .update({ payment_id: paymentId })
        .eq('id', lessonId);
    
    if (linkError) throw linkError;
}

/**
 * Отвязывает урок от оплаты (при удалении урока или смене статуса)
 * @param {string} lessonId - ID урока
 * @param {string} paymentId - ID оплаты (если был привязан)
 */
export async function unlinkLessonFromPayment(lessonId, paymentId) {
    if (!paymentId) return;
    
    // 1. Получаем текущее значение lessons_used
    const { data: payment, error: fetchError } = await supabase
        .from('payments')
        .select('lessons_used')
        .eq('id', paymentId)
        .single();
    
    if (fetchError) return;

    const newLessonsUsed = Math.max((payment.lessons_used || 0) - 1, 0);

    // 2. Обновляем счётчик в оплате
    await supabase
        .from('payments')
        .update({ lessons_used: newLessonsUsed })
        .eq('id', paymentId);
    
    // 3. Убираем связь с урока
    await supabase
        .from('lessons')
        .update({ payment_id: null })
        .eq('id', lessonId);
}