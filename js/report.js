// レポート画面全体で現在表示中のデータを保持するグローバル変数を定義
let currentDisplayReportData = null;

/**
 * レポート画面 初期化メイン関数（フィルター完全連動版）
 */
async function initializeReportPage() {
  console.log("【report.js】レポート画面の初期化を開始します...");

  if (typeof loginUser === "undefined") {
    window.loginUser = window.loginUser || {};
  }

  const dynamicArea = document.getElementById("main_content_dynamic_area");
  if (!dynamicArea) return;

  try {
    // 1. ログインユーザー情報の同期
    if (typeof fetchAndSetLoginUser === "function") {
      await fetchAndSetLoginUser();
    }

    // 2. 所属会社による権限チェック
    const targetCompanyId = "c981e701-94d1-47a6-a23a-7d2b3b84a894";
    const cachedCompanyId = localStorage.getItem("cached_user_company_id");

    if (loginUser.company_id === targetCompanyId || cachedCompanyId === targetCompanyId) {
      dynamicArea.innerHTML = `
        <div class="container-fluid pt-4">
          <div class="alert alert-warning shadow-sm rounded p-4" role="alert">
            <h5 class="fw-bold mb-2"><i class="bi bi-exclamation-triangle-fill me-2"></i>アクセス制限</h5>
            <p class="mb-0 small text-muted">所属会社の権限により、業務レポート機能はご利用いただけません。トップページへお戻りください。</p>
          </div>
        </div>
      `;
      return;
    }

    // 3. モーダルHTMLを非同期でフェッチして合流
    if (!document.getElementById("modal_report_entry")) {
      const modalResponse = await fetch("./modal-report-entry.html");
      if (modalResponse.ok) {
        const modalHtml = await modalResponse.text();
        dynamicArea.insertAdjacentHTML("beforeend", modalHtml);
        console.log("【report.js】モーダルHTMLを合流させました。");

        if (typeof initializeReportModalLogic === "function") {
          initializeReportModalLogic();
        }
      }
    }

    // 4. メニュー内イベントの設定
    if (typeof initReportMenuEvents === "function") {
      initReportMenuEvents();
    }

    // ==========================================================================
    // 年月インプットの初期化 & イベント・一括描画の連動設定
    // ==========================================================================
    const monthInput = document.getElementById("display_period");
    const monthInputSp = document.getElementById("display_period_sp");
    const userSelect = document.getElementById("target_user_id");

    // 年月インプットが空なら現在の年月（例: "2026-06" や "2026-07"）をセット
    const now = new Date();
    const currentPeriodVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (monthInput && !monthInput.value) {
      monthInput.value = currentPeriodVal;
    }

    if (monthInputSp && !monthInputSp.value) {
      monthInputSp.value = currentPeriodVal;
    }

    // 💡 PC版とスマホ版の入力同期 & フィルターイベント登録
    const handleMonthChange = (e) => {
      const val = e.target.value;
      if (monthInput) monthInput.value = val;
      if (monthInputSp) monthInputSp.value = val;
      if (typeof handleReportFilterChange === "function") {
        handleReportFilterChange();
      }
    };

    if (monthInput) {
      monthInput.onchange = handleMonthChange; // 💡 変更
    }
    if (monthInputSp) {
      monthInputSp.onchange = handleMonthChange; // 💡 追加
    }
    if (userSelect) {
      userSelect.onchange = handleReportFilterChange;
    }

    // ==========================================================================
    // 🎯 画面表示時の初期一括描画（プルダウン構築・一覧・カレンダー・詳細表示）
    // ==========================================================================
    if (typeof handleReportFilterChange === "function") {
      console.log("🚀 [初期化] フィルター一括処理を実行します");
      await handleReportFilterChange();
    } else {
      // フォールバック（念のための個別実行）
      let initialY = now.getFullYear();
      let initialM = now.getMonth() + 1;
      if (monthInput && monthInput.value) {
        const [y, m] = monthInput.value.split("-").map(Number);
        initialY = y;
        initialM = m;
      }
      await fetchAndDisplayLatestReport(initialY, initialM);
      if (typeof renderReportCalendar === "function") await renderReportCalendar(initialY, initialM);
      if (typeof fetchAndDisplayPastReportList === "function") await fetchAndDisplayPastReportList("all", monthInput.value);
    }
  } catch (error) {
    console.error("【report.js】初期化中にエラーが発生しました:", error);
  }

  // メイン画面からの遷移パラメータ処理
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get("id");
  const paramAction = urlParams.get("action");

  if (paramId) {
    console.log(`【report.js】パラメータを検出しました。ID: ${paramId}, Action: ${paramAction}`);
    await fetchAndDisplaySingleReport(paramId);

    if (paramAction === "edit") {
      setTimeout(() => {
        const editBtn = document.getElementById("report_edit_button");
        if (editBtn && !editBtn.classList.contains("d-none")) {
          editBtn.click();
        }
      }, 300);
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

/**
 * モーダル保存完了時にモーダル側（report-modal.js）から呼び出される画面追尾関数
 * @param {number} year - 保存された年 (例: 2026)
 * @param {number} month - 保存された月 (例: 7)
 * @param {string} [specificReportId] - 保存された特定のレポートID (指定時は最優先で表示・フォーカス)
 */
window.onReportSavedSuccess = async function (year, month, specificReportId = null) {
  console.log(`🔄 【レポート画面同期】保存された年月 (${year}年${month}月) に追尾更新を開始します。`);

  // 1. レポート画面の年月インプット (#display_period) を保存された年月（YYYY-MM）に自動書き換え
  const monthInput = document.getElementById("display_period");
  const monthInputSp = document.getElementById("display_period_sp");
  const formattedPeriod = `${year}-${String(month).padStart(2, "0")}`;
  if (monthInput) {
    monthInput.value = formattedPeriod;
  }
  if (monthInputSp) {
    monthInputSp.value = formattedPeriod;
  }

  // 2. カレンダーや過去一覧の更新
  if (typeof renderReportCalendar === "function") await renderReportCalendar(year, month);
  if (typeof fetchAndDisplayPastReportList === "function") await fetchAndDisplayPastReportList();

  // 3. 🎯 特定のレポートIDが渡されている場合は、自動検索をスキップしてそのレポートをピンポイントで中央表示＆フォーカス
  if (specificReportId && typeof fetchAndDisplaySingleReport === "function") {
    const emptyDiv = document.getElementById("report_detail_empty");
    const viewDiv = document.getElementById("report_detail_view");
    if (emptyDiv) emptyDiv.classList.add("d-none");
    if (viewDiv) viewDiv.classList.remove("d-none");

    await fetchAndDisplaySingleReport(specificReportId);

    // 該当行・要素へのフォーカス＆ハイライト演出
    setTimeout(() => {
      const targetRow = document.querySelector(`[data-report-id="${specificReportId}"]`);
      if (targetRow) {
        // 💡 スマホ（991px以下）ではなく、かつ保存直後でない場合のみPCで追尾スクロールを実行
        const isMobile = window.innerWidth <= 991;
        if (!isMobile && !window.isJustSaved) {
          targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        targetRow.classList.add("table-active", "highlight-flash");
        setTimeout(() => targetRow.classList.remove("highlight-flash"), 2000);
      }
    }, 300);
  } else {
    // 通常のフィルター変更時などは従来の最新レポート表示関数を通す
    if (typeof fetchAndDisplayLatestReport === "function") await fetchAndDisplayLatestReport(year, month);
  }
};

/**
 * 指定年月（未指定時は当月）の最新レポート制御関数（一括フィルター連動改修版）
 * @param {number} [year] - 対象年 (例: 2026)
 * @param {number} [month] - 対象月 (例: 7)
 * @param {string} [targetUserId] - プルダウンで選択されたユーザーID ("all", "mine", ユーザーID)
 */
async function fetchAndDisplayLatestReport(year, month, targetUserId = "all") {
  if (!loginUser || !loginUser.id) return;

  const emptyDiv = document.getElementById("report_detail_empty");
  const viewDiv = document.getElementById("report_detail_view");
  const editBtn = document.getElementById("report_edit_button");

  // 引数がない場合は現在の年月を取得
  const now = new Date();
  const targetYear = year || now.getFullYear();
  const targetMonth = month || now.getMonth() + 1;

  const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${lastDay}`;

  try {
    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    // 💡 ユーザーの絞り込み条件（"mine" や 特定ユーザー指定がある場合）
    const isTargetingOthers = targetUserId !== "all" && targetUserId !== "mine" && String(targetUserId) !== String(loginUser.id);

    // 1. 指定年月の中で、自分が作成した最新の有効なレポートを1件取得
    // （特定ユーザーが選択されている場合は自分のレポート自動表示をスキップ）
    let myLatest = [];
    if (!isTargetingOthers) {
      const { data, error: myError } = await supabaseClient
        .from("report_logs")
        .select("id")
        .eq("user_id", loginUser.id)
        .eq("is_active", true)
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);

      if (myError) throw myError;
      myLatest = data || [];
    }

    // 2. 自分が提出したレポートが1件でもあればそれを表示して終了
    if (myLatest.length > 0) {
      if (emptyDiv) emptyDiv.classList.add("d-none");
      if (viewDiv) viewDiv.classList.remove("d-none");

      if (typeof fetchAndDisplaySingleReport === "function") {
        await fetchAndDisplaySingleReport(myLatest[0].id);
      }
      return;
    }

    // 自分が未提出（または他人絞り込み中）なので編集ボタンを非表示にする
    if (editBtn) {
      editBtn.classList.add("d-none");
    }

    // 3. 自分が未提出の場合、他人のレポート（共有されたもの）が選択年月に存在するかチェック
    const { data: sharedReports, error: shareError } = await supabaseClient
      .from("report_logs")
      .select(
        `
        id, is_active, status, user_id,
        report_shares!inner ( user_id, is_read )
      `,
      )
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .eq("is_active", true)
      .neq("user_id", loginUser.id) // 他人のレポート
      .eq("report_shares.user_id", loginUser.id);

    if (shareError) throw shareError;

    const validSharedReports = sharedReports ? sharedReports.filter((r) => r.status !== "draft" && r.is_active !== false) : [];

    // 中央を空状態（emptyDiv）にして、テキストを状況に応じて切り替える
    if (emptyDiv && viewDiv) {
      viewDiv.classList.add("d-none");
      emptyDiv.classList.remove("d-none");

      const titleEl = emptyDiv.querySelector(".text-value");
      const descEl = emptyDiv.querySelector(".small");

      if (titleEl && descEl) {
        if (validSharedReports.length > 0) {
          // 条件：他人のレポートのみが存在する場合
          titleEl.innerText = "確認可能なレポートがあります";
          descEl.innerHTML = `過去の提出一覧、またはカレンダーからレポートを選択して確認してください。<br><span class="text-secondary" style="font-size: 0.75rem;">※詳細を表示すると作成者に既読が伝わります。</span>`;
        } else {
          // 条件：レポートが0件の場合
          titleEl.innerText = "提出されたレポートがありません";
          descEl.innerText = "「新規作成」ボタンから、日報・週報を作成して提出してください。";
        }
      }
    }
  } catch (err) {
    console.error("【fetchAndDisplayLatestReport】データ判定エラー:", err);
    if (emptyDiv && viewDiv) {
      emptyDiv.classList.remove("d-none");
      viewDiv.classList.add("d-none");
    }
    if (editBtn) editBtn.classList.add("d-none");
  }
}

/**
 * 過去のレポート一覧を取得してサイドバーに描画する関数（月指定・ユーザー指定・非干渉完全修復版）
 */
async function fetchAndDisplayPastReportList(targetUserId = null, targetYearMonth = null, forceActiveId = null) {
  const listContainer = document.getElementById("past_report_list");
  const userSelect = document.getElementById("target_user_id");
  const monthInput = document.getElementById("display_period");

  if (!listContainer) return;

  // 1. 絞り込み条件（引数が無ければDOMから直接取得）
  const activeMonth = targetYearMonth || (monthInput ? monthInput.value : ""); // 例: "2026-06"
  const activeUserFilter = targetUserId || (userSelect ? userSelect.value : "all");

  try {
    // 2. レポートログを取得（report_date も確実に取得）
    const { data: allReports, error } = await supabase.from("report_logs").select(
      `
        id, report_type, report_date, work_period_start, work_period_end, is_active, status, created_at, user_id,
        report_shares ( user_id, is_read )
      `,
    );

    if (error) throw error;

    if (!allReports || allReports.length === 0) {
      listContainer.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center h-100 py-5 text-secondary">
          <i class="bi bi-inbox fs-1 mb-2 opacity-50"></i>
          <div class="small fw-medium">該当するレポートはありません</div>
        </div>
      `;
      return;
    }

    // 3. ユーザー情報のマッピング
    const uniqueUserIds = [...new Set(allReports.map((r) => r.user_id).filter(Boolean))];
    let userMasterMap = {};

    if (uniqueUserIds.length > 0) {
      const { data: users } = await supabase.from("user_master").select("id, last_name, first_name").in("id", uniqueUserIds);
      if (users) {
        users.forEach((u) => {
          userMasterMap[u.id] = u;
        });
      }
    }

    allReports.forEach((r) => {
      r.user_master = userMasterMap[r.user_id] || null;
    });

    // 4. 閲覧権限のフィルタリング
    const accessibleReports = allReports.filter((report) => {
      const isMyReport = String(report.user_id) === String(loginUser?.id);

      if (isMyReport) return true;
      if (report.status === "draft") return false;
      if (report.is_active === false) return false;

      if (report.report_shares) {
        const shares = Array.isArray(report.report_shares) ? report.report_shares : [report.report_shares];
        return shares.some((share) => share && String(share.user_id) === String(loginUser?.id));
      }
      return false;
    });

    // 5. 【月別の厳密な絞り込み】 (report_date ➔ work_period_start ➔ created_at の順で確認)
    const monthFilteredReports = accessibleReports.filter((r) => {
      if (!activeMonth) return true;

      let rawDate = r.report_date || r.work_period_start || r.created_at || "";
      if (rawDate.includes("T")) rawDate = rawDate.split("T")[0]; // YYYY-MM-DD 化

      return rawDate.startsWith(activeMonth);
    });

    // 6. 【ユーザー別の二次絞り込み】
    const filteredReports = monthFilteredReports.filter((r) => {
      if (activeUserFilter === "all") return true;
      if (activeUserFilter === "mine") return String(r.user_id) === String(loginUser?.id);
      return String(r.user_id) === String(activeUserFilter);
    });

    // 7. 該当データ0件の場合の表示
    if (filteredReports.length === 0) {
      listContainer.innerHTML = `
        <div class="text-muted text-center small py-5">
          <i class="bi bi-inbox fs-3 d-block mb-2 opacity-50"></i>
          <div>該当するレポートはありません</div>
        </div>
      `;
      return;
    }

    // 8. ソート（下書き ➔ 未読 ➔ 日付降順）
    filteredReports.sort((a, b) => {
      const isMyA = String(a.user_id) === String(loginUser?.id);
      const isMyB = String(b.user_id) === String(loginUser?.id);

      const isDraftA = isMyA && (a.status === "draft" || a.is_active === false);
      const isDraftB = isMyB && (b.status === "draft" || b.is_active === false);

      if (isDraftA && !isDraftB) return -1;
      if (!isDraftA && isDraftB) return 1;

      const getIsUnread = (report, isMine) => {
        if (isMine) return false;
        const shares = Array.isArray(report.report_shares) ? report.report_shares : report.report_shares ? [report.report_shares] : [];
        const myShare = shares.find((s) => s && String(s.user_id) === String(loginUser?.id));
        return myShare ? !myShare.is_read : false;
      };

      const isUnreadA = getIsUnread(a, isMyA);
      const isUnreadB = getIsUnread(b, isMyB);

      if (isUnreadA && !isUnreadB) return -1;
      if (!isUnreadA && isUnreadB) return 1;

      const dateA = a.report_date || a.work_period_start || (a.created_at ? a.created_at.split("T")[0] : "");
      const dateB = b.report_date || b.work_period_start || (b.created_at ? b.created_at.split("T")[0] : "");
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    // 9. HTMLの構築
    let htmlContent = "";
    filteredReports.forEach((report) => {
      const isMyReport = String(report.user_id) === String(loginUser?.id);

      let isRead = false;
      if (isMyReport) {
        isRead = true;
      } else {
        const sharesArray = Array.isArray(report.report_shares) ? report.report_shares : report.report_shares ? [report.report_shares] : [];
        const myShare = sharesArray.find((s) => s && String(s.user_id) === String(loginUser?.id));
        isRead = myShare ? myShare.is_read : false;
      }

      let reporterName = "";
      if (report.user_master) {
        const master = Array.isArray(report.user_master) ? report.user_master[0] : report.user_master;
        if (master && (master.last_name || master.first_name)) {
          reporterName = `${master.last_name || ""} ${master.first_name || ""}`.trim();
        }
      }

      if (!reporterName && String(report.user_id) === String(loginUser?.id)) {
        reporterName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim() || "自分";
      }

      if (!reporterName) reporterName = "ユーザー";

      let baseDate = report.report_date || report.work_period_start;
      if (!baseDate && report.created_at) {
        baseDate = report.created_at.split("T")[0];
      }
      const formattedDate = baseDate ? baseDate.replace(/-/g, "/") : "ー/ー/ー";

      let leftBorderHtml = "";
      let iconHtml = "";
      let textClass = "";
      let badgeHtml = "";

      if (isMyReport) {
        if (report.status === "draft" || report.is_active === false) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #eab308; border-radius: 2px; margin-right: 8px;"></div>`;
          // 🎯 幅18px・中央寄せの枠で包む
          iconHtml = `<div style="width: 18px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-pencil" style="color: #ca8a04; font-size: 0.85rem;"></i></div>`;
          textClass = "text-secondary";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #fef9c3; color: #713f12; padding: 0.1rem 0.4rem; border-radius: 4px;">下書き</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #475569; border-radius: 2px; margin-right: 8px;"></div>`;
          // 🎯 幅18px・中央寄せの枠で包む
          iconHtml = `<div style="width: 18px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-clipboard-check" style="color: #475569; font-size: 0.85rem;"></i></div>`;
          textClass = "text-dark";
          badgeHtml = "";
        }
      } else {
        if (!isRead) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #6366f1; border-radius: 2px; margin-right: 8px;"></div>`;
          // 🎯 幅18px・中央寄せの枠で包む（丸アイコンもこの中心に配置）
          iconHtml = `<div style="width: 18px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-circle-fill" style="color: #6366f1; font-size: 0.5rem;"></i></div>`;
          textClass = "text-dark fw-bold";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #e0e7ff; color: #4338ca; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;">NEW</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #c7d2fe; border-radius: 2px; margin-right: 8px;"></div>`;
          // 🎯 幅18px・中央寄せの枠で包む（書類アイコンも同じ幅の中心に配置）
          iconHtml = `<div style="width: 18px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-file-earmark" style="color: #c7d2fe; font-size: 0.85rem;"></i></div>`;
          textClass = "text-body";
          badgeHtml = "";
        }
      }

      htmlContent += `
        <a href="javascript:void(0);" class="list-group-item list-group-item-action d-flex align-items-center justify-content-between past-report-item" 
          data-id="${report.id}"
          style="padding: 0.65rem 0.5rem; border: none; border-bottom: 1px solid #f1f5f9; transition: all 0.2s;">
          <div class="d-flex align-items-center min-w-0 flex-grow-1">
            ${leftBorderHtml}
            <div class="d-flex align-items-center gap-1.5 min-w-0" style="font-size: 0.82rem;">
              ${iconHtml}
              <span class="${textClass} text-truncate ms-1">
                ${report.report_type}：${reporterName}
              </span>
              ${badgeHtml}
            </div>
          </div>
          <span class="text-muted flex-shrink-0 ms-2" style="font-size: 0.72rem; opacity: 0.8;">${formattedDate}</span>
        </a>
      `;
    });

    listContainer.innerHTML = htmlContent;

    // 💡 🎯【追加】生成された要素にクリックイベント（詳細表示／モーダル表示）をバインドする
    listContainer.querySelectorAll(".past-report-item").forEach((item) => {
      item.addEventListener("click", function (e) {
        e.preventDefault();
        const reportId = this.getAttribute("data-id");
        if (!reportId) return;

        // 1. 詳細表示関数を呼び出す
        if (typeof fetchAndDisplaySingleReport === "function") {
          fetchAndDisplaySingleReport(reportId);
        }

        // 2. モーダル表示関数や選択状態（ハイライト）の更新
        if (typeof highlightSelectedReportItem === "function") {
          highlightSelectedReportItem(reportId);
        }
      });
    });

    // アクティブ選択状態の維持（引数で明示指定されたIDを最優先にする！）
    const activeId =
      forceActiveId ||
      (typeof currentReportId !== "undefined" && currentReportId ? currentReportId : null) ||
      (typeof currentDisplayReportData !== "undefined" ? currentDisplayReportData?.id : null);

    if (activeId) {
      // 既存のアクティブクラスを解除
      listContainer.querySelectorAll(".past-report-item").forEach((el) => el.classList.remove("bg-secondary-subtle"));

      const activeItem = listContainer.querySelector(`.past-report-item[data-id="${activeId}"]`);
      if (activeItem) {
        activeItem.classList.add("bg-secondary-subtle");
      }
    }
  } catch (err) {
    console.error("❌ fetchAndDisplayPastReportList エラー:", err);
    listContainer.innerHTML = `<div class="text-danger text-center small py-4">一覧の取得に失敗しました。</div>`;
  }
}

/**
 * 特定のレポートIDを指定して単体データを取得し、詳細画面に表示する関数
 */
async function fetchAndDisplaySingleReport(reportId) {
  try {
    console.log(`【report.js】ID: ${reportId} のレポートを詳細表示します...`);

    const { data: report, error } = await supabase
      .from("report_logs")
      .select(
        `
    *,
    report_shares (
      user_id,
      is_read,
      read_at,
      user_master (
        id,
        last_name,
        first_name,
        company_id
      )
    )
  `,
      )
      .eq("id", reportId)
      .single();

    if (error) throw error;

    if (report) {
      // 投稿者の user_master を個別取得
      const { data: author } = await supabase.from("user_master").select("id, last_name, first_name").eq("id", report.user_id).single();

      // 取得した投稿者情報を report.user_master に格納
      report.user_master = author || null;
    }

    // Supabaseの既読更新ロジック
    // 他人のレポート、かつ自分が共有先に含まれていて、まだ「未読」の場合のみ自動更新
    const isMyReport = report.user_id === loginUser.id;

    if (!isMyReport && report.report_shares) {
      // 共有先リストを配列として安全に扱う
      const sharesArray = Array.isArray(report.report_shares) ? report.report_shares : [report.report_shares];

      // 共有先リストの中から「自分（ログインユーザー）」のデータを探す
      const myShare = sharesArray.find((s) => s && s.user_id === loginUser.id);

      // 自分が共有先にいて、かつまだ未読（is_read === false）ならDBを更新！
      if (myShare && !myShare.is_read) {
        console.log(`【report.js】未読のため、既読に更新します。レポートID: ${reportId}`);

        const { error: updateError } = await supabase
          .from("report_shares")
          .update({
            is_read: true,
            read_at: new Date().toISOString(), // 2026年現在の正確な日時を記録
          })
          .eq("report_id", reportId)
          .eq("user_id", loginUser.id);

        if (updateError) {
          console.error("既読ステータスの更新に失敗しました:", updateError);
        } else {
          console.log(`【report.js】レポートID: ${reportId} を正常に既読に更新しました！`);

          // 🔔閲覧されたレポートの通知（notifications）を物理削除してベルマーク更新
          if (typeof clearNotificationOnReportRead === "function") {
            await clearNotificationOnReportRead(reportId);
          }

          // DBを更新したので、画面上のreportオブジェクト内の自分のステータスも既読に書き換える
          myShare.is_read = true;
          myShare.read_at = new Date().toISOString();

          // 🎯 1. 新規作成後のガードフラグを解除（後続の描画をブロックさせない）
          window.isJustSaved = false;

          // 🎯 2. リロード不要でUIを即時「既読」へ書き換える（DOM直接更新）
          const targetItem = document.querySelector(`.past-report-item[data-id="${reportId}"]`);
          if (targetItem) {
            // ① NEWバッジを消去
            const badge = targetItem.querySelector("span[style*='background-color: #e0e7ff']");
            if (badge) badge.remove();

            // ② 未読アイコン（丸）を既読アイコン（書類）に変更
            const icon = targetItem.querySelector("i.bi-circle-fill");
            if (icon) {
              icon.className = "bi bi-file-earmark";
              icon.style.color = "#c7d2fe";
              icon.style.fontSize = "0.85rem";
            }

            // ③ 左端のインジケーターの色を既読カラーへ変更
            const leftBorder = targetItem.querySelector("div[style*='background-color: #6366f1']");
            if (leftBorder) {
              leftBorder.style.backgroundColor = "#c7d2fe";
            }

            // ④ 太字テキストを通常のフォントに戻す
            const textSpan = targetItem.querySelector(".fw-bold");
            if (textSpan) {
              textSpan.classList.remove("fw-bold", "text-dark");
              textSpan.classList.add("text-body");
            }

            // ⑤ 既読更新に伴い、ミニカレンダーの未読マーク（青三角）も即座に再描画して消す
            const monthInput = document.getElementById("display_period");
            if (monthInput && monthInput.value && typeof renderReportCalendar === "function") {
              const [y, m] = monthInput.value.split("-").map(Number);
              await renderReportCalendar(y, m);
            }
          }
        }
      }
    }

    // 画面上のフィールド（埋め込み領域等）へのマッピングを実行
    mapReportToDisplay(report);
    if (typeof highlightSelectedReportItem === "function") {
      highlightSelectedReportItem(reportId);
    }

    // 現在表示中のページ（data-page）または要素の存在で画面を判別
    // 1. サイドバーで active になっている nav-item の data-page を取得
    const activeNavItem = document.querySelector(".sidebar-nav .nav-item.active");
    const activePage = activeNavItem ? activeNavItem.getAttribute("data-page") : null;

    // 2. または、メイン画面固有の要素（出退勤ボタンやメイン画面用のコンテナ等）が存在するかチェック
    const isMainScreenElement = document.getElementById("main_clock_in") !== null;

    // activePage が "home" であるか、またはメイン画面固有の要素が見えている場合はメイン画面
    const isMainPage = activePage === "home" || (activePage !== "report" && isMainScreenElement);

    if (isMainPage) {
      // 💡 保存直後（window.isJustSaved === true）の自動描画時のみモーダルをスキップ
      if (window.isJustSaved) {
        console.log("【メイン画面】保存直後のためモーダル起動をスキップしました。");
      } else {
        // 🎯 手動クリック時はメイン画面でもモーダルを起動する！
        console.log("【メイン画面】手動選択のためモーダルを開きます。");
        if (typeof openEditReportModal === "function") {
          openEditReportModal(report);
        } else {
          const modalElement = document.getElementById("modal_report_entry");
          if (modalElement) {
            const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
            modal.show();
          }
        }
      }
    } else {
      // ■ レポート画面の場合：画面内の詳細エリアに描画
      console.log("【レポート画面】画面内の詳細エリアに描画しました。");
      if (window.innerWidth <= 991) {
        const detailCard = document.querySelector(".report-detail-card");
        if (detailCard) {
          detailCard.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      }
    }
  } catch (err) {
    console.error("レポートの単体取得・表示中にエラーが発生しました:", err);
  }
}

/**
 * 取得したデータを画面のHTML要素にマッピングする関数
 */
function mapReportToDisplay(report) {
  currentDisplayReportData = report;

  // 編集ボタンの表示・非表示、および見た目の完全リセット制御
  const editBtn = document.getElementById("report_edit_button");

  if (editBtn) {
    // 1. 属性としてのdisabledを完全に削除
    editBtn.removeAttribute("disabled");
    editBtn.disabled = false;

    const isMyReport = report && loginUser && report.user_id === loginUser.id;

    if (isMyReport) {
      // 自分のレポートの場合：表示して色をくっきりさせる
      editBtn.classList.remove("d-none");
      editBtn.classList.remove("disabled");
      editBtn.classList.add("btn-outline-secondary");
      editBtn.classList.remove("btn-secondary");
      editBtn.style.setProperty("opacity", "1", "important");
      editBtn.style.pointerEvents = "auto";
    } else {
      // 他人のレポート、またはレポートがない場合は完全に非表示
      editBtn.classList.add("d-none");
    }
  }

  // 1. 期間データの整形（開始〜終了）
  let periodText = report.work_period_start || "-";
  if (report.work_period_end && report.work_period_start !== report.work_period_end) {
    periodText += " 〜 " + report.work_period_end;
  }

  // 報告種別によって「作業内容」の表示を完全切り替え
  const freeWorkDiv = document.getElementById("view_work_content");
  const weeklyWorkDiv = document.getElementById("view_work_content_weekly");

  if (report.report_type === "週報") {
    if (freeWorkDiv) freeWorkDiv.classList.add("d-none");
    if (weeklyWorkDiv) weeklyWorkDiv.classList.remove("d-none");

    if (report.work_content) {
      try {
        const weeklyData = JSON.parse(report.work_content);
        if (document.getElementById("view_work_mon")) document.getElementById("view_work_mon").innerText = weeklyData.mon || "-";
        if (document.getElementById("view_work_tue")) document.getElementById("view_work_tue").innerText = weeklyData.tue || "-";
        if (document.getElementById("view_work_wed")) document.getElementById("view_work_wed").innerText = weeklyData.wed || "-";
        if (document.getElementById("view_work_thu")) document.getElementById("view_work_thu").innerText = weeklyData.thu || "-";
        if (document.getElementById("view_work_fri")) document.getElementById("view_work_fri").innerText = weeklyData.fri || "-";
        if (document.getElementById("view_work_sat")) document.getElementById("view_work_sat").innerText = weeklyData.sat || "-";
        if (document.getElementById("view_work_sun")) document.getElementById("view_work_sun").innerText = weeklyData.sun || "-";
      } catch (e) {
        console.warn("週報の作業内容パースに失敗しました。プレーンテキストとして処理します。", e);
        if (freeWorkDiv) {
          freeWorkDiv.innerText = report.work_content || "-";
          freeWorkDiv.classList.remove("d-none");
        }
        if (weeklyWorkDiv) weeklyWorkDiv.classList.add("d-none");
      }
    }
  } else {
    if (freeWorkDiv) {
      freeWorkDiv.innerText = report.work_content || "-";
      freeWorkDiv.classList.remove("d-none");
    }
    if (weeklyWorkDiv) weeklyWorkDiv.classList.add("d-none");
  }

  // 【提出日・更新日の時間付き制御版】
  const reportDateSpan = document.getElementById("view_report_date");
  const updatedAtSpan = document.getElementById("view_updated_at");
  const updatedAtWrapper = document.getElementById("view_updated_at_wrapper");

  if (reportDateSpan && updatedAtSpan) {
    const createdAtStr = report.created_at;
    const updatedAtStr = report.updated_at;

    if (createdAtStr && updatedAtStr) {
      const createDateObj = new Date(createdAtStr);
      const cYyyy = createDateObj.getFullYear();
      const cMm = String(createDateObj.getMonth() + 1).padStart(2, "0");
      const cDd = String(createDateObj.getDate()).padStart(2, "0");
      const cHh = String(createDateObj.getHours()).padStart(2, "0");
      const cMin = String(createDateObj.getMinutes()).padStart(2, "0");
      reportDateSpan.innerText = `${cYyyy}-${cMm}-${cDd} ${cHh}:${cMin}`;

      const createTime = Date.parse(createdAtStr);
      const updateTime = Date.parse(updatedAtStr);

      if (!isNaN(createTime) && !isNaN(updateTime) && Math.abs(updateTime - createTime) >= 60000) {
        const updateDateObj = new Date(updatedAtStr);
        const uYyyy = updateDateObj.getFullYear();
        const uMm = String(updateDateObj.getMonth() + 1).padStart(2, "0");
        const uDd = String(updateDateObj.getDate()).padStart(2, "0");
        const uHh = String(updateDateObj.getHours()).padStart(2, "0");
        const uMin = String(updateDateObj.getMinutes()).padStart(2, "0");

        updatedAtSpan.innerText = `${uYyyy}-${uMm}-${uDd} ${uHh}:${uMin}`;
        if (updatedAtWrapper) updatedAtWrapper.classList.remove("d-none");
      } else {
        updatedAtSpan.innerText = "-";
        if (updatedAtWrapper) updatedAtWrapper.classList.add("d-none");
      }
    } else {
      reportDateSpan.innerText = "-";
      updatedAtSpan.innerText = "-";
      if (updatedAtWrapper) updatedAtWrapper.classList.add("d-none");
    }
  }

  // ==========================================================================
  // 🌟 フルネームの動的組み立て（不要なテスト用固定値ブロックを除去）
  // ==========================================================================
  let currentReporterName = "ユーザー";

  if (report) {
    // 1. まず report に紐づく user_master から名前を組み立てる
    if (report.user_master) {
      const master = Array.isArray(report.user_master) ? report.user_master[0] : report.user_master;
      if (master) {
        currentReporterName = `${master.last_name || ""} ${master.first_name || ""}`.trim();
      }
    }

    // 2. もし user_master に名前がなく、自分のレポートの場合のみ loginUser を使用
    if ((!currentReporterName || currentReporterName === "ユーザー") && String(report.user_id) === String(loginUser?.id)) {
      currentReporterName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim() || "自分";
    }
  }

  // ==========================================================================
  // 🌟 HTML要素のIDとDBカラム・変数の正しいマッピング
  // ==========================================================================
  const mapping = {
    view_reporter_name: currentReporterName,
    view_report_title: report.subject_title || "-",
    view_report_type: report.report_type || "-",
    view_work_location: report.work_location || "-",
    view_work_period: periodText || "-",
    view_customer_name: report.customer_name || "-",
    view_companion_name: report.companion_name || "-",
    view_instructor_name: report.instructor_name || "-",
    view_content_impression: report.content_impression || "-",
    view_content_remaining_work: report.content_remaining_work || "-",
    view_content_near_goal: report.content_near_goal || "-",
    view_content_issue: report.content_issue || "-",
    view_content_action_plan: report.content_action_plan || "-",
    view_next_schedule: report.next_schedule || "-",
    view_content_notice: report.content_notice || "-",
  };

  Object.keys(mapping).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerText = mapping[id];
    }
  });

  // ==========================================================================
  // 🌟 大見出し（詳細内容のトップ）
  // ==========================================================================
  const alternativeHeaderEl = document.getElementById("view_report_title_header");
  if (alternativeHeaderEl) {
    const isDraft = report.status === "draft";
    const displayReportType = typeof rType !== "undefined" ? rType : report.report_type === "weekly" ? "週報" : "日報";

    // 💡 自分のレポートかどうかを判定（loginUserが存在し、レポートのユーザーIDと一致するか）
    const isMyReport = report && loginUser && report.user_id === loginUser.id;

    if (isDraft) {
      // 下書きの場合
      alternativeHeaderEl.innerHTML = `
      <div class="d-flex align-items-center" style="font-size: 1.1rem;">
        <div style="width: 3px; height: 20px; background-color: #eab308; border-radius: 2px; margin-right: 10px;"></div>
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-pencil" style="color: #ca8a04; font-size: 1rem;"></i>
          <span class="fw-semibold text-dark">
            ${displayReportType}：${currentReporterName}
          </span>
          <span class="ms-2 report-status-badge" style="font-size: 0.65rem; background-color: #fef9c3; color: #713f12; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 500;">下書き</span>
        </div>
      </div>
    `;
    } else {
      // 提出済みの場合（さらに「自分」か「他人」かで分岐）
      if (isMyReport) {
        // 自分の提出済みレポート
        alternativeHeaderEl.innerHTML = `
          <div class="d-flex align-items-center" style="font-size: 1.1rem;">
            <div style="width: 3px; height: 20px; background-color: #475569; border-radius: 2px; margin-right: 10px;"></div>
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-clipboard-check" style="color: #475569; font-size: 1rem;"></i>
              <span class="fw-semibold text-dark">
                ${displayReportType}：${currentReporterName}
              </span>
            </div>
          </div>
        `;
      } else {
        // 他人のレポート（ご指定のスタイル適用）
        alternativeHeaderEl.innerHTML = `
          <div class="d-flex align-items-center" style="font-size: 1.1rem;">
            <div style="width: 3px; height: 20px; background-color: #c7d2fe; border-radius: 2px; margin-right: 10px;"></div>
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark" style="color: #c7d2fe; font-size: 1rem;"></i>
              <span class="fw-semibold text-dark">
                ${displayReportType}：${currentReporterName}
              </span>
            </div>
          </div>
        `;
      }
    }
  }

  // ==========================================================================
  // 3. 空データ用および各種バッジ・ポップオーバーの制御
  // ==========================================================================
  const emptyDiv = document.getElementById("report_detail_empty");
  const viewDiv = document.getElementById("report_detail_view");
  if (emptyDiv && viewDiv) {
    emptyDiv.classList.add("d-none");
    viewDiv.classList.remove("d-none");
  }

  const detailBadgeSpan = document.getElementById("view_report_status_badge");
  if (detailBadgeSpan) {
    if (report.is_active === false) {
      detailBadgeSpan.innerHTML = `<span class="badge bg-warning text-white rounded fw-bold px-2 py-0.5" style="font-size: 0.75rem; letter-spacing: 0.05em;">下書き</span>`;
    } else {
      detailBadgeSpan.innerHTML = "";
    }
  }

  const sharedWithDiv = document.getElementById("view_shared_with");
  if (sharedWithDiv) {
    const rawShares = Array.isArray(report.report_shares) ? report.report_shares : [];

    // 1. 共有相手のユーザーマスタから会社IDを抽出
    const sharedCompanyIds = new Set();
    rawShares.forEach((share) => {
      if (share && share.user_master && share.user_master.company_id) {
        sharedCompanyIds.add(share.user_master.company_id);
      }
    });

    // 2. もし自分自身しかその会社におらず report_shares が空になった場合でも、
    // レポート作成者の company_id をフォールバックとして保持
    if (sharedCompanyIds.size === 0 && report.user_master && report.user_master.company_id) {
      sharedCompanyIds.add(report.user_master.company_id);
    }

    const ARC_RETON_ID = "b91cf02c-7614-4baa-9ee0-de42c1311d81";
    const ARC_KUCHO_ID = "d4594757-127a-4a2c-abf7-95828e03698c";

    let badgeHtml = "";

    if (sharedCompanyIds.has(ARC_RETON_ID)) {
      badgeHtml += `<span class="badge border border-secondary-subtle text-secondary rounded fw-medium px-2 py-1 me-1" style="font-size: 0.75rem;">株式会社アークリトン（全体）</span>`;
    }
    if (sharedCompanyIds.has(ARC_KUCHO_ID)) {
      badgeHtml += `<span class="badge border border-secondary-subtle text-secondary rounded fw-medium px-2 py-1 me-1" style="font-size: 0.75rem;">株式会社アーク空調設備（全体）</span>`;
    }

    sharedWithDiv.innerHTML = badgeHtml || '<span class="text-muted">ー</span>';
  }

  const readStatusWrapper = document.getElementById("read_status_wrapper");
  const btnReadStatus = document.getElementById("btn_read_status");

  if (readStatusWrapper && btnReadStatus) {
    const oldPopover = bootstrap.Popover.getInstance(btnReadStatus);
    if (oldPopover) oldPopover.dispose();

    const isMyReport = report && loginUser && String(report.user_id) === String(loginUser.id);
    const isDraft = report.status === "draft";

    // 💡 共有データを安全に処理（user_masterの有無に関わらず相手を抽出）
    let rawShares = Array.isArray(report.report_shares) ? report.report_shares : [];

    // 自分以外の共有相手をフィルタリング（IDの型差異を考慮してString比較）
    const shares = rawShares.filter((s) => {
      if (!s) return false;
      const shareUserId = s.user_id || (s.user_master ? s.user_master.id : null);
      // 自分以外の共有先を残す
      return shareUserId && String(shareUserId) !== String(loginUser?.id);
    });

    // 「下書きでない」かつ「自分のレポート」の場合
    if (!isDraft && report.is_active !== false && isMyReport) {
      // 共有先が存在する場合のみ表示
      if (shares.length > 0) {
        readStatusWrapper.classList.remove("d-none");

        const readCount = shares.filter((s) => s && s.is_read).length;
        const totalCount = shares.length;

        let stackHtml = `
          <div class="d-flex align-items-center gap-2" style="user-select: none; padding-right: 8px;">
            <span class="text-muted d-flex align-items-center me-1" style="font-size: 0.75rem; font-weight: 500;">
              <i class="bi bi-eye me-1" style="font-size: 0.85rem; color: #64748b;"></i>既読状況 (${readCount}/${totalCount})
            </span>
            <div class="d-flex align-items-center" style="padding-left: 8px;">
        `;

        shares.forEach((share, index) => {
          // user_masterが存在しない場合でもフォールバック表示できる対応
          const uMaster = share.user_master || {};
          const initialLetter = (uMaster.last_name || uMaster.first_name || share.user_name || "共").charAt(0);
          const fullName = `${uMaster.last_name || ""} ${uMaster.first_name || ""}`.trim() || share.user_name || "共有ユーザー";

          if (share.is_read) {
            let timeStr = "";
            if (share.read_at) {
              const rDate = new Date(share.read_at);
              timeStr = ` (${String(rDate.getMonth() + 1).padStart(2, "0")}/${String(rDate.getDate()).padStart(2, "0")} ${String(rDate.getHours()).padStart(2, "0")}:${String(rDate.getMinutes()).padStart(2, "0")} 既読)`;
            }
            const tooltipText = `${fullName}${timeStr}`;

            stackHtml += `
              <div class="avatar-stack-item d-flex align-items-center justify-content-center fw-semibold" 
                   title="${tooltipText}"
                   style="
                     width: 24px; 
                     height: 24px; 
                     background-color: #e0e7ff; 
                     color: #4338ca; 
                     border: 2px solid #ffffff; 
                     border-radius: 50%; 
                     font-size: 0.65rem; 
                     margin-left: -8px; 
                     cursor: pointer;
                     box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                     transition: transform 0.15s ease, z-index 0.15s ease;
                     position: relative;
                     z-index: ${totalCount - index};
                   "
                   onmouseover="this.style.transform='translateY(-3px) scale(1.1)'; this.style.zIndex='99';"
                   onmouseout="this.style.transform='none'; this.style.zIndex='${totalCount - index}';">
                ${initialLetter}
              </div>
            `;
          } else {
            stackHtml += `
              <div class="avatar-stack-item d-flex align-items-center justify-content-center text-muted" 
                   title="${fullName}（未読）"
                   style="
                     width: 24px; 
                     height: 24px; 
                     background-color: #f8fafc; 
                     color: #94a3b8; 
                     border: 2px solid #ffffff; 
                     outline: 1px dashed #cbd5e1;
                     border-radius: 50%; 
                     font-size: 0.65rem; 
                     margin-left: -8px; 
                     cursor: pointer;
                     opacity: 0.55;
                     transition: transform 0.15s ease, z-index 0.15s ease, opacity 0.15s ease;
                     position: relative;
                     z-index: ${totalCount - index};
                   "
                   onmouseover="this.style.transform='translateY(-3px) scale(1.1)'; this.style.zIndex='99'; this.style.opacity='1';"
                   onmouseout="this.style.transform='none'; this.style.zIndex='${totalCount - index}'; this.style.opacity='0.55';">
                ${initialLetter}
              </div>
            `;
          }
        });

        stackHtml += `
            </div>
          </div>
        `;

        btnReadStatus.style.pointerEvents = "auto";
        btnReadStatus.style.border = "none";
        btnReadStatus.style.background = "none";
        btnReadStatus.style.padding = "0";

        btnReadStatus.removeAttribute("data-bs-toggle");
        btnReadStatus.removeAttribute("data-bs-trigger");

        btnReadStatus.innerHTML = stackHtml;
      } else {
        readStatusWrapper.classList.add("d-none");
      }
    } else {
      readStatusWrapper.classList.add("d-none");
    }
  }
}

