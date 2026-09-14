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
  // ポップオーバーの共通初期化関数（再生成・更新対応版）
  // ==========================================
  function initGlobalPopovers() {
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]:not(.nav-item)'));
    popoverTriggerList.forEach(function (popoverTriggerEl) {
      // 既存のインスタンスを破棄して再生成（イベントの重複やバグを予防）
      const existingPopover = bootstrap.Popover.getInstance(popoverTriggerEl);
      if (existingPopover) {
        existingPopover.dispose();
      }

      const isMobile = window.innerWidth < 768;
      const triggerMode = isMobile ? "focus" : "hover focus";

      new bootstrap.Popover(popoverTriggerEl, {
        trigger: triggerMode,
        delay: { show: 50, hide: 100 },
      });
    });
  }

  // ==========================================
  // 🔔 共通通知機能（DOM構築を待たずに即時参照できるよう外側に定義）
  // ==========================================

  // ① 通知一覧の取得関数
  window.fetchNotifications = async function (userId) {
    const supabaseClient = window.supabase || supabase;

    // 1. 引数 -> 2. グローバル変数 -> 3. Supabaseセッション の順でユーザーIDを取得
    let targetUserId = userId || window.currentUserId;

    if (!targetUserId && supabaseClient && supabaseClient.auth) {
      try {
        const { data } = await supabaseClient.auth.getUser();
        if (data && data.user) {
          targetUserId = data.user.id;
          window.currentUserId = targetUserId; // 次回の呼び出し用に保持
        }
      } catch (e) {
        console.warn("ユーザーID自動取得エラー:", e);
      }
    }

    // クライアントまたはIDが取れない場合は安全に処理を抜ける
    if (!supabaseClient || !targetUserId) {
      console.warn("🔔 通知更新スキップ: 有効なユーザーIDが見つかりません。");
      return;
    }

    try {
      // 既読・未読問わず直近20件を取得
      const { data: notifications, error } = await supabaseClient
        .from("notifications")
        .select("*")
        .eq("user_id", String(targetUserId).trim())
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      // 未読（is_read = false）の件数を計算し、バッジを即時更新
      const unreadCount = notifications ? notifications.filter((n) => !n.is_read).length : 0;
      const badgeEl = document.getElementById("notification_badge");
      if (badgeEl) {
        if (unreadCount > 0) {
          badgeEl.textContent = unreadCount > 99 ? "99+" : unreadCount;
          badgeEl.classList.remove("d-none");
        } else {
          badgeEl.classList.add("d-none");
        }
      }

      // ドロップダウン一覧の描画
      const container = document.getElementById("notification_list_container");
      if (!container) return;

      if (!notifications || notifications.length === 0) {
        container.innerHTML = `
        <li>
          <div class="px-2 py-3 text-center text-muted" style="font-size: 0.75rem;">
            通知はありません
          </div>
        </li>
      `;
        return;
      }

      let html = "";
      notifications.forEach((notif) => {
        let badgeClass = "bg-success-subtle text-success-emphasis";
        let badgeLabel = "レポート";

        if (notif.type === "attendance_alert" || notif.type === "attendance") {
          badgeClass = "bg-danger-subtle text-danger-emphasis";
          badgeLabel = "打刻忘れ";
        }

        const dateStr = new Date(notif.created_at).toLocaleDateString("ja-JP");
        const bgClass = notif.is_read ? "bg-white opacity-75" : "bg-light";

        html += `
        <li>
          <a class="dropdown-item p-2 rounded-2 text-wrap my-1 notif-item ${bgClass}" 
             href="javascript:void(0);" 
             data-notif-id="${notif.id}" 
             data-report-id="${notif.link_id || ""}">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="badge ${badgeClass}" style="font-size: 0.6rem;">${badgeLabel}</span>
              <small class="text-muted" style="font-size: 0.65rem;">${dateStr}</small>
            </div>
            <div class="text-dark fw-medium" style="font-size: 0.75rem;">${notif.title || notif.message || ""}</div>
            ${notif.title && notif.message ? `<div class="text-muted small mt-1" style="font-size: 0.68rem;">${notif.message}</div>` : ""}
          </a>
        </li>
      `;
      });

      container.innerHTML = html;

      // クリックイベント設定
      container.querySelectorAll(".notif-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          const reportId = e.currentTarget.dataset.reportId;
          if (reportId && typeof window.openEditReportModalById === "function") {
            window.openEditReportModalById(reportId);
          }
        });
      });
    } catch (err) {
      console.error("通知の取得に失敗しました:", err.message);
    }
  };

  // ② イベント登録用関数
  function setupNotificationEvents(userId) {
    const notifBtn = document.getElementById("notificationDropdown");
    if (notifBtn) {
      notifBtn.addEventListener("show.bs.dropdown", async () => {
        await window.fetchNotifications(userId);
      });
    }

    const markAllBtn = document.getElementById("btn_mark_all_read");
    if (markAllBtn) {
      markAllBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const supabaseClient = window.supabase || supabase;
        const targetUserId = userId || window.currentUserId;

        if (!supabaseClient || !targetUserId) return;

        try {
          const { error } = await supabaseClient
            .from("notifications")
            .update({ is_read: true, updated_at: new Date().toISOString() })
            .eq("user_id", String(targetUserId).trim())
            .eq("is_read", false);

          if (error) throw error;

          await window.fetchNotifications(targetUserId);
        } catch (err) {
          console.error("一括既読更新に失敗しました:", err.message);
        }
      });
    }
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
        window.currentUserId = user.id; // グローバルにユーザーIDを保持

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

        // アークフォレスト用のレポートメニュー完全非表示化
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

        // 🔔 通知の初期化・取得実行
        await window.fetchNotifications(user.id);
        setupNotificationEvents(user.id);

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

  document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
    if (item.classList.contains("mobile-logout-item")) return;

    item.addEventListener("mouseenter", () => {
      const isCollapsed = sidebar && sidebar.classList.contains("collapsed");

      if (isCollapsed) {
        const oldInstance = bootstrap.Tooltip.getInstance(item);
        if (oldInstance) {
          oldInstance.hide();
          oldInstance.dispose();
        }

        const menuText = item.getAttribute("data-title") || "";

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
    const activeSidebar = document.querySelector(".sidebar-area");
    if (!activeSidebar) return;

    const toggleBtn = event.target.closest("#mobile-menu-toggle");
    if (toggleBtn) {
      event.stopPropagation();
      activeSidebar.classList.toggle("mobile-active");
      console.log("📱スマホメニューの開閉を切り替えました");
      return;
    }

    if (activeSidebar.classList.contains("mobile-active")) {
      const isMenuItem = event.target.closest(".nav-item") || event.target.closest("a") || event.target.closest("button");

      if (isMenuItem) {
        activeSidebar.classList.remove("mobile-active");
        console.log("📱メニュー項目がタップされたため、メニューを閉じて遷移処理を開始します");
        return;
      }

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
    if (dynamicArea) {
      dynamicArea.style.transition = "opacity 0.15s ease-in-out";
      dynamicArea.style.opacity = "0";
      dynamicArea.classList.remove("is-ready");
    }

    if (!isInitial && typeof showGlobalLoading === "function") {
      showGlobalLoading();
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const response = await fetch(`./${pageName}.html`);
      if (!response.ok) throw new Error(`ページの読み込みに失敗しました: ${response.status}`);
      const htmlContent = await response.text();

      const tempWrapper = document.createElement("div");
      tempWrapper.innerHTML = htmlContent;

      if (pageName === "main") {
        try {
          const modalResponse = await fetch("./modal-expense-entry.html");
          if (modalResponse.ok) {
            tempWrapper.insertAdjacentHTML("beforeend", await modalResponse.text());
          }
        } catch (modalErr) {
          console.error("経費モーダル読み込みエラー:", modalErr);
        }

        try {
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

      if (dynamicArea) {
        dynamicArea.innerHTML = tempWrapper.innerHTML;
      }

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

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (error) {
      console.error("画面切り替え中に致命的なエラーが発生しました:", error);
      if (dynamicArea) {
        dynamicArea.innerHTML = `<div class="alert alert-danger m-4">画面の読み込み中にエラーが発生しました。</div>`;
      }
    } finally {
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
      await checkAndDisplayUser();

      document.title = "メイン - 勤怠レポートツール";

      const homeItem = document.querySelector('.sidebar-nav .nav-item[data-page="home"]');
      if (homeItem) {
        homeItem.classList.add("active");
      }

      await loadPage("main", true);

      document.body.style.opacity = "1";
    } catch (initError) {
      console.error("アプリ初期化エラー:", initError);
      document.body.style.opacity = "1";
    }
  }

  initializeApp();

  // サイドバーのメニュークリックイベントの監視
  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const clickedItem = e.target.closest(".nav-item");
      if (!clickedItem) return;

      if (clickedItem.classList.contains("mobile-logout-item") || clickedItem.classList.contains("logout-btn")) return;

      if (clickedItem.classList.contains("active")) {
        console.log("すでにアクティブなページが選択されたため、遷移処理をスキップします。");
        if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
          sidebarNav.classList.remove("mobile-active");
        }
        return;
      }

      navItems.forEach((i) => i.classList.remove("active"));
      clickedItem.classList.add("active");

      const page = clickedItem.getAttribute("data-page");
      console.log("クリックされたページ:", page);

      const pageTitle = clickedItem.getAttribute("data-title");

      if (page === "home") {
        loadPage("main");
      } else if (page === "attendance") {
        loadPage("attendance");
      } else if (page === "report") {
        loadPage("report");
      } else if (page === "admin") {
        loadPage("admin");
      }

      if (pageTitle) {
        document.title = `${pageTitle} - 勤怠レポートツール`;
      }

      if (sidebarNav && sidebarNav.classList.contains("mobile-active")) {
        sidebarNav.classList.remove("mobile-active");
      }
    });
  });
});