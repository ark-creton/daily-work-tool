// 🌟 レポート画面全体で現在表示中のデータを保持するグローバル変数を定義
let currentDisplayReportData = null;

/**
 * レポート画面 初期化メイン関数
 */
async function initializeReportPage() {
  console.log("【report.js】レポート画面の初期化を開始します...");

  // 🌟 loginUser が未定義の場合の安全策
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
    // リロード時の年月セットとカレンダー連動
    // ==========================================================================
    const monthInput = document.getElementById("display_period");
    const userSelect = document.getElementById("target_user_id");

    // リロード時に現在の「年-月」を強制セットする
    const now = new Date();
    const currentPeriodVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (monthInput && !monthInput.value) {
      monthInput.value = currentPeriodVal;
    }

    // プルダウンの「mine」にログインユーザーのフルネームを注入
    if (userSelect) {
      const mineOption = userSelect.querySelector('option[value="mine"]');
      if (mineOption) {
        mineOption.innerText = loginUser.last_name ? `${loginUser.last_name} ${loginUser.first_name || ""}`.trim() : "自分";
      }
    }

    // 選択変更時にカレンダーと過去の一覧をまとめて更新する関数
    const updateAllCalculations = async () => {
      if (monthInput && monthInput.value) {
        const [y, m] = monthInput.value.split("-").map(Number);
        await renderReportCalendar(y, m);
        if (typeof fetchAndDisplayPastReportList === "function") {
          await fetchAndDisplayPastReportList();
        }
      }
    };

    // 変更イベントの登録
    if (monthInput) monthInput.addEventListener("change", updateAllCalculations);
    if (userSelect) userSelect.addEventListener("change", updateAllCalculations);

    // ==========================================================================
    // 🌟 処理順序の最終最適化
    // ==========================================================================
    // 1. 【最優先】まず、自分の最新レポート1件を引っ張ってきて画面中央のベースを作る！
    await fetchAndDisplayLatestReport();

    // 2. 次にミニカレンダーの初期描画を実行
    if (monthInput && monthInput.value) {
      const [initialY, initialM] = monthInput.value.split("-").map(Number);
      await renderReportCalendar(initialY, initialM);
    } else {
      await renderReportCalendar(now.getFullYear(), now.getMonth() + 1);
    }

    // 3. 最後にサイドバーの過去一覧をロード
    await fetchAndDisplayPastReportList();
  } catch (error) {
    console.error("【report.js】初期化中にエラーが発生しました:", error);
  }
}

/**
 * 画面初期化時に最新レポートの表示を制御する関数
 */