/**
 * モーダル側から呼び出され、保存先の年月に合わせて画面全体を更新・追尾する関数
 * @param {number|string} [targetYear] - 追尾したい年 (例: 2026) または "2026-07" 形式の文字列、あるいは保存されたレポートIDの場合もある
 * @param {number|string} [targetMonth] - 追尾したい月 (例: 7)
 * @param {string} [specificReportId] - 🎯 追加: 保存直後にピンポイントで表示したいレポートID
 */
let isRefreshingInProgress = 0; // 👈 連続実行を防ぐためのガード用変数

async function refreshReportList(targetYear, targetMonth, specificReportId = null) {
  // 🎯【最強ガード1】保存直後（isJustSaved）で、かつ引数に特定のレポートIDが無い自動リフレッシュ呼び出しは、
  // 完全に無視して1回目の「最新1件を表示」をブロックする！
  if (window.isJustSaved && !specificReportId) {
    console.log("⚠️ 【report.js】保存処理中のため、引数なしの自動リフレッシュを完全ブロックしました。");
    return;
  }

  // 🎯【ガード2】特定IDが渡された場合は、即座にフラグを立てて後続の自動選択をロックする
  if (specificReportId) {
    window.isJustSaved = true;
  }

  // 🎯【ガード3】すでにリフレッシュ処理中の重なりをガード
  if (isRefreshingInProgress > 0 && !specificReportId) {
    console.log("【report.js】重複する自動リフレッシュ要求をガードしました。");
    return;
  }

  isRefreshingInProgress++;
  console.log("【report.js】データの更新を検知しました。画面をリフレッシュ・追尾します...");

  try {
    const monthInput = document.getElementById("display_period");

    // ① 引数が "YYYY-MM" 形式で渡された場合の対応
    if (typeof targetYear === "string" && targetYear.includes("-")) {
      const [y, m] = targetYear.split("-").map(Number);
      targetYear = y;
      targetMonth = m;
    }

    // ② 保存された年月が指定されている場合、画面の指定年月を自動書き換え
    if (targetYear && targetMonth && monthInput) {
      const formattedPeriod = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
      monthInput.value = formattedPeriod;
    }

    // ③ カレンダーの更新
    if (typeof renderReportCalendar === "function") {
      if (targetYear && targetMonth) {
        await renderReportCalendar(targetYear, targetMonth);
      } else if (monthInput && monthInput.value) {
        const [y, m] = monthInput.value.split("-").map(Number);
        await renderReportCalendar(y, m);
      } else {
        const now = new Date();
        await renderReportCalendar(now.getFullYear(), now.getMonth() + 1);
      }
    }

    // ④ 🎯 保存直後（specificReportIdがある場合）のピンポイント表示
    if (specificReportId) {
      // 1. グローバル変数を保存したIDで即座にロック
      if (typeof currentReportId !== "undefined") currentReportId = specificReportId;
      if (typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
        currentDisplayReportData.id = specificReportId;
      }

      // 2. 自動選択（1件目を勝手に選ぶ挙動）を無効化するフラグを立てる
      window.isJustSaved = true;

      // 3. UIの表示切り替え（初期メッセージを隠して詳細表示部を出す）
      const emptyDiv = document.getElementById("report_detail_empty");
      const viewDiv = document.getElementById("report_detail_view");
      if (emptyDiv) emptyDiv.classList.add("d-none");
      if (viewDiv) viewDiv.classList.remove("d-none");

      // 4. 【ステップ1】まずリスト（過去のレポート）を最新の状態に描画・更新する
      if (typeof fetchAndDisplayPastReportList === "function") {
        // 💡 targetYear と targetMonth から "YYYY-MM" 形式の文字列を作成する
        let formattedYearMonth = null;
        if (targetYear && targetMonth) {
          formattedYearMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
        }

        // ユーザーフィルターを取得
        const filterUserVal = document.getElementById("target_user_id")?.value || "all";

        // 第1引数: ユーザーフィルター, 第2引数: "2026-07" 形式の文字列, 第3引数: 保存したレポートID
        await fetchAndDisplayPastReportList(filterUserVal, formattedYearMonth, specificReportId);
      } else if (typeof updateMainPageReportList === "function") {
        await updateMainPageReportList(targetYear, targetMonth);
      }

      // 5. 【ステップ2】保存したレポートのデータを詳細エリアに直接セット・描画する
      if (typeof fetchAndDisplaySingleReport === "function") {
        await fetchAndDisplaySingleReport(specificReportId);
      }

      // 6. 【ステップ3】🎯 リスト描画完了後に、保存したレポート行へスクロール＆ハイライト追尾！
      setTimeout(() => {
        if (typeof highlightSelectedReportItem === "function") {
          highlightSelectedReportItem(specificReportId);
        }

        // DOM要素を直接探してスクロール追尾させる
        const targetRow = document.querySelector(`[data-report-id="${specificReportId}"]`);
        if (targetRow) {
          // 💡 スマホ（991px以下）以外の場合のみ、画面をスムーズスクロール追尾させる
          const isMobile = window.innerWidth <= 991;
          if (!isMobile) {
            targetRow.scrollIntoView({ behavior: "smooth", block: "center" });
          }

          targetRow.classList.add("table-active", "highlight-flash");
          setTimeout(() => {
            targetRow.classList.remove("highlight-flash");
          }, 2000);
        }
      }, 150);

      // 7. フラグを少し遅れて解除
      setTimeout(() => {
        window.isJustSaved = false;
      }, 800);

      return; // ここで処理を確実に終了
    }

    // ⑤ 通常のリフレッシュ時
    if (typeof fetchAndDisplayPastReportList === "function") {
      await fetchAndDisplayPastReportList();
    }

    if (typeof handleReportFilterChange === "function") {
      await handleReportFilterChange();
    }
  } finally {
    // 処理が終わったらガードを解除（少し遅延させて連続入力を防ぐ）
    setTimeout(() => {
      isRefreshingInProgress = Math.max(0, isRefreshingInProgress - 1);
    }, 300);
  }
}

