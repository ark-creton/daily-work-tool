const CONFIG = {
  STR_SUPABASE_URL: "https://bfbobdfrlmmysicozwbq.supabase.co",
  STR_SUPABASE_ANON_KEY: "sb_publishable_RiDt8lCJoWh91oKU8lvRyQ_xza3wsIN",
};

// Supabaseの公式ライブラリを使って、接続用のクライアント本体を作成します
if (typeof supabase !== "undefined" && supabase.createClient) {
  window.supabase = supabase.createClient(CONFIG.STR_SUPABASE_URL, CONFIG.STR_SUPABASE_ANON_KEY);
  console.log("Supabaseの初期化が正常に完了しました。");
} else {
  console.error("Supabaseのライブラリが読み込まれていないため、初期化できませんでした。");
}
