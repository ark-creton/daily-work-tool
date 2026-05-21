/**
 * どの画面からでも呼び出せる共通の通知関数
 * @param {string} message - 表示したいメッセージ
 * @param {string} type - "success" または "error"
 */
function showToast(message, type = "success") {
  // 1. ポップアップの箱を作成
  const toast = document.createElement("div");
  toast.className = `custom-toast ${type === "error" ? "error" : ""}`;

  // 💡 アイコンのクラスを決定
  const iconClass = type === "error" ? "bi-exclamation-circle" : "bi-check-circle";

  // 💡 HTMLの中にアイコンとメッセージをセット
  toast.innerHTML = `<i class="bi ${iconClass} me-2"></i> ${message}`;

  document.body.appendChild(toast);

  // 2. 少し遅らせて表示クラスを追加
  setTimeout(() => toast.classList.add("show"), 50);

  // 3. 3秒後に非表示にしてから削除
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}