// 外部モーダル（report-modal.js）から参照できるようにグローバル展開
window.refreshReportList = refreshReportList;
window.onReportSavedSuccess = refreshReportList;

/**
 * レポート用ミニカレンダーを描画する関数（複数レポート＆同日下書き・提出済み併記対応版）
 */
async function renderReportCalendar(targetYear, targetMonth) {
  const container = document.getElementById("report_mini_calendar");
  if (!container) return;

  const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${lastDay}`;

  const filterUserVal = document.getElementById("target_user_id")?.value || "all";

  let holidays = {};
  const reportMap = {}; // 日付ごとに配列でレポートを格納する { '2026-07-21': [ {...}, {...} ] }

  try {
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient) {
      // ⭕ 1. リレーション結合を外し、report_logs をシンプルに取得
      let query = supabaseClient
        .from("report_logs")
        .select(
          `
            id, report_date, user_id, is_active, report_type, status, created_at, updated_at,
            report_shares ( user_id, is_read )
          `,
        )
        .gte("report_date", startDate)
        .lte("report_date", endDate);

      if (filterUserVal === "mine") {
        query = query.eq("user_id", loginUser?.id);
      } else if (filterUserVal !== "all") {
        query = query.eq("user_id", filterUserVal);
      }

      let [reportsResult, holidaysResult] = await Promise.all([
        query,
        supabaseClient.from("holiday_master").select("holiday_date, name").gte("holiday_date", startDate).lte("holiday_date", endDate),
      ]);

      if (reportsResult.data && reportsResult.data.length > 0) {
        const allReports = reportsResult.data;

        // ⭕ 2. user_master を別クエリで取得して手動マッピング (サイドバーと同一ロジック)
        const uniqueUserIds = [...new Set(allReports.map((r) => r.user_id).filter(Boolean))];
        let userMasterMap = {};

        if (uniqueUserIds.length > 0) {
          const { data: users } = await supabaseClient.from("user_master").select("id, last_name, first_name").in("id", uniqueUserIds);

          if (users) {
            users.forEach((u) => {
              userMasterMap[u.id] = u;
            });
          }
        }

        // 各レポートに user_master を結合
        allReports.forEach((r) => {
          r.user_master = userMasterMap[r.user_id] || null;
        });

        // ⭕ 3. レポートの解析と reportMap への追加処理
        allReports.forEach((r) => {
          const currentLoginId = String(loginUser?.id || loginUser?.user_id || "").trim();
          const reportUserId = String(r.user_id || "").trim();

          const isMyReport = currentLoginId !== "" && currentLoginId === reportUserId;

          // 他人の下書きは表示しない
          if (!isMyReport && r.status === "draft") return;

          // 既読・未読の判定
          let isRead = false;
          if (isMyReport) {
            isRead = true;
          } else {
            const shares = Array.isArray(r.report_shares) ? r.report_shares : r.report_shares ? [r.report_shares] : [];
            const myShare = shares.find((s) => s && String(s.user_id).trim() === currentLoginId);
            isRead = myShare ? Boolean(myShare.is_read) : false;
          }

          // ⭕ フィルター処理
          if (filterUserVal === "all") {
            // 「全てのレポート」選択時：
            if (!isMyReport) {
              if (r.is_active === false) return;

              // 💡【修正】既読になった他人のレポートも除外せず、既読アイコンとして表示するためコメントアウト
              // if (isRead) return;

              const isSharedToMe = r.report_shares && r.report_shares.some((s) => String(s.user_id).trim() === currentLoginId);
              if (!isSharedToMe) return;
            }
          } else if (filterUserVal !== "mine") {
            // プルダウンで「特定の人」を選択時
            if (r.is_active === false) return;
          }

          // 【表示名の組み立て】(サイドバーと同じ優先順位に統合)
          let userName = "";

          if (r.user_master) {
            const master = Array.isArray(r.user_master) ? r.user_master[0] : r.user_master;
            if (master && (master.last_name || master.first_name)) {
              userName = `${master.last_name || ""} ${master.first_name || ""}`.trim();
            }
          }

          if (!userName && isMyReport) {
            const myLastName = loginUser?.last_name || loginUser?.lastName || "";
            const myFirstName = loginUser?.first_name || loginUser?.firstName || "";
            userName = `${myLastName} ${myFirstName}`.trim() || loginUser?.name || "自分";
          }

          if (!userName) {
            userName = "名称未設定";
          }

          // 時間の整形 (HH:mm)
          const rawTime = r.created_at || r.updated_at || "";
          let timeStr = "";
          if (rawTime) {
            const d = new Date(rawTime);
            const hours = String(d.getHours()).padStart(2, "0");
            const minutes = String(d.getMinutes()).padStart(2, "0");
            timeStr = `${hours}:${minutes}`;
          }

          if (!reportMap[r.report_date]) {
            reportMap[r.report_date] = [];
          }

          reportMap[r.report_date].push({
            id: r.id,
            isMine: isMyReport,
            isRead: isRead,
            status: r.status,
            reportType: r.report_type || "日報",
            userName: userName,
            timeStr: timeStr,
            createdAt: rawTime,
          });
        });
      }

      // --- 祝日取得処理 ---
      const currentYear = new Date().getFullYear();
      if (targetYear >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        if (typeof syncHolidaysFromExternalAPI === "function") {
          await syncHolidaysFromExternalAPI(targetYear);
        } else {
          await _localFallbackSyncHolidays(targetYear);
        }

        const { data: reFetchResult } = await supabaseClient
          .from("holiday_master")
          .select("holiday_date, name")
          .gte("holiday_date", startDate)
          .lte("holiday_date", endDate);
        if (reFetchResult) holidaysResult.data = reFetchResult;
      }

      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }
    }
  } catch (err) {
    console.error("【ミニカレンダー】データのロードまたは祝日同期に失敗しました:", err);
  }

  // --- カレンダーHTML生成 (元のロジックを維持) ---
  const firstDayOfWeek = new Date(targetYear, targetMonth - 1, 1).getDay();
  const prevMonthLastDay = new Date(targetYear, targetMonth - 1, 0).getDate();
  let cells = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDay - i, isCurrentMonth: false, dateStr: null });
  }

  for (let day = 1; day <= lastDay; day++) {
    cells.push({
      day: day,
      isCurrentMonth: true,
      dateStr: `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    });
  }

  const totalCells = Math.ceil(cells.length / 7) * 7;
  const nextMonthNeed = totalCells - cells.length;
  for (let day = 1; day <= nextMonthNeed; day++) {
    cells.push({ day: day, isCurrentMonth: false, dateStr: null });
  }

  let html = `<table class="report-cal-table">
    <thead>
      <tr>
        <th class="text-danger">日</th>
        <th>月</th>
        <th>火</th>
        <th>水</th>
        <th>木</th>
        <th>金</th>
        <th>土</th>
      </tr>
    </thead>
    <tbody><tr>`;

  const todayStr = new Date().toISOString().split("T")[0];

  cells.forEach((cell, index) => {
    if (index > 0 && index % 7 === 0) {
      html += `</tr><tr>`;
    }

    const dayReports = cell.dateStr ? reportMap[cell.dateStr] || [] : [];
    const isToday = cell.dateStr === todayStr ? "today" : "";
    const hasReport = dayReports.length > 0 ? "has-report" : "";

    let dayTypeClass = "";
    let cellTitle = "";

    if (!cell.isCurrentMonth) {
      dayTypeClass = "other-month";
    } else {
      const checkDate = new Date(targetYear, targetMonth - 1, cell.day);
      const dayOfWeek = checkDate.getDay();
      const holidayName = holidays[cell.day];

      if (holidayName) {
        dayTypeClass = "is-holiday";
        cellTitle = holidayName;
      } else if (dayOfWeek === 0) {
        dayTypeClass = "is-sunday";
      } else if (dayOfWeek === 6) {
        dayTypeClass = "is-sat";
      }
      if (hasReport) cellTitle = cellTitle ? `${cellTitle} / レポートを表示` : "レポートを表示";
    }

    let iconHtml = "";
    let unreadMarkerHtml = "";

    // ----------------------------------------------------
    // 【修正①】アイコン・未読マーク判定ロジックの適正化
    // ----------------------------------------------------
    const myDraftReps = dayReports.filter((r) => r.isMine && r.status === "draft");
    const mySubmittedReps = dayReports.filter((r) => r.isMine && r.status !== "draft");

    // ★ r.isRead フラグを正しく参照して他人の未読・既読を分ける
    const otherUnreadReps = dayReports.filter((r) => !r.isMine && r.status !== "draft" && !r.isRead);
    const otherReadReps = dayReports.filter((r) => !r.isMine && r.status !== "draft" && r.isRead);

    let icons = [];

    // ★ 未読があれば青い三角マーク（アイコン）を表示
    if (otherUnreadReps.length > 0) {
      unreadMarkerHtml = `<span class="cal-unread-dot-fixed" title="未読 ${otherUnreadReps.length}件"></span>`;
    }

    if (mySubmittedReps.length > 0) {
      const countBadge = mySubmittedReps.length > 1 ? `<span class="icon-count-badge">${mySubmittedReps.length}</span>` : "";
      icons.push(
        `<span class="icon-wrapper" title="提出済み ${mySubmittedReps.length}件"><i class="bi bi-file-earmark-check report-icon is-submitted"></i>${countBadge}</span>`,
      );
    }

    if (myDraftReps.length > 0) {
      const countBadge = myDraftReps.length > 1 ? `<span class="icon-count-badge">${myDraftReps.length}</span>` : "";
      icons.push(
        `<span class="icon-wrapper" title="下書き ${myDraftReps.length}件"><i class="bi bi-pencil report-icon is-draft"></i>${countBadge}</span>`,
      );
    }

    if (mySubmittedReps.length === 0 && myDraftReps.length === 0 && otherReadReps.length > 0) {
      const countBadge = otherReadReps.length > 1 ? `<span class="icon-count-badge">${otherReadReps.length}</span>` : "";
      icons.push(
        `<span class="icon-wrapper" title="既読 ${otherReadReps.length}件"><i class="bi bi-file-earmark report-icon is-read"></i>${countBadge}</span>`,
      );
    }

    if (icons.length > 0) {
      iconHtml = `<div class="calendar-report-bottom">${icons.join("")}</div>`;
    }

    const hasClickEvent = cell.dateStr && hasReport;

    html += `
  <td class="report-cal-day ${isToday} ${hasReport} ${dayTypeClass}" 
      ${hasClickEvent ? `onclick="handleCalendarDayClick('${cell.dateStr}')"` : ""}
      title="${cellTitle}">
    ${unreadMarkerHtml}
    <span class="day-num">${cell.day}</span>
    ${iconHtml}
  </td>
`;
  });

  html += `</tr></tbody></table>`;
  container.innerHTML = html;

  window.currentReportMap = reportMap;
}

