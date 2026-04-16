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
        .lte('payment_date', lessonDate) // оплата до или в день урока
        .gt('lessons_paid', 0) // есть оплаченные уроки
        .order('payment_date', { ascending: true }); // FIFO: сначала старые

    if (error || !data?.length) return null;

    // Ищем первую оплату, где остались неиспользованные уроки
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
    // 1. Привязываем урок к оплате
    const { error: linkError } = await supabase
        .from('lessons')
        .update({ payment_id: paymentId })
        .eq('id', lessonId);
    
    if (linkError) throw linkError;

    // 2. Увеличиваем счётчик использованных уроков в оплате
    const { error: updateError } = await supabase
        .from('payments')
        .update({ lessons_used: supabase.raw('lessons_used + 1') })
        .eq('id', paymentId);
    
    if (updateError) throw updateError;
}

/**
 * Отвязывает урок от оплаты (при удалении урока или смене статуса)
 * @param {string} lessonId - ID урока
 * @param {string} paymentId - ID оплаты (если был привязан)
 */
export async function unlinkLessonFromPayment(lessonId, paymentId) {
    if (!paymentId) return;
    
    // 1. Убираем связь
    await supabase.from('lessons').update({ payment_id: null }).eq('id', lessonId);
    
    // 2. Уменьшаем счётчик
    await supabase
        .from('payments')
        .update({ lessons_used: supabase.raw('GREATEST(lessons_used - 1, 0)') })
        .eq('id', paymentId);
}