document.addEventListener("DOMContentLoaded", () => {
  // ==========================================
  // 1. サイドバーの開閉制御（アプリ全体共通）
  // ==========================================
  const mobileToggle = document.getElementById("mobile-menu-toggle");
  const sidebarNav = document.querySelector(".sidebar-nav");
  const menuToggle = document.getElementById("menu-toggle");
  const sidebar = document.querySelector(".sidebar-area");

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  if (mobileToggle && sidebarNav) {
    mobileToggle.addEventListener("click", (event) => {
      sidebarNav.classList.toggle("mobile-active");
      event.stopPropagation();
    });
  }

  document.addEventListener("click", (event) => {
    if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
      if (!sidebarNav.contains(event.target)) {
        sidebarNav.classList.remove("mobile-active");
      }
    }
  });

  // ==========================================
  // 2. 画面切り替え制御（SPA基盤）
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

      // 【超重要】画面が「main」に切り替わった時だけ、引っ越し先の「main.js」の初期化を呼び出す！
      if (pageName === "main" && typeof initializeMainPage === "function") {
        initializeMainPage();
      }
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

      // 一旦すべてのメニューから active クラスを消す
      navItems.forEach((i) => i.classList.remove("active"));
      clickedItem.classList.add("active");

      const page = clickedItem.getAttribute("data-page");
      console.log("クリックされたページ:", page);

      if (page === "home") {
        loadPage("main"); // メイン画面
      } else if (page === "timecard") {
        loadPage("timecard"); // タイムカード画面
      } else if (page === "report") {
        loadPage("report"); // レポート一覧画面
      } else if (page === "admin") {
        loadPage("admin"); // 管理者専用画面
      }

      if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
        sidebarNav.classList.remove("mobile-active");
      }
    });
  });
});
