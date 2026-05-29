document.addEventListener("DOMContentLoaded", async () => {
  console.log("インデックス（共通基盤）のJSが正常に読み込まれました");

  // ==========================================
  // 共通のEnterキー誤送信防止処理
  // ==========================================
  window.preventFormEnterSubmit = (formId) => {
    const form = document.getElementById(formId);
    if (!form) return;

    form.addEventListener("keydown", (event) => {
      // Enterキーかつ、TEXTAREA（備考欄など）以外なら送信を止める
      if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
        event.preventDefault();
        console.log(
          `共通処理: フォーム [${formId}] でのEnterキーによる送信をブロックしました。`,
        );
      }
    });
  };

  // ==========================================
  // 共通ローディングの表示・非表示関数
  // ==========================================
  window.showGlobalLoading = function () {
    const loader = document.getElementById("global-loading");
    if (loader) loader.classList.add("show");
  };

  window.hideGlobalLoading = function () {
    const loader = document.getElementById("global-loading");
    if (loader) loader.classList.remove("show");
  };

  // ==========================================
  // 💡 【追加】ポップオーバーの共通初期化関数（PC・スマホ自動判別）
  // ==========================================
  function initGlobalPopovers() {
    const popoverTriggerList = [].slice.call(
      document.querySelectorAll('[data-bs-toggle="popover"]'),
    );
    popoverTriggerList.map(function (popoverTriggerEl) {
      // 既に初期化済みの場合はスキップして二重適用を防ぐ
      if (bootstrap.Popover.getInstance(popoverTriggerEl)) return;

      // 画面幅が768px未満（スマホ）なら 'focus'、それ以上（PC）なら 'hover focus'
      const isMobile = window.innerWidth < 768;
      const triggerMode = isMobile ? "focus" : "hover focus";

      return new bootstrap.Popover(popoverTriggerEl, {
        trigger: triggerMode,
        delay: { show: 50, hide: 100 },
      });
    });
  }

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

        /* user_name と一緒に role（権限）も引っ張るようにします */
        const { data: masterData, error: dbError } = await supabaseClient
          .from("user_master")
          .select("user_name, role")
          .eq("id", user.id)
          .single();

        let userName = "ゲストユーザー";
        let userRole = "staff"; // 失敗したときの初期値（一般スタッフ）を用意

        if (dbError) {
          console.warn(
            "user_masterからの名前取得に失敗したため、代替値を使用します:",
            dbError.message,
          );
          userName = user.email || "ゲストユーザー";
        } else if (masterData) {
          userName = masterData.user_name;
          userRole = masterData.role; // データベースから取れた権限（adminかstaff）を代入！
        }

        // ヘッダーの表示を書き換える
        const userNameSpan = document.querySelector(".header-right .user-name");
        if (userNameSpan) {
          userNameSpan.innerText = `${userName} さん`;
        }

        // ==========================================
        // 管理者メニューの表示・非表示の切り替え
        // ==========================================
        const adminMenuItem = document.getElementById("menu_admin");
        if (adminMenuItem) {
          if (userRole === "admin") {
            // 管理者の場合は表示する
            adminMenuItem.style.setProperty("display", "flex", "important");
          } else {
            // 管理者以外（staffなど）の場合は完全に非表示にする
            adminMenuItem.style.setProperty("display", "none", "important");
          }
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
      // ✨【追加】ログアウト通信が始まる瞬間にローディングを表示
      showGlobalLoading();

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
      window.showToast("ログアウトに失敗しました。", "error");
      hideGlobalLoading();
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
      // 💡 1. まずは爆速（0.05秒）でローディング（ボカシ）を表示する
      showGlobalLoading();

      // 💡 【ここが最大のポイント！】
      // ローディングが画面を完全に覆い尽くすまで「0.05秒」だけ処理をストップさせて、
      // 画面のチラつきやガタつきがユーザーの目に入るのを完全にシャットアウトします。
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 💡 2. ボカシの裏に完全に隠れてから、安全に画面の切り替えを開始する
      const response = await fetch(`./${pageName}.html`);
      if (!response.ok) {
        throw new Error(`ページの読み込みに失敗しました: ${response.status}`);
      }

      const htmlContent = await response.text();

      if (dynamicArea) {
        dynamicArea.innerHTML = htmlContent;
      }

      // 各画面の初期化JavaScriptの実行を待つ
      if (pageName === "main" && typeof initializeMainPage === "function") {
        await initializeMainPage();
      }
      if (pageName === "admin" && typeof initializeAdminPage === "function") {
        await initializeAdminPage();
      }
      if (
        pageName === "attendance" &&
        typeof window.initAttendanceCalendar === "function"
      ) {
        await window.initAttendanceCalendar();
      }

      // 💡【引っ越し完了】HTMLが完全に描画された後、共通のポップオーバー初期化を実行
      initGlobalPopovers();

      // ブラウザが新しい画面を描き切るのを少し待つ
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    } catch (error) {
      console.error("画面の切り替え中にエラーが発生しました:", error);
      if (dynamicArea) {
        dynamicArea.innerHTML = `
          <div class="alert alert-danger m-4" role="alert">
            <i class="bi bi-exclamation-triangle-fill"></i> 画面の読み込み中にエラーが発生しました。
          </div>
        `;
      }
    } finally {
      // 💡 3. すべてが美しく整ったら、フワッとボカシを解除
      hideGlobalLoading();
    }
  }

  // 初期実行時（ログイン直後など）の最初のタブ名を設定
  document.title = "メイン - 勤怠レポートツール";

  // 初期実行：最初のメニュー（メイン）にアクティブ色をつける
  const homeItem = document.querySelector(
    '.sidebar-nav .nav-item[data-page="home"]',
  );
  if (homeItem) {
    homeItem.classList.add("active");
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

      // クリックされたメニューの「data-title」から画面名を取得
      const pageTitle = clickedItem.getAttribute("data-title");

      if (page === "home") {
        loadPage("main"); // メイン画面
      } else if (page === "attendance") {
        loadPage("attendance"); // 勤怠画面
      } else if (page === "report") {
        loadPage("report"); // レポート画面
      } else if (page === "admin") {
        loadPage("admin"); // 管理者専用画面
      }

      // タブの文字を「画面名 - 勤怠レポートツール」に書き換え
      if (pageTitle) {
        document.title = `${pageTitle} - 勤怠レポートツール`;
      }

      if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
        sidebarNav.classList.remove("mobile-active");
      }
    });
  });
});