async function fetchAndDisplayLatestReport() {
  if (!loginUser || !loginUser.id) return;

  const emptyDiv = document.getElementById("report_detail_empty");
  const viewDiv = document.getElementById("report_detail_view");
  const editBtn = document.getElementById("report_edit_button");

  try {
    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    // 1. 自分が作成した最新の有効なレポートを1件取得
    const { data: myLatest, error: myError } = await supabaseClient
      .from("report_logs")
      .select("id")
      .eq("user_id", loginUser.id)
      .eq("is_active", true)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (myError) throw myError;

    // 2. 自分が提出したレポートが1件でもある場合 ➔ それを表示して終了
    if (myLatest && myLatest.length > 0) {
      await fetchAndDisplaySingleReport(myLatest[0].id);
      return;
    }

    // 自分が未提出（空状態）なので、編集ボタンを確実に非表示にする
    if (editBtn) {
      editBtn.classList.add("d-none");
    }

    // 3. 自分が未提出の場合、他人のレポート（共有されたもの）が一覧に存在するかチェック
    const now = new Date();
    const targetYear = now.getFullYear();
    const targetMonth = now.getMonth() + 1;
    const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${lastDay}`;

    const { data: sharedReports, error: shareError } = await supabaseClient
      .from("report_logs")
      .select(
        `
        id, is_active,
        report_shares!inner ( user_id )
      `,
      )
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .eq("is_active", true)
      .eq("report_shares.user_id", loginUser.id)
      .limit(1);

    // 中央を空状態（emptyDiv）にする
    if (emptyDiv && viewDiv) {
      viewDiv.classList.add("d-none");
      emptyDiv.classList.remove("d-none");

      const titleEl = emptyDiv.querySelector(".text-value");
      const descEl = emptyDiv.querySelector(".small");

      if (titleEl && descEl) {
        if (sharedReports && sharedReports.length > 0) {
          titleEl.innerText = "確認可能なレポートがあります";
          descEl.innerHTML = `右側の過去の提出一覧、またはカレンダーからレポートを選択して確認してください。<br><span class="text-secondary" style="font-size: 0.75rem;">※詳細を表示すると作成者に既読が伝わります。</span>`;
        } else {
          titleEl.innerText = "提出されたレポートがありません";
          descEl.innerText = "右側の「新規作成」ボタンから、日報・週報を作成して提出してください。";
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
 * 過去のレポート一覧を取得してサイドバーに描画する関数
 */
async function fetchAndDisplayPastReportList() {
  const listContainer = document.getElementById("past_report_list");
  const userSelect = document.getElementById("target_user_id");
  if (!listContainer) return;

  try {
    // 🌟【修正1】report_shares から is_read も確実に取得する！
    const { data: allReports, error } = await supabase
      .from("report_logs")
      .select(
        `
        id, report_type, report_date, is_active, status, created_at, user_id,
        user_master ( id, last_name, first_name ),
        report_shares ( user_id, is_read )
      `,
      )
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (!allReports || allReports.length === 0) {
      listContainer.innerHTML = `<div class="text-muted text-center small py-4">提出済みのレポートはありません。</div>`;
      if (userSelect) userSelect.classList.add("d-none");
      return;
    }

    // 2. 閲覧権限のフィルタリング
    const accessibleReports = allReports.filter((report) => {
      // 🌟【修正2】型違いによる誤判定を防ぐため、等価演算子（==）に変更
      if (report.user_id == loginUser.id) return true;
      if (report.is_active === false) return false;
      if (report.report_shares) {
        const shares = Array.isArray(report.report_shares) ? report.report_shares : [report.report_shares];
        return shares.some((share) => share && share.user_id == loginUser.id);
      }
      return false;
    });

    if (accessibleReports.length === 0) {
      listContainer.innerHTML = `<div class="text-muted text-center small py-4">閲覧可能なレポートはありません。</div>`;
      if (userSelect) userSelect.classList.add("d-none");
      return;
    }

    // ==========================================================================
    // 3. プルダウン（他者の名前リスト）の生成（★選択キープ版）
    // ==========================================================================
    const otherReporters = [];
    const seenUserIds = new Set();

    accessibleReports.forEach((r) => {
      if (r.user_id != loginUser.id) {
        if (!seenUserIds.has(r.user_id)) {
          seenUserIds.add(r.user_id);

          let fullName = "ユーザー";
          if (r.user_master) {
            const masterArray = Array.isArray(r.user_master) ? r.user_master : [r.user_master];
            const targetMaster = masterArray.find((m) => m && m.id == r.user_id);

            if (targetMaster) {
              fullName = `${targetMaster.last_name || ""} ${targetMaster.first_name || ""}`.trim();
            }
          }
          otherReporters.push({ id: r.user_id, name: fullName });
        }
      }
    });

    if (userSelect) {
      // 🌟【重要】クリアする前に、今ユーザーが選択している値を一時保存しておく！
      const savedSelectedValue = userSelect.value;

      if (otherReporters.length === 0) {
        userSelect.classList.add("d-none");
        userSelect.value = "all";
      } else {
        userSelect.classList.remove("d-none");

        // 固定値（all と mine）以外を一旦キレイに削除（ここで選択がリセットされる）
        const staticOptions = ["all", "mine"];
        Array.from(userSelect.options).forEach((opt) => {
          if (!staticOptions.includes(opt.value)) userSelect.removeChild(opt);
        });

        // 共有してくれた人の「個人名」を再生成
        otherReporters.forEach((reporter) => {
          const opt = document.createElement("option");
          opt.value = reporter.id;
          opt.innerText = reporter.name;
          userSelect.appendChild(opt);
        });

        // 🌟【重要】プルダウンの再生成が終わったら、保存しておいた選択値を復元する！
        if (savedSelectedValue) {
          userSelect.value = savedSelectedValue;
        }
      }
    }

    // ==========================================================================
    // 4. 表示対象のフィルタ
    // ==========================================================================
    // 復元された後の値を正しく取得するので、filterValue が選んだ個人IDになります！
    const filterValue = userSelect ? userSelect.value : "all";
    const filteredReports = accessibleReports.filter((r) => {
      if (filterValue === "all") return true;
      if (filterValue === "mine") return r.user_id == loginUser.id;

      return r.user_id == filterValue;
    });

    const displayReports = filteredReports.slice(0, 20);

    // 5. HTMLコンテンツの組み立て
    let htmlContent = "";
    displayReports.forEach((report) => {
      // 🌟【修正2】ここも型違い対策で == に変更
      const isMyReport = report.user_id == loginUser.id;

      // 既読・未読の判定
      let isRead = false;
      if (isMyReport) {
        isRead = true; // 自分のレポートは常に既読扱い
      } else {
        const sharesArray = Array.isArray(report.report_shares) ? report.report_shares : report.report_shares ? [report.report_shares] : [];
        const myShare = sharesArray.find((s) => s && s.user_id == loginUser.id);
        isRead = myShare ? myShare.is_read : false; // 🌟【修正1のおかげで】ここで正しくis_readが評価されます！
      }

      // 表示用の名前を組み立て
      let reporterName = "";
      if (isMyReport) {
        reporterName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim() || "自分";
      } else if (report.user_master) {
        const masterArray = Array.isArray(report.user_master) ? report.user_master : [report.user_master];
        const targetMaster = masterArray.find((m) => m && m.id == report.user_id);
        if (targetMaster) {
          reporterName = `${targetMaster.last_name || ""} ${targetMaster.first_name || ""}`.trim();
        }
      }
      if (!reporterName) reporterName = "ユーザー";

      // 日付のフォーマット (YYYY/MM/DD)
      const formattedDate = report.report_date ? report.report_date.replace(/-/g, "/") : "ー/ー/ー";

      // システム全体のトーンに調和させるための変数
      let leftBorderHtml = "";
      let iconHtml = "";
      let textClass = "";
      let badgeHtml = "";

      if (isMyReport) {
        if (report.status === "draft" || report.is_active === false) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #eab308; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<i class="bi bi-pencil" style="color: #ca8a04; font-size: 0.85rem;"></i>`;
          textClass = "fw-medium";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #fef9c3; color: #713f12; padding: 0.1rem 0.4rem; border-radius: 4px;">下書き</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #475569; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<i class="bi bi-clipboard-check" style="color: #475569; font-size: 0.85rem;"></i>`;
          textClass = "text-dark fw-medium";
          badgeHtml = "";
        }
      } else {
        if (!isRead) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #6366f1; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<i class="bi bi-circle-fill" style="color: #6366f1; font-size: 0.5rem; margin-left: 2px; margin-right: 6px;"></i>`;
          textClass = "text-dark fw-bold";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #e0e7ff; color: #4338ca; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;">NEW</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #c7d2fe; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<i class="bi bi-file-earmark" style="color: #c7d2fe; font-size: 0.85rem;"></i>`;
          textClass = "text-body fw-normal";
          badgeHtml = "";
        }
      }

      // 全体のレイアウト組み立て
      htmlContent += `
        <a href="javascript:void(0);" class="list-group-item list-group-item-action d-flex align-items-center justify-content-between past-report-item" 
           data-id="${report.id}"
           style="padding: 0.65rem 0.5rem; border: none; border-bottom: 1px solid #f1f5f9; background: transparent; transition: all 0.2s;">
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

    // 6. クリックイベントのバインド
    document.querySelectorAll(".past-report-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.preventDefault();
        const currentItem = e.currentTarget;
        const reportId = currentItem.getAttribute("data-id");

        document.querySelectorAll(".past-report-item").forEach((el) => {
          el.classList.remove("bg-secondary-subtle", "fw-bold");
        });
        currentItem.classList.add("bg-secondary-subtle", "fw-bold");

        await fetchAndDisplaySingleReport(reportId);

        const indicator = currentItem.querySelector('div[style*="background-color: #6366f1"]');
        if (indicator) {
          indicator.style.backgroundColor = "#c7d2fe";
          const icon = currentItem.querySelector(".bi-circle-fill");
          if (icon) {
            icon.className = "bi bi-file-earmark ms-1";
            icon.style.color = "#c7d2fe";
            icon.style.fontSize = "0.85rem";
          }
          const textSpan = currentItem.querySelector(".text-dark.fw-bold");
          if (textSpan) {
            textSpan.className = "text-body fw-normal text-truncate ms-1";
          }
          const newBadge = currentItem.querySelector('span[style*="background-color: #e0e7ff"]');
          if (newBadge) {
            newBadge.remove();
          }
        }

        // 🌟【ここを追加！】詳細を開いて既読になった瞬間、カレンダーも即座に再描画して同期

        if (typeof renderReportCalendar === "function") {
          const monthInput = document.getElementById("display_period");
          if (monthInput && monthInput.value) {
            const [y, m] = monthInput.value.split("-").map(Number);
            await renderReportCalendar(y, m);
          }
        }
      });
    });
    // ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝
    // 🌟【修正】初期読み込み時のアクティブ表示制御（厳格版）
    // ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝
    // グローバルに保持されている現在のレポートIDを確認
    const activeId =
      typeof currentReportId !== "undefined" && currentReportId
        ? currentReportId
        : typeof currentDisplayReportData !== "undefined"
          ? currentDisplayReportData?.id
          : null;

    // 誤判定を防ぐため、activeId が確実に取得できている場合のみターゲットを光らせる
    if (activeId) {
      const activeItem = listContainer.querySelector(`.past-report-item[data-id="${activeId}"]`);
      if (activeItem) {
        activeItem.classList.add("bg-secondary-subtle", "fw-bold");
        console.log("【初期ハイライト】現在のレポートをアクティブにしました。ID:", activeId);
      }
    }
    // ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝ ＝
  } catch (err) {
    console.error(err);
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
        user_master ( id, last_name, first_name ),
        report_shares (
          user_id,
          is_read,
          read_at,
          user_master ( id, company_id, last_name, first_name )
        )
      `,
      )
      .eq("id", reportId)
      .single();

    if (error) throw error;
    if (!report) {
      console.warn("指定されたレポートが見つかりません。");
      return;
    }

    // 🌟【確実版：Supabaseの既読更新ロジック】
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

          // 💡 重要：DBを更新したので、画面上のreportオブジェクト内の自分のステータスも既読に書き換える
          myShare.is_read = true;
          myShare.read_at = new Date().toISOString();
        }
      }
    }

    // 最後に画面へのマッピングを実行（これで最新の状態がアバタースタック等に反映されます）
    mapReportToDisplay(report);
  } catch (err) {
    console.error("レポートの単体取得・表示中にエラーが発生しました:", err);
  }
}

