document.addEventListener("DOMContentLoaded", async () => {
  console.log("共通基盤が正常に読み込まれました");

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
      const cachedCompanyId = localStorage.getItem("cached_user_company_id");

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

        // アークフォレスト所属キャッシュの場合、レポートメニューを非表示
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
        let userCompanyId = cachedCompanyId || null;

        if (dbError) {
          console.warn("user_masterからの名前取得に失敗したため、代替値を使用します:", dbError.message);
          userName = user.email || "ゲストユーザー";
        } else if (masterData) {
          userName = masterData.user_name;
          userRole = masterData.role;
          userCompanyId = masterData.company_id;

          // 次回スムーズに動くようにキャッシュに保存する
          localStorage.setItem("cached_user_name", userName);
          localStorage.setItem("cached_user_role", userRole);
          if (userCompanyId) {
            localStorage.setItem("cached_user_company_id", userCompanyId);
          }
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
        // アークフォレスト用のレポートメニュー完全非表示化（修正箇所）
        // ==========================================
        const reportMenuItem = document.getElementById("menu_report");
        if (reportMenuItem) {
          const isArcForest = userCompanyId === "c981e701-94d1-47a6-a23a-7d2b3b84a894";
          if (isArcForest) {
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
        window.location.href = "login.html"; // 👈 必ず login.html へ
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

      // ログアウトに成功したら、LocalStorageのキャッシュも掃除
      localStorage.removeItem("cached_user_name");
      localStorage.removeItem("cached_user_role");
      localStorage.removeItem("cached_user_company_id");

      // ログイン画面へ戻る
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
          title: menuText,
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

  // ==========================================
  // 📱 スマホ用サイドバー開閉・遷移時自動クローズ処理
  // ==========================================
  document.addEventListener("click", (event) => {
    // 制御対象の親要素（サイドバー全体）
    const activeSidebar = document.querySelector(".sidebar-area");
    if (!activeSidebar) return;

    // ① 三本線マーク（ハンバーガーボタン）がクリックされた場合
    const toggleBtn = event.target.closest("#mobile-menu-toggle");
    if (toggleBtn) {
      event.stopPropagation();
      activeSidebar.classList.toggle("mobile-active");
      console.log("📱スマホメニューの開閉を切り替えました");
      return;
    }

    // ② メニューが開いている状態のときの処理
    if (activeSidebar.classList.contains("mobile-active")) {
      const isMenuItem = event.target.closest(".nav-item") || event.target.closest("a") || event.target.closest("button");

      if (isMenuItem) {
        // メニュー項目をクリックした瞬間にメニューを閉じる！
        activeSidebar.classList.remove("mobile-active");
        console.log("📱メニュー項目がタップされたため、メニューを閉じて遷移処理を開始します");
        return;
      }

      // ③ メニューの外側をクリックした時に閉じる処理
      if (!activeSidebar.contains(event.target)) {
        activeSidebar.classList.remove("mobile-active");
        console.log("📱メニュー外をタップしたため非表示にしました");
      }
    }
  });

  // ==========================================
  // 2. 画面切り替え制御（SPA基盤）
  // ==========================================
  const dynamicArea = document.getElementById("main_content_dynamic_area");
  const navItems = document.querySelectorAll(".sidebar-nav .nav-item");

  async function loadPage(pageName, isInitial = false) {
    // 1. 【ここを修正】画面切替が始まった瞬間に、コンテンツエリアを即座にフェードアウト（透明化）させる
    if (dynamicArea) {
      dynamicArea.style.transition = "opacity 0.15s ease-in-out";
      dynamicArea.style.opacity = "0";
      dynamicArea.classList.remove("is-ready");
    }

    // 2. 【ここを修正】フェードアウトの開始と同時に、ローディング画面もフワッと表示する
    if (!isInitial && typeof showGlobalLoading === "function") {
      showGlobalLoading();
    }

    // 画面が完全に消えてローディングが乗るまで、ほんの一瞬（0.1秒ほど）待ってから中身のフェッチに移る
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      // HTMLのフェッチ
      const response = await fetch(`./${pageName}.html`);
      if (!response.ok) throw new Error(`ページの読み込みに失敗しました: ${response.status}`);
      const htmlContent = await response.text();

      // メモリ上の仮要素で組み立てる
      const tempWrapper = document.createElement("div");
      tempWrapper.innerHTML = htmlContent;

      // モーダル合成
      if (pageName === "main") {
        // 1. 経費モーダルの合成
        try {
          const modalResponse = await fetch("./modal-expense-entry.html");
          if (modalResponse.ok) {
            tempWrapper.insertAdjacentHTML("beforeend", await modalResponse.text());
          }
        } catch (modalErr) {
          console.error("経費モーダル読み込みエラー:", modalErr);
        }

        // 2. 🌟【追加】レポートモーダルの合成
        try {
          // ※お手元のレポートモーダルHTMLの正しいファイル名（例：report-modal.html等）に変更してください
          const reportModalResponse = await fetch("./modal-report-entry.html");
          if (reportModalResponse.ok) {
            tempWrapper.insertAdjacentHTML("beforeend", await reportModalResponse.text());
            console.log("📄 レポートモーダルのHTMLをメイン画面に合流させました");
          } else {
            console.warn("⚠️ レポートモーダルHTMLが見つかりませんでした。ファイル名を確認してください。");
          }
        } catch (reportModalErr) {
          console.error("レポートモーダル読み込みエラー:", reportModalErr);
        }
      }

      // 画面（dynamicArea）にHTMLを反映
      if (dynamicArea) {
        dynamicArea.innerHTML = tempWrapper.innerHTML;
      }

      // 各画面の初期化処理を「安全に」実行（エラーが起きても全体を止めないよう個別で try-catch）
      try {
        if (pageName === "main" && typeof initializeMainPage === "function") {
          await initializeMainPage();
        }
      } catch (e) {
        console.error("initializeMainPage 実行エラー:", e);
      }

      try {
        if (typeof renderCalendar === "function") {
          await renderCalendar();
        }
      } catch (e) {
        console.error("renderCalendar 実行エラー:", e);
      }

      try {
        if (pageName === "report" && typeof initializeReportPage === "function") {
          await initializeReportPage();
        }
      } catch (e) {
        console.error("initializeReportPage 実行エラー:", e);
      }

      try {
        if (pageName === "attendance" && typeof window.initAttendanceCalendar === "function") {
          await window.initAttendanceCalendar();
        }
      } catch (e) {
        console.error("initAttendanceCalendar 実行エラー:", e);
      }

      try {
        if (pageName === "admin" && typeof initializeAdminPage === "function") {
          await initializeAdminPage();
        }
      } catch (e) {
        console.error("initializeAdminPage 実行エラー:", e);
      }

      if (typeof initGlobalPopovers === "function") {
        initGlobalPopovers();
      }

      // 描画がブラウザに確定するのを待つ
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (error) {
      console.error("画面切り替え中に致命的なエラーが発生しました:", error);
      if (dynamicArea) {
        dynamicArea.innerHTML = `<div class="alert alert-danger m-4">画面の読み込み中にエラーが発生しました。</div>`;
      }
    } finally {
      // ⚠️【超重要】エラーが発生しようが何が起きようが、最後は絶対に透明化を解除し、ローディングを消す
      if (dynamicArea) {
        dynamicArea.classList.add("is-ready");
        dynamicArea.style.opacity = "1";
      }

      if (typeof hideGlobalLoading === "function") {
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

      // 🌟【同一ページガードの追加】
      if (clickedItem.classList.contains("active")) {
        console.log("すでにアクティブなページが選択されたため、遷移処理をスキップします。");
        // モバイル用に展開されたサイドバーメニューだけ閉じる（もし開いていれば）
        if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
          sidebarNav.classList.remove("mobile-active");
        }
        return;
      }

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