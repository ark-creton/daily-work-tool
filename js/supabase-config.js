// window.supabase にすでに格納されている共通のクライアントを安全にエクスポートする
export const supabase = window.supabase || (function() {
  if (typeof supabase !== "undefined" && supabase.createClient) {
    return supabase.createClient(CONFIG.STR_SUPABASE_URL, CONFIG.STR_SUPABASE_ANON_KEY);
  }
  console.error("Supabaseクライアントが見つかりません。config.jsの読み込み順序を確認してください。");
  return null;
})();