/**
 * 取得したデータを画面のHTML要素にマッピングする関数
 */
function mapReportToDisplay(report) {
  currentDisplayReportData = report;

  // ==========================================================================
  // 🌟 編集ボタンの表示・非表示、および見た目（色の薄さ）の完全リセット制御
  // ==========================================================================
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

      // 🌟 元のお気に入りデザイン（btn-outline-secondary）のままにする
      editBtn.classList.add("btn-outline-secondary");
      editBtn.classList.remove("btn-secondary"); // 塗り潰しを解除

      // 🌟 インラインスタイルで、ブラウザの「薄引きずりバグ」を力技でねじ伏せる（!important付き）
      editBtn.style.setProperty("opacity", "1", "important");
      editBtn.style.pointerEvents = "auto";
    } else {
      // 他人のレポート、またはレポートがない場合は完全に非表示
      editBtn.classList.add("d-none");
    }
  }

  // 1. 期間データの整形（開始〜終了）
  let periodText = report.work_period_start || "ー";
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
        if (document.getElementById("view_work_mon")) document.getElementById("view_work_mon").innerText = weeklyData.mon || "ー";
        if (document.getElementById("view_work_tue")) document.getElementById("view_work_tue").innerText = weeklyData.tue || "ー";
        if (document.getElementById("view_work_wed")) document.getElementById("view_work_wed").innerText = weeklyData.wed || "ー";
        if (document.getElementById("view_work_thu")) document.getElementById("view_work_thu").innerText = weeklyData.thu || "ー";
        if (document.getElementById("view_work_fri")) document.getElementById("view_work_fri").innerText = weeklyData.fri || "ー";
        if (document.getElementById("view_work_sat")) document.getElementById("view_work_sat").innerText = weeklyData.sat || "ー";
        if (document.getElementById("view_work_sun")) document.getElementById("view_work_sun").innerText = weeklyData.sun || "ー";
      } catch (e) {
        console.warn("週報の作業内容パースに失敗しました。プレーンテキストとして処理します。", e);
        if (freeWorkDiv) {
          freeWorkDiv.innerText = report.work_content || "ー";
          freeWorkDiv.classList.remove("d-none");
        }
        if (weeklyWorkDiv) weeklyWorkDiv.classList.add("d-none");
      }
    }
  } else {
    if (freeWorkDiv) {
      freeWorkDiv.innerText = report.work_content || "ー";
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
        updatedAtSpan.innerText = "ー";
        if (updatedAtWrapper) updatedAtWrapper.classList.add("d-none");
      }
    } else {
      reportDateSpan.innerText = "ー";
      updatedAtSpan.innerText = "ー";
      if (updatedAtWrapper) updatedAtWrapper.classList.add("d-none");
    }
  }

  // ==========================================================================
  // 🌟 フルネームの動的組み立て（不要なテスト用固定値ブロックを除去）
  // ==========================================================================
  let currentReporterName = "ユーザー";

  if (report) {
    if (report.user_id === loginUser.id) {
      currentReporterName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim() || "自分";
    } else if (report.user_master) {
      const masterArray = Array.isArray(report.user_master) ? report.user_master : [report.user_master];
      const targetMaster = masterArray.find((m) => m && m.id === report.user_id);
      if (targetMaster) {
        currentReporterName = `${targetMaster.last_name || ""} ${targetMaster.first_name || ""}`.trim();
      }
    }
  }

  // ==========================================================================
  // 🌟 HTML要素のIDとDBカラム・変数の正しいマッピング
  // ==========================================================================
  const mapping = {
    view_reporter_name: currentReporterName,
    view_report_title: report.subject_title || "ー",
    view_report_type: report.report_type || "ー",
    view_work_location: report.work_location || "ー",
    view_work_period: periodText || "ー",
    view_customer_name: report.customer_name || "ー",
    view_companion_name: report.companion_name || "ー",
    view_instructor_name: report.instructor_name || "ー",
    view_content_impression: report.content_impression || "ー",
    view_content_remaining_work: report.content_remaining_work || "ー",
    view_content_near_goal: report.content_near_goal || "ー",
    view_content_issue: report.content_issue || "ー",
    view_content_action_plan: report.content_action_plan || "ー",
    view_next_schedule: report.next_schedule || "ー",
    view_content_notice: report.content_notice || "ー",
  };

  Object.keys(mapping).forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerText = mapping[id];
    }
  });

  // ==========================================================================
  // 🌟 大見出し（日報：山田 太郎 などのヘッダー）を個別に正確に書き換える処理
  // ==========================================================================
  const headerTypeEl = document.getElementById("view_report_type");
  const headerNameEl = document.getElementById("view_reporter_name");
  const rType = report.report_type || "日報";

  if (headerTypeEl) headerTypeEl.innerText = rType;
  if (headerNameEl) headerNameEl.innerText = currentReporterName;

  const alternativeHeaderEl = document.getElementById("view_report_title_header");
  if (alternativeHeaderEl) {
    alternativeHeaderEl.innerText = `${rType}：${currentReporterName}`;
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
    // 統一された論理フラグ（is_active: false が下書き・無効状態）の判定
    if (report.is_active === false) {
      detailBadgeSpan.innerHTML = `<span class="badge bg-warning text-white rounded fw-bold px-2 py-0.5" style="font-size: 0.75rem; letter-spacing: 0.05em;">下書き</span>`;
    } else {
      detailBadgeSpan.innerHTML = "";
    }
  }

  const sharedWithDiv = document.getElementById("view_shared_with");
  if (sharedWithDiv) {
    if (report.report_shares && report.report_shares.length > 0) {
      const sharedCompanyIds = new Set();
      report.report_shares.forEach((share) => {
        if (share.user_master && share.user_master.company_id) {
          sharedCompanyIds.add(share.user_master.company_id);
        }
      });

      const ARC_RETON_ID = "b91cf02c-7614-4baa-9ee0-de42c1311d81";
      const ARC_KUCHO_ID = "d4594757-127a-4a2c-abf7-95828e03698c";

      let badgeHtml = "";
      if (sharedCompanyIds.has(ARC_RETON_ID)) {
        badgeHtml += `<span class="badge border border-secondary-subtle text-secondary rounded fw-medium px-2 py-1" style="font-size: 0.75rem;">株式会社アークリトン（全体）</span>`;
      }
      if (sharedCompanyIds.has(ARC_KUCHO_ID)) {
        badgeHtml += `<span class="badge border border-secondary-subtle text-secondary rounded fw-medium px-2 py-1" style="font-size: 0.75rem;">株式会社アーク空調設備（全体）</span>`;
      }

      sharedWithDiv.innerHTML = badgeHtml || '<span class="text-muted">ー</span>';
    } else {
      sharedWithDiv.innerHTML = '<span class="text-muted">ー</span>';
    }
  }

  const readStatusWrapper = document.getElementById("read_status_wrapper");
  const btnReadStatus = document.getElementById("btn_read_status");

  if (readStatusWrapper && btnReadStatus) {
    // 1. 既存のBootstrapポップオーバーを完全に破棄
    const oldPopover = bootstrap.Popover.getInstance(btnReadStatus);
    if (oldPopover) oldPopover.dispose();

    // 自分のレポートのときだけ既読状況を表示する
    const isMyReport = report && loginUser && report.user_id === loginUser.id;

    if (report.is_active !== false && isMyReport && report.report_shares && report.report_shares.length > 0) {
      readStatusWrapper.classList.remove("d-none");

      // 共有メンバーから「自分」を完全に取り除いた新しい配列を作成
      const shares = report.report_shares.filter((s) => s && s.user_master && s.user_master.id !== loginUser.id);

      // 自分を除いた純粋な他人の人数でカウント
      const readCount = shares.filter((s) => s && s.is_read).length;
      const totalCount = shares.length;

      // 2. アバタースタックを内包する全体HTMLの組み立て
      // 🌟 右端に 8px の安全な余白（padding-right: 8px;）を作り、アイコンが線にめり込むのを防ぎます
      let stackHtml = `
        <div class="d-flex align-items-center gap-2" style="user-select: none; padding-right: 8px;">
          <!-- 👁️ 既読件数テキスト -->
          <span class="text-muted d-flex align-items-center me-1" style="font-size: 0.75rem; font-weight: 500;">
            <i class="bi bi-eye me-1" style="font-size: 0.85rem; color: #64748b;"></i>既読状況 (${readCount}/${totalCount})
          </span>
          <!-- アバターの重なり用コンテナ -->
          <div class="d-flex align-items-center" style="padding-left: 8px;">
      `;

      // 3. メンバーごとに丸アイコン（アバター）を生成
      shares.forEach((share, index) => {
        const uMaster = share ? share.user_master : null;
        if (!uMaster) return;

        // 名前の最初の1文字をアイコン中央に表示
        const initialLetter = (uMaster.last_name || uMaster.first_name || "ユ").charAt(0);
        const fullName = `${uMaster.last_name || ""} ${uMaster.first_name || ""}`.trim() || "ユーザー";

        // 名前表示は使い慣れた元の仕様（title属性）に完全に戻しました
        if (share.is_read) {
          // ✅ 既読メンバー
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
          // ⏳ 未読メンバー
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

      // 4. 元のボタンのスタイルを完全にクリアしてリセット
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
  }
  // ==========================================================================
  // 🌟 他ファイルからの上書き汚染を防ぐ強制タイマー処理（フルネーム対応）
  // ==========================================================================
  setTimeout(() => {
    const targetTypeEl = document.getElementById("view_report_type");
    const targetNameEl = document.getElementById("view_reporter_name");
    const alternativeHeaderEl = document.getElementById("view_report_title_header");

    console.log(`【強制書き換え実行】種別: ${rType}, 作成者フルネーム: ${currentReporterName}`);

    if (targetTypeEl) targetTypeEl.innerText = rType;
    if (targetNameEl) targetNameEl.innerText = currentReporterName;
    if (alternativeHeaderEl) {
      alternativeHeaderEl.innerText = `${rType}：${currentReporterName}`;
    }
  }, 50);
}

/**
 * モーダル側から呼び出され、一覧と最新データを再読込する関数
 */
async function refreshReportList() {
  console.log("【report.js】データの更新を検知しました。画面をリフレッシュします...");

  await fetchAndDisplayLatestReport();
  await fetchAndDisplayPastReportList();

  if (typeof renderReportCalendar === "function") {
    const monthInput = document.getElementById("display_period");
    if (monthInput && monthInput.value) {
      const [y, m] = monthInput.value.split("-").map(Number);
      await renderReportCalendar(y, m);
    } else {
      const now = new Date();
      await renderReportCalendar(now.getFullYear(), now.getMonth() + 1);
    }
    console.log("【report.js】ミニカレンダーの 📝 マークを即座に更新しました。");
  }
}

/**
 * レポート用ミニカレンダーを描画する関数（プルダウン連動＆祝日同期対応版）
 */
async function renderReportCalendar(targetYear, targetMonth) {
  const container = document.getElementById("report_mini_calendar");
  if (!container) return;

  const startDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const endDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${lastDay}`;

  const filterUserVal = document.getElementById("target_user_id")?.value || "all";

  let holidays = {};
  const reportMap = {}; // 📝 各日付のレポート情報を多角的に持つように拡張します

  try {
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient) {
      // 🌟【修正】report_shares から is_read も追加で取得します
      let query = supabaseClient
        .from("report_logs")
        .select(
          `
          id, report_date, user_id, is_active, report_type,
          user_master ( id, last_name, first_name ),
          report_shares ( user_id, is_read )
        `,
        )
        .gte("report_date", startDate)
        .lte("report_date", endDate);

      if (filterUserVal === "mine") {
        query = query.eq("user_id", loginUser.id);
      } else if (filterUserVal !== "all") {
        query = query.eq("user_id", filterUserVal);
      }

      let [reportsResult, holidaysResult] = await Promise.all([
        query,
        supabaseClient.from("holiday_master").select("holiday_date, name").gte("holiday_date", startDate).lte("holiday_date", endDate),
      ]);

      if (reportsResult.data) {
        reportsResult.data.forEach((r) => {
          const isMyReport = r.user_id == loginUser.id;

          // 既読・未読の判定
          let isRead = false;
          if (isMyReport) {
            isRead = true;
          } else {
            const shares = Array.isArray(r.report_shares) ? r.report_shares : r.report_shares ? [r.report_shares] : [];
            const myShare = shares.find((s) => s && s.user_id == loginUser.id);
            isRead = myShare ? myShare.is_read : false;
          }

          if (filterUserVal === "all") {
            if (!isMyReport) {
              if (r.is_active === false) return;
              const isSharedToMe = r.report_shares && r.report_shares.some((s) => s.user_id === loginUser.id);
              if (!isSharedToMe) return;

              // 🌟【最重要提案】「全てのレポート」表示の時、他人のもので「既読」ならカレンダーに載せない（スルー）
              if (isRead) return;
            }
          }

          // 日付マップにIDと状態を記憶
          reportMap[r.report_date] = {
            id: r.id,
            isMine: isMyReport,
            isRead: isRead,
          };
        });
      }

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

    const repInfo = cell.dateStr ? reportMap[cell.dateStr] : null;
    const reportId = repInfo ? repInfo.id : null;
    const isToday = cell.dateStr === todayStr ? "today" : "";
    const hasReport = reportId ? "has-report" : "";

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
      if (reportId) cellTitle = cellTitle ? `${cellTitle} / レポートを表示` : "レポートを表示";
    }

    // アイコンの出し分け処理
    let iconHtml = "";
    if (repInfo) {
      if (repInfo.isMine) {
        // ① 自分のレポート
        iconHtml = `<span class="report-icon" style="font-size: 0.85rem;">📝</span>`;
      } else {
        // ② 他人のレポート
        if (!repInfo.isRead) {
          // 未読の場合
          iconHtml = `<span class="report-icon d-inline-block" style="width: 6px; height: 6px; background-color: #4f46e5; border-radius: 50%; vertical-align: middle; margin-left: 2px;"></span>`;
        } else {
          // 既読の場合
          iconHtml = `<span class="report-icon" style="font-size: 0.8rem; color: #64748b; opacity: 0.85; font-weight: normal;">📄</span>`;
        }
      }
    }

    html += `
      <td class="report-cal-day ${isToday} ${hasReport} ${dayTypeClass}" 
          onclick="${reportId ? `fetchAndDisplaySingleReport('${reportId}')` : ""}"
          title="${cellTitle}">
        <span class="day-num">${cell.day}</span>
        ${iconHtml}
      </td>
    `;
  });

  html += `</tr></tbody></table>`;
  container.innerHTML = html;
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