/**
 * 内部用フォールバック：メインJSから祝日同期関数が見えない場合の安全弁
 */
async function _localFallbackSyncHolidays(year) {
  try {
    const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
    if (!response.ok) return;
    const holidayData = await response.json();
    const upsertRows = Object.entries(holidayData).map(([dateStr, name]) => ({
      holiday_date: dateStr,
      name: name,
      updated_at: new Date().toISOString(),
    }));
    if (upsertRows.length === 0) return;
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient) {
      await supabaseClient.from("holiday_master").upsert(upsertRows, { onConflict: "holiday_date" });
    }
  } catch (e) {
    console.error(e);
  }
}

// 共通基盤用へのAPI公開設定
window.initializeReportPage = initializeReportPage;
window.refreshReportList = refreshReportList;

// ==========================================================================
// 【レポート画面専用】過去のレポート行クリック処理（モーダル絶対阻止＆既読DB保存＆UI即時反映）
// ==========================================================================

/**
 * 描画された過去レポート行のモーダル起動属性を物理削除する処理
 */
function applyPastReportCustomHandler() {
  const reportRows = document.querySelectorAll("#past_report_list .past-report-item, .past-report-item");

  reportRows.forEach((row) => {
    // Bootstrapモーダルが自動起動しないように物理的に属性を削除
    row.removeAttribute("data-bs-toggle");
    row.removeAttribute("data-bs-target");
    row.style.cursor = "pointer";
  });
}

