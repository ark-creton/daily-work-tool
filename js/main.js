/**
 * メイン画面（main.html）専用の初期化関数
 * index.js の loadPage("main") が成功した直後に自動で呼び出されます
 */
function initializeMainPage() {
  console.log("main.js: メイン画面専用の処理を開始します。");

  const dateDisplay = document.getElementById("current_date_display");
  const timeDisplay = document.getElementById("current_time_display");

  // --- 1. 時計・日付パーツの自動起動 ---
  if (dateDisplay && timeDisplay) {
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

    const updateClock = () => {
      const now = new Date();
      dateDisplay.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekDays[now.getDay()]})`;
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    };

    updateClock();

    const clockInterval = setInterval(() => {
      // 画面が切り替わって時計が消えたらタイマーを止める（お片付け）
      if (!document.getElementById("current_time_display")) {
        clearInterval(clockInterval);
        console.log("main.js: 時計タイマーを停止しました。");
        return;
      }
      updateClock();
    }, 1000);
  }

  // --- 2. 打刻ボタンの連動ロジック ---
  const statusLabel = document.getElementById("current_status_label");
  const clockInBtn = document.getElementById("clock_in_button");
  const clockOutBtn = document.getElementById("clock_out_button");
  const breakToggleBtn = document.getElementById("break_toggle_button");

  if (statusLabel && clockInBtn && clockOutBtn && breakToggleBtn) {
    const logArea = document.getElementById("recent_logs_area");

    const addLog = (message) => {
      if (!logArea) return;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
      logArea.value = `[${timeStr}] ${message}\n` + logArea.value;
    };

    // ①【出勤ボタン】が押されたとき
    clockInBtn.addEventListener("click", () => {
      statusLabel.textContent = "出勤中";
      statusLabel.className = "status-badge status-working";
      addLog("出勤打刻を受理しました。");

      clockInBtn.disabled = true;
      clockOutBtn.disabled = false;
      breakToggleBtn.disabled = false;
    });

    // ②【退勤ボタン】が押されたとき
    clockOutBtn.addEventListener("click", () => {
      statusLabel.textContent = "退勤済";
      statusLabel.className = "status-badge status-returned";
      addLog("退勤打刻を受理しました。本日もお疲れ様でした！");

      clockInBtn.disabled = true;
      clockOutBtn.disabled = true;
      breakToggleBtn.disabled = true;
    });

    // ③【外出（開始・終了）ボタン】が押されたとき
    breakToggleBtn.addEventListener("click", () => {
      if (breakToggleBtn.textContent.trim() === "外出開始") {
        statusLabel.textContent = "外出中";
        statusLabel.className = "status-badge status-break";
        breakToggleBtn.textContent = "外出終了";
        addLog("外出を開始しました。");

        clockOutBtn.disabled = true;
      } else {
        statusLabel.textContent = "出勤中";
        statusLabel.className = "status-badge status-working";
        breakToggleBtn.textContent = "外出開始";
        addLog("外出から戻りました。");

        clockOutBtn.disabled = false;
      }
    });

    // ④【備考の「保存 / 編集」ボタンの連動処理】
    const remarksInput = document.getElementById("today_remarks_input");
    const saveRemarksBtn = document.getElementById("btn_save_remarks");

    if (remarksInput && saveRemarksBtn) {
      saveRemarksBtn.addEventListener("click", () => {
        // 【状態A】今のボタンが「保存」の場合 ➡ ロックする
        if (saveRemarksBtn.textContent.trim() === "保存") {
          const remarksText = remarksInput.value.trim();

          if (remarksText === "") {
            alert("備考欄が空欄です。文字を入力してから保存してください。");
            return;
          }

          addLog(`【備考保存】${remarksText}`);

          remarksInput.disabled = true; // 入力欄をロック（グレーアウト）
          saveRemarksBtn.textContent = "編集"; // ボタンの文字を「編集」に変える
          saveRemarksBtn.style.backgroundColor = "#6c757d"; // ボタンを落ち着いたグレーに
        }

        // 【状態B】今のボタンが「編集」の場合 ➡ ロック解除
        else {
          remarksInput.disabled = false; // 入力欄のロックを解除
          remarksInput.focus(); // すぐに入力できるようにカーソルを合わせる
          saveRemarksBtn.textContent = "保存"; // ボタンの文字を「保存」に戻す
          saveRemarksBtn.style.backgroundColor = "#8ea3c2"; // ボタンの色を戻す
        }
      });
    }
  } // 💡 ここが「if (statusLabel && clockInBtn...)」の終わりです
} // 💡 ここが「function initializeMainPage()」の全体の終わりです
