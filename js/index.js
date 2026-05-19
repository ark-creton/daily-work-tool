document.addEventListener("DOMContentLoaded", () => {
  const mobileToggle = document.getElementById("mobile-menu-toggle"); // スマホ用ボタン
  const sidebarNav = document.querySelector(".sidebar-nav"); // 動かしたいメニュー
  const menuToggle = document.getElementById("menu-toggle"); // PC用ボタン
  const sidebar = document.querySelector(".sidebar-area"); // PC用サイドバー

  // --- PC用のサイドバー開閉 ---
  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  // --- スマホ用のハンバーガーメニュー開閉 ---
  if (mobileToggle && sidebarNav) {
    mobileToggle.addEventListener("click", (event) => {
      // CSS側の名前「mobile-active」と完全に一致させる
      sidebarNav.classList.toggle("mobile-active");

      // ボタン自体のクリックが他に影響しないようにする
      event.stopPropagation();
    });
  }

  // メニューの外側をクリックした時に閉じる（使いやすさ向上）
  document.addEventListener("click", (event) => {
    if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
      // クリックした場所がメニュー本体でなければ、メニューを閉じる
      if (!sidebarNav.contains(event.target)) {
        sidebarNav.classList.remove("mobile-active");
      }
    }
  });

  // ==========================================
  // 画面切り替え制御（SPA基盤）＆ 共通パーツ自動初期化
  // ==========================================
  const dynamicArea = document.getElementById("main_content_dynamic_area");
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");

  /**
   * 指定されたHTMLファイルを非同期で読み込んで、メインエリアに表示する関数
   * @param {string} pageName - 読み込むページ名
   */
  async function loadPage(pageName) {
    try {
      const response = await fetch(`./${pageName}.html`);

      if (!response.ok) {
        throw new Error(`ページの読み込みに失敗しました: ${response.status}`);
      }

      const htmlContent = await response.text();

      if (dynamicArea) {
        dynamicArea.innerHTML = htmlContent;
      }

      // 【★修正ポイント1】HTMLが置き換わった直後に、共通パーツの初期化を走らせる
      // これにより、main.htmlでもtimecard.htmlでも、中身に応じて自動起動します！
      initializeClockAndButtons();
    } catch (error) {
      console.error("画面の切り替え中にエラーが発生しました:", error);
      if (dynamicArea) {
        dynamicArea.innerHTML = `
          <div class="alert alert-danger m-4" role="alert">
            <i class="bi bi-exclamation-triangle-fill"></i> 画面の読み込み中にエラーが発生しました。
          </div>
        `;
      }
    }
  }

  /**
   * 【★修正ポイント2】共通パーツ自動検知・起動システム
   * 画面内に日付・時計・打刻ボタンが存在していれば自動でイベントを設定します
   */
  function initializeClockAndButtons() {
    const dateDisplay = document.getElementById("current_date_display");
    const timeDisplay = document.getElementById("current_time_display");

    // --- 1. 時計・日付パーツの自動起動 ---
    if (dateDisplay && timeDisplay) {
      console.log(
        "共通システム: 打刻パーツ（時計）を検出しました。タイマーを起動します。",
      );
      const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

      const updateClock = () => {
        const now = new Date();
        // 日付表示の更新
        dateDisplay.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekDays[now.getDay()]})`;
        // 時刻表示の更新（2桁パディング）
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
      };

      updateClock(); // 1回目を即時実行

      // 1秒ごとの監視タイマーをスタート
      const clockInterval = setInterval(() => {
        // 画面切り替えで時計表示が消えたら自動停止（省エネ）
        if (!document.getElementById("current_time_display")) {
          clearInterval(clockInterval);
          console.log(
            "共通システム: 打刻パーツが画面から消えたため、時計タイマーを停止しました。",
          );
          return;
        }
        updateClock();
      }, 1000);
    }

    // --- 2. 各種打刻ボタンの自動イベント登録 ---
    const clockInBtn = document.getElementById("clock_in_button");
    if (clockInBtn) {
      clockInBtn.addEventListener("click", () => {
        alert(
          "出勤ボタンが押されました！（将来ここにSupabaseの処理を書き込みます）",
        );
      });
    }

    const clockOutBtn = document.getElementById("clock_out_button");
    if (clockOutBtn) {
      clockOutBtn.addEventListener("click", () => {
        alert("退勤ボタンが押されました！");
      });
    }

    const breakToggleBtn = document.getElementById("break_toggle_button");
    if (breakToggleBtn) {
      breakToggleBtn.addEventListener("click", () => {
        alert("外出ボタンが押されました！");
      });
    }
  }

  // 初期実行：アプリ起動時は「main.html」を自動で読み込む
  loadPage("main");

  // サイドバーのメニュークリックイベントの監視
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const clickedItem = e.target.closest(".nav-item");
      if (!clickedItem) return;

      if (
        clickedItem.classList.contains("mobile-logout-item") ||
        clickedItem.classList.contains("logout-btn")
      )
        return;

      navItems.forEach((i) => i.classList.remove("active"));
      clickedItem.classList.add("active");

      const page = clickedItem.getAttribute("data-page");
      console.log("クリックされたページ:", page);

      if (page === "home") {
        loadPage("main"); // メイン画面（ダッシュボード）
      } else if (page === "timecard") {
        loadPage("timecard"); // タイムカード画面
      } else if (page === "report") {
        loadPage("report"); // レポート一覧画面（仮）
      } else if (page === "admin") {
        loadPage("admin"); // 管理者専用画面（仮）
      }

      if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
        sidebarNav.classList.remove("mobile-active");
      }
    });
  });
});