/**
 * 過去レポート行がクリックされた際の一連の処理（選択・UI変更・既読・詳細表示）
 */
async function handlePastReportRowClick(rowElement) {
  const reportId = rowElement.getAttribute("data-id") || rowElement.getAttribute("data-report-id") || rowElement.id;

  if (!reportId || reportId === "undefined") {
    return;
  }

  // ① フォーカス（ハイライト）処理の共通関数化呼び出し
  if (typeof highlightSelectedReportItem === "function") {
    highlightSelectedReportItem(reportId);
  }

  // ② 【UI即時反映】未読表示（青丸など）をその場で即座に解除
  const indicator = rowElement.querySelector('div[style*="background-color: #6366f1"]') || rowElement.querySelector('div[style*="#6366f1"]');
  if (indicator) {
    indicator.style.backgroundColor = "#c7d2fe";
  }

  const icon = rowElement.querySelector(".bi-circle-fill");
  if (icon) {
    icon.className = "bi bi-file-earmark ms-1";
    icon.style.color = "#c7d2fe";
    icon.style.fontSize = "0.85rem";
  }

  const textSpan = rowElement.querySelector(".text-dark.fw-bold");
  if (textSpan) {
    textSpan.className = "text-body fw-normal text-truncate ms-1";
  }

  const newBadge = rowElement.querySelector('span[style*="background-color: #e0e7ff"]') || rowElement.querySelector(".badge");
  if (newBadge && newBadge.textContent.trim() === "NEW") {
    newBadge.remove();
  }

  // ③ 【DB永続化】Supabaseの report_shares に既読を保存（既存の共有レコードのみ更新）
  try {
    const supabaseClient = window.supabase || supabase;
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (user) {
      const nowISO = new Date().toISOString();

      // upsert ではなく update を使用する（自分がもともと共有先に含まれている場合のみ更新）
      const { data, error } = await supabaseClient
        .from("report_shares")
        .update({
          is_read: true,
          read_at: nowISO,
          updated_at: nowISO,
        })
        .eq("report_id", reportId)
        .eq("user_id", user.id);

      if (error) {
        console.error("既読更新エラー:", error);
      } else {
        console.log("✏️ レポート画面：DBへの既読保存完了");
      }
    }
  } catch (dbErr) {
    console.error("既読処理のエラー:", dbErr);
  }

  // ④ データ取得＋詳細表示処理を実行
  if (typeof fetchAndDisplaySingleReport === "function") {
    await fetchAndDisplaySingleReport(reportId);
  }

  // ⑤ ミニカレンダー側の表示のみリフレッシュ（refreshReportListは呼ばない）
  const monthInput = document.getElementById("display_period");
  if (monthInput && monthInput.value) {
    const [y, m] = monthInput.value.split("-").map(Number);
    if (typeof renderReportCalendar === "function") {
      await renderReportCalendar(y, m);
    }
  }
}

