// modules/supabaseClient.js
import CONFIG from './config.js';

// Проверяем, что Supabase уже подключён
if (!window.supabase) {
    console.error('❌ Supabase не загружен. Убедитесь, что скрипт supabase-js подключен в index.html.');
}

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

export default supabase;