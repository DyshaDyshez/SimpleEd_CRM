// modules/supabaseClient.js
import CONFIG from './config.js';

// Проверяем, что Supabase уже подключён (если нет — подключаем)
if (!window.supabase) {
  console.warn('Supabase не загружен. Пожалуйста, убедитесь, что скрипт supabase-js подключен в index.html.');
}

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

export default supabase;