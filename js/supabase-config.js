// 1.Supabaseの道具箱から「接続機能」を取り出
const { createClient } = supabase;

// 2.先ほど作ったCONFIG(住所と鍵)を使って、接続を開始する
const supabaseClient = createClient(CONFIG.STR_SUPABASE_URL, CONFIG.STR_SUPABASE_ANON_KEY);
