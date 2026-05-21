document.addEventListener("DOMContentLoaded", async () => {
  console.log("インデックス（共通基盤）のJSが正常に読み込まれました");

  // ==========================================
  // ログインユーザーのチェックとヘッダーへの名前反映
  // ==========================================
  async function checkAndDisplayUser() {
    try {
      const supabaseClient = window.supabase || supabase;
      if (!supabaseClient) {
        console.error("Supabaseが初期化されていません");
        return;
      }

      // 1. まず認証情報を取得（ここでIDがわかります）
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();

      if (authError) throw authError;

      if (user) {
        console.log("ログイン中のAuthユーザーID:", user.id);

        /* 💡 ここで user_master テーブルから user_name を引っ張る */
        const { data: masterData, error: dbError } = await supabaseClient
          .from("user_master")
          .select("user_name")
          .eq("id", user.id)
          .single(); // 1件だけ取得

        let userName = "ゲストユーザー";

        if (dbError) {
          console.warn(
            "user_masterからの名前取得に失敗したため、代替値を使用します:",
            dbError.message,
          );
          userName = user.email || "ゲストユーザー"; // 失敗時はメールアドレスを代用
        } else if (masterData) {
          userName = masterData.user_name; // 🟢 データベースから取れた「テスト01」を代入！
        }

        // ヘッダーの表示を書き換える
        const userNameSpan = document.querySelector(".header-right .user-name");
        if (userNameSpan) {
          userNameSpan.innerText = `${userName} さん`; 
        }
        // スマホメニュー内の表示も同時に書き換える
        const mobileUserNameSpan = document.querySelector(".sidebar-user-name");
        if (mobileUserNameSpan) {
          mobileUserNameSpan.innerText = `${userName} さん`; 
        }
      } else {
        // ❌ ログインしていない場合はログイン画面へ強制リダイレクト
        console.warn("未ログイン状態です。ログイン画面へ遷移します。");
        window.location.href = "login.html";
      }
    } catch (err) {
      console.error("ユーザー情報の取得中にエラーが発生しました:", err.message);
    }
  }

  // 最初にユーザーチェックを実行（非同期）
  await checkAndDisplayUser();

  // ==========================================
  // ログアウト処理の共通イベント設定
  // ==========================================
  async function handleLogout() {
    try {
      const supabaseClient = window.supabase || supabase;
      if (supabaseClient) {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        console.log("ログアウト成功");
      }
      // ログアウト後はログイン画面へ
      window.location.href = "login.html";
    } catch (err) {
      console.error("ログアウト中にエラーが発生しました:", err.message);
      alert("ログアウトに失敗しました。");
    }
  }

  // PC版・スマホ版それぞれのログアウトボタンにイベントを設定
  const logoutBtnPC = document.querySelector(".logout-btn");
  const logoutBtnMobile = document.querySelector(".mobile-logout-item");

  if (logoutBtnPC) logoutBtnPC.addEventListener("click", handleLogout);
  if (logoutBtnMobile) logoutBtnMobile.addEventListener("click", handleLogout);

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

      // 画面が「main」に切り替わった時だけ、引っ越し先の「main.js」の初期化を呼び出す！
      if (pageName === "main" && typeof initializeMainPage === "function") {
        initializeMainPage();
      }
      // 画面が「admin」に切り替わった時、admin.js の初期化を呼び出す！
      if (pageName === "admin" && typeof initializeAdminPage === "function") {
        initializeAdminPage();
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
