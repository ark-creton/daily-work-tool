import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const path = window.location.pathname;
const gate = document.getElementById("auth-gate");

// ログイン画面（login.html）だけは未認証でもゲートを開放
if (path.endsWith("login.html")) {
  if (gate) gate.remove();
} else {
  const supabase = window.supabase;

  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) {
      // 未ログインなら「login.html」へ転送！
      window.location.href = "login.html";
    } else {
      // ログイン済みならゲートを取り外して画面を表示
      if (gate) gate.remove();
    }
  });
}
