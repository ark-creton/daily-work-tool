/**
 * どの画面からでも呼び出せる共通の通知関数
 * @param {string} message - 表示したいメッセージ
 * @param {string} type - "success" または "error"
 */
function showToast(message, type = "success") {
  // 1. ポップアップの箱を作成
  const toast = document.createElement("div");
  toast.className = `custom-toast ${type === "error" ? "error" : ""}`;

  const iconClass = type === "error" ? "bi-exclamation-circle" : "bi-check-circle";

  // HTMLの中にアイコン、メッセージ、閉じるボタンをセット
  toast.innerHTML = `
    <div class="d-flex align-items-center justify-content-between w-100" style="gap: 12px;">
      <div class="d-flex align-items-center">
        <i class="bi ${iconClass} me-2"></i>
        <span>${message}</span>
      </div>
      <button type="button" class="toast-close-btn" aria-label="Close" style="background: none; border: none; color: #fff; font-size: 1.2rem; cursor: pointer; padding: 0; line-height: 1; opacity: 0.8;">
        <i class="bi bi-x"></i>
      </button>
    </div>
  `;

  document.body.appendChild(toast);

  // 2. 閉じる処理を共通化
  let timerId = null;
  const closeToast = () => {
    if (timerId) clearTimeout(timerId); // 自動削除タイマーを解約
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  };

  // 閉じるボタンのクリックイベント
  const closeBtn = toast.querySelector(".toast-close-btn");
  if (closeBtn) {
    // ホバー時に少し明るくする演出
    closeBtn.addEventListener("mouseenter", () => closeBtn.style.opacity = "1");
    closeBtn.addEventListener("mouseleave", () => closeBtn.style.opacity = "0.8");
    closeBtn.addEventListener("click", closeToast);
  }

  // 3. 少し遅らせて表示クラスを追加
  setTimeout(() => toast.classList.add("show"), 50);

  // 4. 3秒後に自動非表示
  timerId = setTimeout(closeToast, 3000);
}

// グローバルスコープへ紐付け
window.showToast = showToast;