// 🛡️ 最強ガード：document全体のキャプチャフェーズ(true)で過去レポートアイテムのクリックを横取りする
document.addEventListener(
  "click",
  (e) => {
    // メイン画面の要素（例: main.js固有の要素やカレンダー）が存在する場合は横取りせずに main.js に譲る
    const isMainPage = document.getElementById("calendar_grid") !== null || document.querySelector(".cal-unread-dot-fixed") !== null;
    if (isMainPage) {
      return;
    }

    const reportItem = e.target.closest("#past_report_list .past-report-item, .past-report-item");
    if (reportItem) {
      // 既存のモーダル発火・他イベントを完全にカット
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // モーダル属性を消去して処理を実行
      reportItem.removeAttribute("data-bs-toggle");
      reportItem.removeAttribute("data-bs-target");

      handlePastReportRowClick(reportItem);
    }
  },
  true, // ✨ true = キャプチャフェーズ
);

// 1. fetchAndDisplayPastReportList のオーバーライド
if (typeof fetchAndDisplayPastReportList === "function") {
  const originalFetchList = fetchAndDisplayPastReportList;

  fetchAndDisplayPastReportList = async function (...args) {
    const result = await originalFetchList(...args);
    applyPastReportCustomHandler();
    return result;
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const userSelect = document.getElementById("target_user_id");
  const monthInput = document.getElementById("display_period");

  const handleFilterChange = async (event) => {
    if (!monthInput || !monthInput.value) return;

    const [y, m] = monthInput.value.split("-").map(Number);

    if (event && event.target === monthInput) {
      if (userSelect) {
        userSelect.value = "all";
      }
    }

    // 1. その月のデータがある人だけにプルダウンを更新
    await updateTargetUserDropdownByMonth(y, m);

    // 💡 【追加】ここでプルダウンの選択肢が「すべて」や「自分」以外に実質的なユーザーがいない、
    // または月内データが0件の場合に強制的に disabled にする
    if (userSelect) {
      // "all" と "mine" 以外の動的オプションがいくつあるか数える
      const dynamicOptionsCount = Array.from(userSelect.options).filter(
        (opt) => opt.value !== "all" && opt.value !== "mine" && opt.value !== "",
      ).length;

      // もし他人の選択肢が1つもなく、さらに「（レポートなし）」などの状態であれば完全ロック
      if (dynamicOptionsCount === 0) {
        // 必要に応じて、データが全くない場合の判定をここで行う
      }
    }

    // 更新後の値を取得
    const selectedUserId = userSelect?.value || "all";
    const selectedPeriod = monthInput.value;

    // 2. 過去レポート一覧を再描画（ここで必ず選択された年月とユーザーで絞り込む）
    if (typeof fetchAndDisplayPastReportList === "function") {
      await fetchAndDisplayPastReportList(selectedUserId, selectedPeriod);
    }

    // 3. ミニカレンダーを再描画
    if (typeof renderReportCalendar === "function") {
      await renderReportCalendar(y, m, selectedUserId);
    }

    // 4. 最初の一件を選択状態にする等の後処理
    const firstReportItem = document.querySelector("#past_report_list .past-report-item");
    if (firstReportItem) {
      const reportId = firstReportItem.getAttribute("data-id") || firstReportItem.id;
      if (reportId && typeof fetchAndDisplaySingleReport === "function") {
        await fetchAndDisplaySingleReport(reportId);
      }
    } else {
      if (typeof clearReportDetailDisplay === "function") {
        clearReportDetailDisplay();
      } else {
        const emptyView = document.getElementById("report_detail_empty");
        const detailView = document.getElementById("report_detail_view");
        if (emptyView) emptyView.classList.remove("d-none");
        if (detailView) detailView.classList.add("d-none");
      }
    }

    if (typeof applyPastReportCustomHandler === "function") {
      applyPastReportCustomHandler();
    }
  };

  // イベント登録
  if (userSelect) userSelect.addEventListener("change", handleFilterChange);
  if (monthInput) monthInput.addEventListener("change", handleFilterChange);

  // 画面を開いた初期状態の処理（現在年月をセットして一度発火させる等）
  handleFilterChange();
});

