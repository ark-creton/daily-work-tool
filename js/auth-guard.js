import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const path = window.location.pathname;
const gate = document.getElementById('auth-gate');

// ログイン画面またはルートならゲートを開放
if (path.endsWith('login.html') || path.endsWith('index.html') || path === '/') {
  if (gate) gate.remove();
} else {
  const supabase = createClient(
    'https://bfbobdfrlmmysicozwbq.supabase.co', 
    'sb_publishable_RiDt8lCJoWh91oKU8lvRyQ_xza3wsIN'
  );

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      // 未ログインならログイン画面へ
      window.location.href = 'index.html';
    } else {
      // ログイン済みならゲートを取り外して画面を表示
      if (gate) gate.remove();
    }
  });
}