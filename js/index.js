document.addEventListener("DOMContentLoaded", async () => {
  console.log("インデックス（共通基盤）のJSが正常に読み込まれました");

  // ==========================================
  // 共通の便利関数エリア
  // ==========================================

  // DB更新用：現在時刻をISO形式で取得
  window.getNowISO = () => new Date().toISOString();

  // ログ出力用：共通フォーマットで保存
  window.addLogCommon = (tag, message) => {
    const logArea = document.getElementById("recent_logs_area");
    if (!logArea) return;

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const newLogRow = `${timeStr} 【${tag}】 ${message}`;

    logArea.value = newLogRow + "\n" + logArea.value;

    // LocalStorage保存（今日のキー）
    const todayKey = `attendance_logs_${new Date().toISOString().split("T")[0]}`;
    localStorage.setItem(todayKey, logArea.value);
  };

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
        console.log(`共通処理: フォーム [${formId}] でのEnterキーによる送信をブロックしました。`);
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
  // ポップオーバーの共通初期化関数（PC・スマホ自動判別）
  // ==========================================
  function initGlobalPopovers() {
    // サイドバーのメニュー（.nav-item）以外にある、通常のdata-bs-toggle要素だけを初期化する
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]:not(.nav-item)'));
    popoverTriggerList.map(function (popoverTriggerEl) {
      if (bootstrap.Popover.getInstance(popoverTriggerEl)) return;

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
      // 先取りキャッシュの読み込み
      const cachedName = localStorage.getItem("cached_user_name");
      const cachedRole = localStorage.getItem("cached_user_role");
      const cachedCompanyId = localStorage.getItem("cached_user_company_id"); // ←【追加】会社IDもキャッシュから取る

      // キャッシュが存在する場合の先行UI制御
      if (cachedName && cachedRole) {
        console.log("ログイン画面からの先取りキャッシュを使用します:", { cachedName, cachedRole, cachedCompanyId });

        const userNameSpan = document.querySelector(".header-right .user-name");
        if (userNameSpan) userNameSpan.innerText = `${cachedName} さん`;

        const mobileUserNameSpan = document.querySelector(".sidebar-user-name");
        if (mobileUserNameSpan) mobileUserNameSpan.innerText = `${cachedName} さん`;

        // 管理者メニューの制御
        const adminMenuItem = document.getElementById("menu_admin");
        if (adminMenuItem) {
          adminMenuItem.style.setProperty("display", cachedRole === "admin" ? "flex" : "none", "important");
        }

        // IDで直接指定して非表示にする
        const reportMenuItem = document.getElementById("menu_report");
        if (reportMenuItem && cachedCompanyId === "c981e701-94d1-47a6-a23a-7d2b3b84a894") {
          reportMenuItem.style.setProperty("display", "none", "important");
        }
      }

      const supabaseClient = window.supabase || supabase;
      if (!supabaseClient) {
        console.error("Supabaseが初期化されていません");
        return;
      }

      // 1. まず認証情報を取得
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();

      if (authError) throw authError;

      if (user) {
        console.log("ログイン中のAuthユーザーID:", user.id);

        /* user_name, role と一緒に company_id（会社ID）もマスタから直接引っ張る */
        const { data: masterData, error: dbError } = await supabaseClient
          .from("user_master")
          .select("user_name, role, company_id")
          .eq("id", user.id)
          .single();

        let userName = "ゲストユーザー";
        let userRole = "staff";
        let userCompanyId = null; // 初期値

        if (dbError) {
          console.warn("user_masterからの名前取得に失敗したため、代替値を使用します:", dbError.message);
          userName = user.email || "ゲストユーザー";
        } else if (masterData) {
          userName = masterData.user_name;
          userRole = masterData.role;
          userCompanyId = masterData.company_id;

          // 次回スムーズに動くように会社IDもキャッシュに保存する
          localStorage.setItem("cached_user_company_id", userCompanyId);
        }

        // ヘッダーの表示を書き換える
        const userNameSpan = document.querySelector(".header-right .user-name");
        if (userNameSpan) userNameSpan.innerText = `${userName} さん`;

        // 管理者メニューの表示・非表示の切り替え
        const adminMenuItem = document.getElementById("menu_admin");
        if (adminMenuItem) {
          adminMenuItem.style.setProperty("display", userRole === "admin" ? "flex" : "none", "important");
        }

        // ==========================================
        // アークフォレスト用のレポートメニュー完全非表示化
        // ==========================================
        const reportMenuItem = document.getElementById("menu_report");
        if (reportMenuItem) {
          if (userCompanyId === "c981e701-94d1-47a6-a23a-7d2b3b84a894") {
            console.log("共通基盤: アークフォレスト所属のため、レポートメニューを非表示にします。");
            reportMenuItem.style.setProperty("display", "none", "important");
          } else {
            reportMenuItem.style.setProperty("display", "flex", "important");
          }
        }

        // スマホメニュー内の表示も同時に書き換える
        const mobileUserNameSpan = document.querySelector(".sidebar-user-name");
        if (mobileUserNameSpan) mobileUserNameSpan.innerText = `${userName} さん`;
      } else {
        console.warn("未ログイン状態です。ログイン画面へ遷移します。");
        window.location.href = "login.html";
      }
    } catch (err) {
      console.error("ユーザー情報の取得中にエラーが発生しました:", err.message);
    }
  }

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

      // ログアウトに成功したら、LocalStorageのキャッシュも綺麗に掃除しておく
      localStorage.removeItem("cached_user_name");
      localStorage.removeItem("cached_user_role");

      // ロードは挟まず、そのままログイン画面へスパッと戻る
      window.location.href = "login.html";
    } catch (err) {
      console.error("ログアウト中にエラーが発生しました:", err.message);
      if (typeof window.showToast === "function") {
        window.showToast("ログアウトに失敗しました。", "error");
      }
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

  // ✨【大転換】Popoverをやめて、より確実なTooltipで制御するロジック
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
    if (item.classList.contains("mobile-logout-item")) return;

    item.addEventListener("mouseenter", () => {
      const isCollapsed = sidebar && sidebar.classList.contains("collapsed");

      if (isCollapsed) {
        // 既存のツールチップがあれば一度破棄
        const oldInstance = bootstrap.Tooltip.getInstance(item);
        if (oldInstance) {
          oldInstance.hide();
          oldInstance.dispose();
        }

        // HTMLの data-title から直接「メイン」などの文字を取得
        const menuText = item.getAttribute("data-title") || "";

        // 新しくツールチップを作成して強制表示
        const newInstance = new bootstrap.Tooltip(item, {
          trigger: "manual",
          placement: "right",
          title: menuText, // ツールチップでは content ではなく「title」に文字を入れます
          customClass: "sidebar-tooltip",
          animation: true,
          delay: { show: 0, hide: 0 },
        });

        newInstance.show();
      }
    });

    item.addEventListener("mouseleave", () => {
      const instance = bootstrap.Tooltip.getInstance(item);
      if (instance) {
        instance.hide();
        setTimeout(() => {
          instance.dispose();
        }, 50);
      }
    });
  });

  if (menuToggle && sidebar) {
    menuToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");

      // サイドバーが切り替わった瞬間は、すべてのツールチップを完全消去
      document.querySelectorAll(".sidebar-nav .nav-item").forEach((el) => {
        const instance = bootstrap.Tooltip.getInstance(el);
        if (instance) {
          instance.hide();
          instance.dispose();
        }
      });
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
   * @param {boolean} isInitial - 最初の自動読み込みかどうか（初期値はfalse）
   */
  async function loadPage(pageName, isInitial = false) {
    try {
      // ログイン直後の最初の起動時（isInitialがtrue）は、ロード画面を回さない！
      if (!isInitial) {
        showGlobalLoading();
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // ボカシの裏に完全に隠れてから、安全に画面の切り替えを開始する
      const response = await fetch(`./${pageName}.html`);
      if (!response.ok) {
        throw new Error(`ページの読み込みに失敗しました: ${response.status}`);
      }

      const htmlContent = await response.text();

      if (dynamicArea) {
        dynamicArea.innerHTML = htmlContent;
      }

      // ==================================================================
      // メイン画面読み込み時、経費専用モーダルをセットで自動フェッチして合成する
      // ==================================================================
      if (pageName === "main") {
        try {
          const modalResponse = await fetch("./modal-expense-entry.html");
          if (modalResponse.ok) {
            const modalHtml = await modalResponse.text();
            dynamicArea.insertAdjacentHTML("beforeend", modalHtml);
            console.log("共通基盤: modal-expense-entry.html をメイン画面に正常に合流させました。");
          } else {
            console.warn("共通基盤: modal-expense-entry.html の読み込みに失敗しました。ファイルパスを確認してください。");
          }
        } catch (modalErr) {
          console.error("共通基盤: 経費モーダルのフェッチ中にエラーが発生しました:", modalErr);
        }
      }

      // 各画面の初期化JavaScriptの実行を待つ
      if (pageName === "main" && typeof initializeMainPage === "function") {
        await initializeMainPage();
      }
      // メイン画面の初期化に続けてカレンダーを描画する
      if (typeof renderCalendar === "function") {
        console.log("共通基盤: main画面の同期完了を検知。カレンダーを描画します。");
        renderCalendar();
      }

      if (pageName === "report" && typeof initializeReportPage === "function") {
        await initializeReportPage();
      }

      if (pageName === "attendance" && typeof window.initAttendanceCalendar === "function") {
        await window.initAttendanceCalendar();
      }

      if (pageName === "admin" && typeof initializeAdminPage === "function") {
        await initializeAdminPage();
      }

      // HTMLが完全に描画された後、共通のポップオーバー初期化を実行
      initGlobalPopovers();

      // ブラウザが新しい画面を描き切るのを少し待つ
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
      if (!isInitial) {
        hideGlobalLoading();
      }
    }
  }

  // ==========================================
  // 🚀 初期起動・画面初期化プロセス
  // ==========================================
  async function initializeApp() {
    try {
      // 1. ログイン画面が保存したキャッシュを使って、一瞬でヘッダーに名前を反映
      await checkAndDisplayUser();

      // 2. 最初のタブ名を設定
      document.title = "メイン - 勤怠レポートツール";

      // 3. 最初のメニュー（メイン）にアクティブ色をつける
      const homeItem = document.querySelector('.sidebar-nav .nav-item[data-page="home"]');
      if (homeItem) {
        homeItem.classList.add("active");
      }

      await loadPage("main", true);

      // すべての準備が100%完了
      document.body.style.opacity = "1";
    } catch (initError) {
      console.error("アプリ初期化エラー:", initError);
      // 万が一エラーが起きた場合は、画面が真っ白のまま固まらないように保険で表示させる
      document.body.style.opacity = "1";
    }
  }

  // アプリの初期化処理を実行
  initializeApp();

  // サイドバーのメニュークリックイベントの監視
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const clickedItem = e.target.closest(".nav-item");
      if (!clickedItem) return;

      if (clickedItem.classList.contains("mobile-logout-item") || clickedItem.classList.contains("logout-btn")) return;

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