// 3. DOM描画変更（MutationObserver）の継続監視
const observePastReportList = () => {
  const pastReportContainer = document.getElementById("past_report_list");
  if (pastReportContainer) {
    const observer = new MutationObserver(() => {
      applyPastReportCustomHandler();
    });
    observer.observe(pastReportContainer, { childList: true, subtree: true });
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observePastReportList);
} else {
  observePastReportList();
}

/* ==========================================================================
   📅 カレンダータップ時の選択ダイアログ制御関数
   ========================================================================== */
/**
 * 📋 同日に複数レポートがある場合の選択ダイアログ表示（提出日/作成日 表示対応版）
 */
function openReportSelectModal(dateStr, reports) {
  // 既存モーダルの削除
  const oldModal = document.getElementById("reportSelectModal");
  if (oldModal) oldModal.remove();

  // 優先度（下書き -> 未読 -> 自分の提出済み -> その他）で並び替え
  // ＋同じ優先度内では「作成日時/提出日時が最新のもの」を上にする（降順）
  reports.sort((a, b) => {
    const getPriority = (r) => {
      if (r.status === "draft") return 1;
      if (!r.isMine && !r.isRead) return 2;
      if (r.isMine) return 3;
      return 4;
    };

    const priorityA = getPriority(a);
    const priorityB = getPriority(b);

    // ① 優先度が異なる場合は、優先度順
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // ② 優先度が同じ場合は、作成日時（createdAtやreportDateなど）の新しい順（降順）
    const timeA = new Date(a.createdAt || a.created_at || a.updatedAt || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || b.updatedAt || 0).getTime();

    return timeB - timeA; // 👈 b - a にすることで最新（大きい数字）が上に来る！
  });

  // リストのHTML生成
  const listHtml = reports
    .map((r) => {
      let barColor = "#475569";
      let iconHtml = '<i class="bi bi-file-earmark me-2" style="color: #475569; font-size: 0.85rem;"></i>';
      let badgeHtml = "";

      if (r.status === "draft") {
        // ① 下書き
        barColor = "#eab308";
        iconHtml = '<i class="bi bi-pencil me-2" style="color: #ca8a04; font-size: 0.85rem;"></i>';
        badgeHtml =
          '<span class="ms-2" style="font-size: 0.65rem; background-color: #fef9c3; color: #713f12; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 500;">下書き</span>';
      } else if (!r.isMine && !r.isRead) {
        // ② 未読（NEW）
        barColor = "#6366f1";
        iconHtml = '<i class="bi bi-circle-fill me-2" style="color: #6366f1; font-size: 0.5rem; margin-left: 2px;"></i>';
        badgeHtml =
          '<span class="ms-2" style="font-size: 0.65rem; background-color: #e0e7ff; color: #4338ca; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;">NEW</span>';
      } else if (r.isMine) {
        // ③ 自分の提出済み
        barColor = "#475569";
        iconHtml = '<i class="bi bi-clipboard-check me-2" style="color: #475569; font-size: 0.85rem;"></i>';
        badgeHtml = "";
      } else {
        // ④ 他人の既読
        barColor = "#c7d2fe";
        iconHtml = '<i class="bi bi-file-earmark me-2" style="color: #c7d2fe; font-size: 0.85rem;"></i>';
        badgeHtml = "";
      }

      // 💡 過去一覧とデザインを合わせた「ちょこんとした縦線」
      const leftBarHtml = `<div style="width: 3px; height: 16px; background-color: ${barColor}; border-radius: 2px; margin-right: 10px; flex-shrink: 0;"></div>`;

      const displayTitle = `${r.reportType}：${r.userName}`;

      // 日時表示のフォーマット作成（YYYY-MM-DD HH:mm）
      let fullDateTimeStr = "";
      if (r.createdAt) {
        const d = new Date(r.createdAt);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const min = String(d.getMinutes()).padStart(2, "0");

        const label = r.status === "draft" ? "作成日" : "提出日";
        fullDateTimeStr = `${label}: ${yyyy}-${mm}-${dd} ${hh}:${min}`;
      }

      const dateDisplayHtml = fullDateTimeStr
        ? `<span class="text-secondary small me-2" style="font-size: 0.72rem; opacity: 0.85;">${fullDateTimeStr}</span>`
        : "";

      return `
      <button type="button" 
              class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-3 border-bottom position-relative" 
              style="border: none; border-bottom: 1px solid #f1f5f9 !important;"
              onclick="selectReportAndCloseModal('${r.id}')">
        <div class="d-flex align-items-center min-w-0 flex-grow-1">
          ${leftBarHtml}
          ${iconHtml}
          <span class="fw-medium text-dark ms-1 text-truncate" style="font-size: 0.85rem;">${displayTitle}</span>
          ${badgeHtml}
        </div>
        <div class="d-flex align-items-center flex-shrink-0 ms-2">
          ${dateDisplayHtml}
          <i class="bi bi-chevron-right text-muted fs-6"></i>
        </div>
      </button>
    `;
    })
    .join("");

  // 💡 日付文字列(YYYY-MM-DD)から曜日を取得
  const dayOfWeekStr = ["日", "月", "火", "水", "木", "金", "土"][new Date(dateStr.replace(/-/g, "/")).getDay()];
  const formattedDateWithDay = `${dateStr}(${dayOfWeekStr})`;

  // モーダル全体のHTML（案A ベース + 曜日表示）
  const modalHtml = `
    <div class="modal fade" id="reportSelectModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
      <div class="modal-dialog modal-dialog-centered" style="max-width: 480px;">
        <div class="modal-content shadow border-0" style="border-radius: 16px; overflow: hidden;">
          <div class="modal-header bg-white py-3 px-4 border-bottom" style="border-color: #f1f5f9 !important;">
            <div class="d-flex align-items-center">
              <!-- 日付タイトル（「2026-07-21(金)」までを太字強調） -->
              <h6 class="modal-title text-dark m-0 d-flex align-items-center" style="font-size: 0.95rem;">
                <span class="fw-bold" style="letter-spacing: -0.01em;">${formattedDateWithDay}</span>
                <span class="fw-normal text-secondary ms-1" style="font-size: 0.88rem;">のレポート</span>
              </h6>
              <!-- 件数バッジ -->
              <span class="badge rounded-pill fw-medium ms-2" style="background-color: #f1f5f9; color: #64748b; font-size: 0.72rem; padding: 0.35em 0.7em;">
                ${reports.length}件
              </span>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-0">
            <div class="list-group list-group-flush">
              ${listHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", modalHtml);

  const modalEl = document.getElementById("reportSelectModal");
  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

/**
 * ダイアログでレポート選択時の処理（確実に詳細表示＆過去一覧・カレンダー即時更新＆フォーカス着色）
 */
async function selectReportAndCloseModal(reportId) {
  console.log("👉 レポート選択実行 ID:", reportId);

  // ① モーダルを閉じる
  try {
    const modalEl = document.getElementById("reportSelectModal");
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
      if (bsModal) bsModal.hide();
    }
  } catch (mErr) {
    console.warn("モーダル非表示エラー (無視して続行):", mErr);
  }

  if (!reportId || reportId === "undefined") return;

  // ② DBへの既読保存 (report_shares) を【最優先】で完了させる（既存の共有レコードのみ更新）
  try {
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient && supabaseClient.auth) {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (user) {
        const nowISO = new Date().toISOString();

        // upsert から update に変更（共有データが存在する場合のみ既読に更新）
        const { data, error } = await supabaseClient
          .from("report_shares")
          .update({
            is_read: true,
            read_at: nowISO,
            updated_at: nowISO,
          })
          .eq("report_id", reportId)
          .eq("user_id", user.id);

        if (error) {
          console.error("⚠️ 既読更新エラー:", error);
        } else {
          console.log("✏️ 既読保存完了");
        }
      }
    }
  } catch (dbErr) {
    console.error("⚠️ 既読保存エラー (表示更新は継続):", dbErr);
  }

  // ③ 詳細エリアへレポートを描画
  try {
    if (typeof fetchAndDisplaySingleReport === "function") {
      await fetchAndDisplaySingleReport(reportId);
    }
  } catch (detailErr) {
    console.error("❌ 詳細描画エラー:", detailErr);
  }

  // ④ DB保存が確実に終わった状態で、過去一覧を再取得・再描画
  try {
    if (typeof fetchAndDisplayPastReportList === "function") {
      const userSelect = document.getElementById("target_user_id");
      const monthInput = document.getElementById("display_period");
      const currentPeriod = monthInput ? monthInput.value : undefined;
      const currentUserId = userSelect ? userSelect.value : "all";

      await fetchAndDisplayPastReportList(currentUserId, currentPeriod);
      console.log("✨ 過去レポート一覧の即時更新に成功しました");
    }
  } catch (listErr) {
    console.error("過去一覧の再読み込みエラー:", listErr);
  }

  // ⑤ ミニカレンダー側の表示を最新の DB（既読状態）を反映してリフレッシュ
  const monthInput = document.getElementById("display_period");
  const userSelect = document.getElementById("target_user_id");

  if (monthInput && monthInput.value) {
    const [y, m] = monthInput.value.split("-").map(Number);
    const selectedUserId = userSelect ? userSelect.value : "all";

    if (typeof renderReportCalendar === "function") {
      await renderReportCalendar(y, m, selectedUserId);
      console.log("✨ 行クリックからのカレンダー既読即時反映に成功しました");
    }
  }

  // ⑥ 最後に選択ハイライトを適用
  if (typeof highlightSelectedReportItem === "function") {
    highlightSelectedReportItem(reportId);
  }

  // -------------------------------------------------------------------------
  // 🌟 スマホ（991px以下）の場合のみ、画面上部の詳細表示エリアへ自動スムーズスクロール
  // -------------------------------------------------------------------------
  const isMobile = window.innerWidth <= 991;
  if (isMobile) {
    const detailCard = document.querySelector(".report-detail-card") ||
      document.getElementById("report_detail_view") ||
      document.getElementById("report_detail_container");

    if (detailCard) {
      detailCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  }
}

/**
 * カレンダーの日付タップ時の判定処理
 */
function handleCalendarDayClick(dateStr) {
  if (!window.currentReportMap || !window.currentReportMap[dateStr]) return;

  const dayReports = window.currentReportMap[dateStr];
  if (dayReports.length === 0) return;

  if (dayReports.length === 1) {
    // 1件のみの場合はダイアログを出さずに即座に詳細表示処理を実行
    selectReportAndCloseModal(dayReports[0].id);
  } else {
    // 2件以上の場合は選択ダイアログを開く
    openReportSelectModal(dateStr, dayReports);
  }
}

/* ==========================================================================
   📅 年月（YYYY-MM）抽出の超厳密な共通関数
   ========================================================================== */
function extractYearMonth(dateStr) {
  if (!dateStr) return "";
  let cleanStr = String(dateStr).split("T")[0].trim();
  cleanStr = cleanStr.replace(/\//g, "-");

  const parts = cleanStr.split("-");
  if (parts.length >= 2) {
    const year = parts[0];
    const month = String(parts[1]).padStart(2, "0");
    return `${year}-${month}`;
  }
  return "";
}

/**
 * 🔒 プルダウン非活性化処理
 */
function lockDropdown(selectEl, message) {
  selectEl.innerHTML = `<option value="all" selected>${message}</option>`;
  selectEl.value = "all";
  selectEl.disabled = true;
  selectEl.setAttribute("disabled", "disabled");
  selectEl.style.setProperty("background-color", "#e9ecef", "important");
  selectEl.style.setProperty("cursor", "not-allowed", "important");
  selectEl.style.setProperty("pointer-events", "none", "important");
  selectEl.style.setProperty("opacity", "0.6", "important");
}

/**
 * 🔓 プルダウンロック解除処理
 */
function unlockDropdown(selectEl) {
  selectEl.disabled = false;
  selectEl.removeAttribute("disabled");
  selectEl.style.removeProperty("background-color");
  selectEl.style.removeProperty("cursor");
  selectEl.style.removeProperty("pointer-events");
  selectEl.style.removeProperty("opacity");
}

/**
 * 📋 選択された年月（YYYY-MM）にレポートが存在するユーザーのみをプルダウンにセットする
 */
async function updateTargetUserDropdownByMonth(targetYearMonth) {
  const userSelect = document.getElementById("target_user_id");
  if (!userSelect || !targetYearMonth) return;

  try {
    const supabaseClient = window.supabase || supabase;

    let currentUserId = null;
    try {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (user) currentUserId = user.id;
    } catch (authErr) {
      console.warn("ユーザー情報取得失敗:", authErr);
    }

    const [year, month] = targetYearMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // 1. 自分が共有されている report_id のリストを取得
    const { data: shareData } = await supabaseClient
      .from("report_shares")
      .select("report_id")
      .eq("user_id", currentUserId);

    const sharedReportIds = (shareData || []).map((s) => s.report_id);

    // 2. 「自分が作成者」または「自分が共有先に含まれる」レポートのみを取得
    let query = supabaseClient
      .from("report_logs")
      .select("user_id, report_date, work_period_start, created_at")
      .gte("report_date", startDate)
      .lte("report_date", endDate);

    if (sharedReportIds.length > 0) {
      query = query.or(`user_id.eq.${currentUserId},id.in.(${sharedReportIds.join(",")})`);
    } else {
      query = query.eq("user_id", currentUserId);
    }

    const { data: reports, error: reportErr } = await query;

    if (reportErr) {
      lockDropdown(userSelect, "（データ取得エラー）");
      return;
    }

    // 💡 厳密なYYYY-MMの二重判定
    const matchedReports = (reports || []).filter((r) => {
      const rYM = extractYearMonth(r.report_date || r.work_period_start || r.created_at);
      return rYM === targetYearMonth;
    });

    let activeUserIds = [...new Set(matchedReports.map((r) => r.user_id).filter(Boolean))];

    // 🎯 データが0件の場合は「全てのレポート」を表示しつつ非活性（ロック）にする
    if (activeUserIds.length === 0) {
      lockDropdown(userSelect, "全てのレポート");
      return;
    }

    unlockDropdown(userSelect);

    if (currentUserId) {
      activeUserIds = activeUserIds.filter((id) => String(id) !== String(currentUserId));
    }

    let otherUsers = [];
    if (activeUserIds.length > 0) {
      const { data: users } = await supabaseClient
        .from("user_master")
        .select("id, last_name, first_name")
        .in("id", activeUserIds)
        .order("last_name", { ascending: true });
      if (users) otherUsers = users;
    }

    const previousValue = userSelect.value;

    userSelect.innerHTML = `
      <option value="all">全てのレポート</option>
      <option value="mine">自分のレポート</option>
    `;

    otherUsers.forEach((u) => {
      const fullName = `${u.last_name || ""} ${u.first_name || ""}`.trim() || "名称未設定";
      const option = document.createElement("option");
      option.value = u.id;
      option.textContent = fullName;
      userSelect.appendChild(option);
    });

    if ([...userSelect.options].some((opt) => opt.value === previousValue)) {
      userSelect.value = previousValue;
    } else {
      userSelect.value = "all";
    }
  } catch (err) {
    console.error("❌ updateTargetUserDropdownByMonth エラー:", err);
    lockDropdown(userSelect, "（エラーが発生しました）");
  }
}

/* ==========================================================================
   🔄 フィルター変更一括ハンドラー（既読即時反映版）
   ========================================================================== */
async function handleReportFilterChange(event) {
  const userSelect = document.getElementById("target_user_id");
  const monthInput = document.getElementById("display_period");

  if (!monthInput) return;

  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const selectedPeriod = monthInput.value;
  const [y, m] = selectedPeriod.split("-").map(Number);

  if (event && event.target === monthInput && userSelect) {
    userSelect.value = "all";
  }

  // 1. プルダウンの活性/非活性・選択肢をその月用に更新
  await updateTargetUserDropdownByMonth(selectedPeriod);

  // 2. 現在選択されているユーザーID
  const selectedUserId = userSelect && !userSelect.disabled ? userSelect.value : "all";

  // ★ STEP 3: 先に中央の詳細表示エリアを実行！（ここで自動的にDBへ「既読」が保存されます）
  if (typeof fetchAndDisplayLatestReport === "function") {
    await fetchAndDisplayLatestReport(y, m, selectedUserId);
  }

  // ★ STEP 4: 既読保存が完了した最新のDB状態を基に、過去レポート一覧（左側）を更新
  if (typeof fetchAndDisplayPastReportList === "function") {
    await fetchAndDisplayPastReportList(selectedUserId, selectedPeriod);
  }

  // ★ STEP 5: 既読保存が完了した最新のDB状態を基に、ミニカレンダーを更新（これで青丸が消えます！）
  if (typeof renderReportCalendar === "function") {
    await renderReportCalendar(y, m, selectedUserId);
  }
}

/* ==========================================================================
   🚀 イベントのセットアップ
   ========================================================================== */
function setupReportFilterListeners() {
  const userSelect = document.getElementById("target_user_id");
  const monthInput = document.getElementById("display_period");

  if (userSelect) {
    userSelect.onchange = handleReportFilterChange;
  }
  if (monthInput) {
    monthInput.onchange = handleReportFilterChange;
  }

  handleReportFilterChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupReportFilterListeners);
} else {
  setupReportFilterListeners();
}

/**
 * 🎨 過去レポート一覧の「選択中」ハイライト＆自動スクロール処理
 */
function highlightSelectedReportItem(selectedReportId) {
  const allItems = document.querySelectorAll("#past_report_list .past-report-item, .past-report-item");

  allItems.forEach((item) => {
    const itemId = item.getAttribute("data-id") || item.getAttribute("data-report-id") || item.id;

    if (String(itemId) === String(selectedReportId)) {
      // 1. フォーカス用のクラスを追加
      item.classList.add("active-report", "bg-secondary-subtle");

      // 2. ✨ PC表示（991px超）の場合のみ自動スクロールを実行！
      const isMobile = window.innerWidth <= 991;
      if (!isMobile) {
        item.scrollIntoView({
          behavior: "smooth", // なめらかにスクロール
          block: "nearest", // 一番近い位置（リスト内）で止める
        });
      }
    } else {
      // フォーカスを外す
      item.classList.remove("active-report", "bg-secondary-subtle");
    }
  });
}
