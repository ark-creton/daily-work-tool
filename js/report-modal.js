/**
 * 業務レポート入力・編集モーダル制御スクリプト（本番運用リファクタリング版）
 */

// ログイン中のユーザー情報を保持するオブジェクト
let loginUser = {
  id: null,
  user_name: "未ログイン",
  last_name: "",
  first_name: "", // 💡 フルネーム対応のために追加
  company_id: null, // 所属会社ID
};

// 編集モード判定用の変数（nullの場合は新規作成）
let currentReportId = null;

/**
 * ログイン中のユーザー情報をSupabaseから取得し同期する関数
 */
async function fetchAndSetLoginUser() {
  try {
    // Supabase Auth からセッション情報を取得
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("ログインユーザーの取得に失敗したか、セッションがありません。");
      return;
    }

    const userUuid = user.id;

    // ユーザーマスタから有効なプロファイル情報を取得
    // 💡 first_name を取得対象に追加
    const { data: profile, error: dbError } = await supabase
      .from("user_master")
      .select("id, user_name, last_name, first_name, company_id")
      .eq("id", userUuid)
      .eq("is_active", true)
      .single();

    if (dbError) throw dbError;

    if (profile) {
      loginUser.id = profile.id;
      loginUser.user_name = profile.user_name;
      loginUser.last_name = profile.last_name;
      loginUser.first_name = profile.first_name || ""; // 💡 追加
      loginUser.company_id = profile.company_id;

      // キャッシュ用ローカルストレージへの同期
      localStorage.setItem("cached_user_name", profile.user_name);
      localStorage.setItem("cached_user_company_id", profile.company_id);

      // 💡 ログ表示もフルネームに拡張
      const fullName = `${loginUser.last_name} ${loginUser.first_name}`.trim();
      console.log(`ログインユーザー情報を同期しました: ${fullName}さん (会社ID: ${loginUser.company_id})`);
    }
  } catch (error) {
    console.error("ログインユーザー情報の取得中にエラーが発生しました:", error.message);
  }
}

/**
 * モーダルヘッダー内のタイトル表記を動的に更新する関数
 * @param {string} type - 報告種別
 * @param {string} [reporterFullName] - 作成者のフルネーム（編集モード用）
 */
function updateModalDynamicTitle(type, reporterFullName = null) {
  const dynamicTitleSpan = document.getElementById("modal_report_dynamic_title");
  if (dynamicTitleSpan) {
    // 💡 苗字のみから「フルネーム」を使うロジックに変更
    let displayName = "";
    if (reporterFullName) {
      displayName = reporterFullName;
    } else {
      displayName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim();
    }

    dynamicTitleSpan.innerText = `${type}：${displayName || "ユーザー"}`;
  }

  const mainTitleText = document.getElementById("report_modal_title_text");
  if (mainTitleText) {
    mainTitleText.innerText = currentReportId ? "レポート編集" : "レポート登録";
  }
}

/**
 * 報告種別に基づいてUIを切り替える（引数を引き継げるように拡張）
 * @param {string} [reporterFullName] - 作成者のフルネーム
 */
function syncReportTypeUI(reporterFullName = null) {
  const reportTypeSelect = document.getElementById("report_type");
  if (!reportTypeSelect) return;

  const type = reportTypeSelect.value;

  // 💡 タイトル更新に関数を引き渡す（フルネームを転送）
  updateModalDynamicTitle(type, reporterFullName);

  // 2. ラベルおよび入力項目の動的切り替え
  const labelCustomer = document.getElementById("label_customer_name");
  const labelInstructor = document.getElementById("label_instructor_name");
  const fieldCompanion = document.getElementById("field_companion_name");

  if (type === "月報") {
    if (labelCustomer) labelCustomer.innerText = "契約先";
    if (fieldCompanion) fieldCompanion.classList.add("d-none");
  } else {
    if (labelCustomer) labelCustomer.innerText = "お客様名";
    if (fieldCompanion) fieldCompanion.classList.remove("d-none");
  }

  if (type === "日報") {
    if (labelInstructor) labelInstructor.innerText = "講師";
  } else {
    if (labelInstructor) labelInstructor.innerText = "指示者";
  }

  // アーク空調かつ日報の場合のみ、残作業エリアに注意喚起のプレースホルダーを表示
  const remainingWorkTextarea = document.getElementById("content_remaining_work");
  if (remainingWorkTextarea) {
    if (loginUser.company_id === "d4594757-127a-4a2c-abf7-95828e03698c" && type === "日報") {
      remainingWorkTextarea.placeholder = "※残作業（見積等）・継続作業はTODOにも入力すること";
    } else {
      remainingWorkTextarea.placeholder = "";
    }
  }

  // 3. 作業内容記述エリアの切り替え（週報用 vs 通常用）
  const workContentFreeWrapper = document.getElementById("work_content_free_wrapper");
  const workContentWeeklyWrapper = document.getElementById("work_content_weekly_wrapper");

  if (workContentFreeWrapper && workContentWeeklyWrapper) {
    if (type === "週報") {
      // 週報のときは「曜日別（テーブル形式）」を出し、フリー入力を隠す
      workContentFreeWrapper.classList.add("d-none");
      workContentWeeklyWrapper.classList.remove("d-none");
    } else {
      // 日報・月報のときは「フリー入力」を出し、曜日別を隠す
      workContentFreeWrapper.classList.remove("d-none");
      workContentWeeklyWrapper.classList.add("d-none");
    }
  }

  // 4. 作業期間入力エリアの切り替え
  const periodRangeWrapper = document.getElementById("period_range_wrapper");
  const periodSingleWrapper = document.getElementById("period_single_wrapper");
  if (periodRangeWrapper && periodSingleWrapper) {
    if (type === "日報") {
      periodRangeWrapper.classList.add("d-none");
      periodSingleWrapper.classList.remove("d-none");
    } else {
      periodRangeWrapper.classList.remove("d-none");
      periodSingleWrapper.classList.add("d-none");
    }
  }
}

/**
 * 共有先のチェックボックスリストを生成し、ログインユーザーの所属や既存データに応じて初期チェックを入れる
 * @param {Array<string>} [savedCompanyIds=[]] - 編集モード時に既に保存されている会社IDの配列
 */
function setupSharedWithList(savedCompanyIds = []) {
  const containerEl = document.getElementById("shared_with_container");
  if (!containerEl) return;

  // 1. 各会社のUUIDを定義
  const ARC_RETON_ID = "b91cf02c-7614-4baa-9ee0-de42c1311d81"; // アークリトンID
  const ARC_KUCHO_ID = "d4594757-127a-4a2c-abf7-95828e03698c"; // アーク空調ID

  const companies = [
    { id: ARC_RETON_ID, name: "株式会社アークリトン（全体）" },
    { id: ARC_KUCHO_ID, name: "株式会社アーク空調設備（全体）" },
  ];

  // 2. HTMLを生成してコンテナに注入
  containerEl.innerHTML = companies
    .map((company) => {
      let isChecked = "";

      if (currentReportId) {
        // 編集モード：既に保存されている会社IDに含まれていればチェックを入れる
        isChecked = savedCompanyIds.includes(company.id) ? "checked" : "";
      } else {
        // 新規登録モード：ログインユーザーの所属会社IDと一致していればチェックを入れる
        isChecked = loginUser.company_id === company.id ? "checked" : "";
      }

      return `
      <div class="form-check mb-2">
        <input class="form-check-input shared-company-checkbox" type="checkbox" value="${company.id}" id="chk_company_${company.id}" ${isChecked}>
        <label class="form-check-label small fw-semibold text-dark" for="chk_company_${company.id}">
          ${company.name}
        </label>
      </div>
    `;
    })
    .join("");
}

/**
 * 選択された（チェックがついた）会社の全ユーザーに対して閲覧権限（report_shares）を一括登録する
 * @param {string} reportId - 生成された report_logs の UUID
 */
async function saveReportShares(reportId) {
  const checkedBoxes = document.querySelectorAll(".shared-company-checkbox:checked");
  const selectedCompanyIds = Array.from(checkedBoxes).map((cb) => cb.value);

  if (selectedCompanyIds.length === 0) return;

  try {
    const { data: users, error: userError } = await supabase
      .from("user_master")
      .select("id")
      .in("company_id", selectedCompanyIds)
      .eq("is_active", true);

    if (userError) throw userError;
    if (!users || users.length === 0) return;

    const sharesData = users.map((user) => ({
      report_id: reportId,
      user_id: user.id,
      is_read: false,
    }));

    const { error: shareError } = await supabase.from("report_shares").upsert(sharesData, { onConflict: "report_id,user_id" });

    if (shareError) throw shareError;
    console.log(`【共有先登録】${sharesData.length}件の閲覧権限を正常に登録しました。`);
  } catch (err) {
    console.error("【共有先登録】エラー:", err.message);
    if (typeof window.showToast === "function") {
      window.showToast(`共有先の登録に失敗しました: ${err.message}`, "error");
    }
  }
}

/**
 * モーダルHTML合流後に一度だけ実行され、DOMイベントをバインドする初期化ロジック
 */
function initializeReportModalLogic() {
  console.log("モーダル制御ロジックのバインドを実行します...");

  setupSharedWithList();

  const reportTypeSelect = document.getElementById("report_type");
  const modalElement = document.getElementById("modal_report_entry");

  if (reportTypeSelect) {
    reportTypeSelect.onchange = () => {
      if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
        // 💡 フルネームを組み立てて渡すように修正
        const master = currentDisplayReportData.user_master;
        const fn = master ? `${master.last_name || ""} ${master.first_name || ""}`.trim() : null;
        syncReportTypeUI(fn);
      } else {
        syncReportTypeUI();
      }
    };
  }

  if (modalElement) {
    modalElement.addEventListener("shown.bs.modal", () => {
      if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
        // 💡 ここも同様にフルネームを組み立てて渡す
        const master = currentDisplayReportData.user_master;
        const fn = master ? `${master.last_name || ""} ${master.first_name || ""}`.trim() : null;
        syncReportTypeUI(fn);
      } else {
        syncReportTypeUI();
      }
    });
  }

  const submitBtn = document.getElementById("submit_button");
  const draftBtn = document.getElementById("draft_button");
  if (submitBtn) submitBtn.addEventListener("click", () => saveReport("published"));
  if (draftBtn) draftBtn.addEventListener("click", () => saveReport("draft"));

  const modalDeleteBtn = document.getElementById("modal_delete_button");
  if (modalDeleteBtn) {
    modalDeleteBtn.replaceWith(modalDeleteBtn.cloneNode(true));
    const cleanDeleteBtn = document.getElementById("modal_delete_button");

    cleanDeleteBtn.addEventListener("click", () => {
      if (!currentReportId) {
        if (typeof window.showToast === "function") window.showToast("削除対象のレポートIDが見つかりません。", "error");
        return;
      }

      const reportType = reportTypeSelect ? reportTypeSelect.value : "レポート";
      const workPeriodStart = document.getElementById("work_period_start")?.value || "";
      const workPeriodSingle = document.getElementById("work_period_single")?.value || "";
      const targetDisplayDate = reportType === "日報" ? workPeriodSingle : workPeriodStart;

      const textSpan = document.getElementById("delete_modal_date_type");
      if (textSpan) {
        textSpan.innerText = `${targetDisplayDate} の「${reportType}」`;
      }

      const reportModal = getModalInstance();
      if (reportModal) {
        reportModal.hide();
      }

      const confirmModalEl = document.getElementById("reportDeleteConfirmModal");
      const confirmModal = new bootstrap.Modal(confirmModalEl);
      confirmModal.show();

      const cancelConfirmBtn = document.getElementById("btn_report_confirm_cancel");
      cancelConfirmBtn.onclick = () => {
        confirmModal.hide();
        if (reportModal) {
          reportModal.show();
        }
      };

      const executeDeleteBtn = document.getElementById("btn_report_confirm_execute");
      executeDeleteBtn.onclick = async () => {
        console.log(`【モーダル削除】ID: ${currentReportId} を完全に削除します...`);

        try {
          const { error } = await supabase.from("report_logs").delete().eq("id", currentReportId);
          if (error) throw error;

          if (typeof window.showToast === "function") {
            window.showToast(`${reportType}を完全に削除しました。`, "success");
          }

          confirmModal.hide();

          document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
          document.body.classList.remove("modal-open");
          document.body.style.overflow = "";
          document.body.style.paddingRight = "";

          if (typeof refreshReportList === "function") {
            await refreshReportList();
          }

          if (typeof renderReportCalendar === "function") {
            const monthInput = document.getElementById("display_period");

            if (monthInput && monthInput.value) {
              const [y, m] = monthInput.value.split("-").map(Number);
              await renderReportCalendar(y, m);
            } else {
              const now = new Date();
              await renderReportCalendar(now.getFullYear(), now.getMonth() + 1);
            }
            console.log("【モーダル保存】ミニカレンダーを強制更新しました。");
          }
        } catch (err) {
          console.error("【モーダル保存】エラーが発生しました:", err.message);
          if (typeof window.showToast === "function") {
            window.showToast(`保存に失敗しました: ${err.message}`, "error");
          }
        }
      };
    });
  }

  const cancelBtnTop = document.getElementById("cancel_button_top");
  const cancelBtnBottom = document.getElementById("cancel_button");

  const handleCloseAttempt = () => {
    let isChanged = false;
    const currentType = document.getElementById("report_type")?.value || "日報";

    const currentTitle = document.getElementById("subject_title")?.value || "";
    const currentLocation = document.getElementById("work_location")?.value || "";
    const currentCustomer = document.getElementById("customer_name")?.value || "";
    const currentCompanion = document.getElementById("companion_name")?.value || "";
    const currentInstructor = document.getElementById("instructor_name")?.value || "";
    const currentImpression = document.getElementById("content_impression")?.value || "";
    const currentRemaining = document.getElementById("content_remaining_work")?.value || "";
    const currentNearGoal = document.getElementById("content_near_goal")?.value || "";
    const currentIssue = document.getElementById("content_issue")?.value || "";
    const currentActionPlan = document.getElementById("content_action_plan")?.value || "";
    const currentNextSchedule = document.getElementById("next_schedule")?.value || "";
    const currentNotice = document.getElementById("content_notice")?.value || "";

    const currentWorkPeriodStart = document.getElementById("work_period_start")?.value || "";
    const currentWorkPeriodEnd = document.getElementById("work_period_end")?.value || "";
    const currentWorkPeriodSingle = document.getElementById("work_period_single")?.value || "";

    let currentContent = "";
    if (currentType === "週報") {
      currentContent = JSON.stringify({
        mon: document.getElementById("work_mon")?.value || "",
        tue: document.getElementById("work_tue")?.value || "",
        wed: document.getElementById("work_wed")?.value || "",
        thu: document.getElementById("work_thu")?.value || "",
        fri: document.getElementById("work_fri")?.value || "",
        sat: document.getElementById("work_sat")?.value || "",
        sun: document.getElementById("work_sun")?.value || "",
      });
    } else {
      currentContent = document.getElementById("work_content_free")?.value || "";
    }

    if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
      // 🌟 日報・週報などのタイプに応じて、比較する日付インプットを正しく切り替える
      const isDateChanged =
        currentType === "日報"
          ? currentWorkPeriodSingle !== (currentDisplayReportData.work_period_start || "")
          : currentWorkPeriodStart !== (currentDisplayReportData.work_period_start || "") ||
            currentWorkPeriodEnd !== (currentDisplayReportData.work_period_end || "");

      isChanged =
        currentTitle !== (currentDisplayReportData.subject_title || "") ||
        currentLocation !== (currentDisplayReportData.work_location || "") ||
        currentCustomer !== (currentDisplayReportData.customer_name || "") ||
        currentCompanion !== (currentDisplayReportData.companion_name || "") ||
        currentInstructor !== (currentDisplayReportData.instructor_name || "") ||
        currentContent !== (currentDisplayReportData.work_content || "") ||
        currentImpression !== (currentDisplayReportData.content_impression || "") ||
        currentRemaining !== (currentDisplayReportData.content_remaining_work || "") ||
        currentNearGoal !== (currentDisplayReportData.content_near_goal || "") ||
        currentIssue !== (currentDisplayReportData.content_issue || "") ||
        currentActionPlan !== (currentDisplayReportData.content_action_plan || "") ||
        currentNextSchedule !== (currentDisplayReportData.next_schedule || "") ||
        currentNotice !== (currentDisplayReportData.content_notice || "") ||
        isDateChanged; // 🌟 安全になった日付チェックをここに適用
    } else {
      const isWeeklyContentEmpty =
        currentType === "週報" && currentContent === JSON.stringify({ mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" });
      const isFreeContentEmpty = currentType !== "週報" && currentContent === "";
      const todayStr = new Date().toISOString().split("T")[0];

      if (
        currentTitle !== "" ||
        currentLocation !== "" ||
        currentCustomer !== "" ||
        currentCompanion !== "" ||
        currentInstructor !== "" ||
        currentImpression !== "" ||
        currentRemaining !== "" ||
        currentNearGoal !== "" ||
        currentIssue !== "" ||
        currentActionPlan !== "" ||
        currentNextSchedule !== "" ||
        currentNotice !== "" ||
        (currentType === "日報" && currentWorkPeriodSingle !== todayStr && currentWorkPeriodSingle !== "") ||
        (currentType !== "日報" && (currentWorkPeriodStart !== todayStr || currentWorkPeriodEnd !== todayStr) && currentWorkPeriodStart !== "") ||
        (!isWeeklyContentEmpty && !isFreeContentEmpty)
      ) {
        isChanged = true;
      }
    }

    if (isChanged) {
      const reportModal = getModalInstance();
      if (reportModal) {
        reportModal.hide();
      }

      const discardModalEl = document.getElementById("reportDiscardConfirmModal");
      const discardModal = new bootstrap.Modal(discardModalEl);
      discardModal.show();

      document.getElementById("btn_report_discard_execute").onclick = () => {
        discardModal.hide();
        document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
        document.body.classList.remove("modal-open");
        document.body.style.overflow = "";
      };

      document.getElementById("btn_report_discard_cancel").onclick = () => {
        discardModal.hide();
        if (reportModal) {
          reportModal.show();
        }
      };
    } else {
      const reportModal = getModalInstance();
      if (reportModal) reportModal.hide();
    }
  };

  if (cancelBtnTop) {
    cancelBtnTop.replaceWith(cancelBtnTop.cloneNode(true));
    document.getElementById("cancel_button_top").addEventListener("click", handleCloseAttempt);
  }
  if (cancelBtnBottom) {
    cancelBtnBottom.replaceWith(cancelBtnBottom.cloneNode(true));
    document.getElementById("cancel_button").addEventListener("click", handleCloseAttempt);
  }
}

/**
 * Bootstrapのモーダルインスタンスを安全に取得または生成する共通関数
 */
function getModalInstance() {
  const modalElement = document.getElementById("modal_report_entry");
  if (!modalElement) return null;
  let modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (!modalInstance) {
    modalInstance = new bootstrap.Modal(modalElement);
  }
  return modalInstance;
}

/**
 * モーダルを開く（新規登録モード）
 */
function openNewReportModal() {
  currentReportId = null;

  const mainTitleText = document.getElementById("report_modal_title_text");
  if (mainTitleText) mainTitleText.innerText = "レポート登録";

  const badgeSpan = document.getElementById("report_modal_status_badge");
  if (badgeSpan) badgeSpan.innerHTML = "";

  const draftBtn = document.getElementById("draft_button");
  if (draftBtn) draftBtn.classList.remove("d-none");

  const submitBtn = document.getElementById("submit_button");
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>送信`;
  }

  const modalDeleteBtn = document.getElementById("modal_delete_button");
  if (modalDeleteBtn) modalDeleteBtn.classList.add("d-none");

  const form = document.getElementById("form_report_entry");
  if (form) {
    form.reset();
    form.classList.remove("was-validated");
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    form.querySelectorAll(".form-control, .form-select").forEach((el) => {
      el.style.border = "";
      el.style.boxShadow = "";
    });
  }

  if (document.getElementById("work_period_start")) document.getElementById("work_period_start").value = "";
  if (document.getElementById("work_period_end")) document.getElementById("work_period_end").value = "";
  if (document.getElementById("work_period_single")) document.getElementById("work_period_single").value = "";
  if (document.getElementById("work_content_free")) document.getElementById("work_content_free").value = "";

  const defaultType = "日報";
  const reportTypeSelect = document.getElementById("report_type");
  if (reportTypeSelect) reportTypeSelect.value = defaultType;

  const reporterNameDiv = document.getElementById("reporter_name");
  if (reporterNameDiv) {
    const cachedName = localStorage.getItem("cached_user_name") || "ログインユーザー";
    const localFullName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim();
    reporterNameDiv.innerText = localFullName || cachedName;
  }

  syncReportTypeUI();
  setupSharedWithList();

  const reportModal = getModalInstance();
  if (reportModal) reportModal.show();
}

/**
 * モーダルを開いて既存データをセットする（編集モード）
 */
function openEditReportModal(reportData) {
  currentReportId = reportData.id;

  const mainTitleText = document.getElementById("report_modal_title_text");
  if (mainTitleText) mainTitleText.innerText = "レポート編集";

  const badgeSpan = document.getElementById("report_modal_status_badge");
  if (badgeSpan) {
    if (reportData.status === "draft") {
      badgeSpan.innerHTML = `<span class="badge bg-warning text-white rounded fw-bold px-2 py-0.5" style="font-size: 0.75rem; letter-spacing: 0.05em;">下書き</span>`;
    } else {
      badgeSpan.innerHTML = "";
    }
  }

  const draftBtn = document.getElementById("draft_button");
  if (draftBtn) {
    if (reportData.is_active === true) {
      draftBtn.classList.add("d-none");
    } else {
      draftBtn.classList.remove("d-none");
    }
  }

  const submitBtn = document.getElementById("submit_button");
  if (submitBtn) {
    if (reportData.is_active === true) {
      submitBtn.innerHTML = `<i class="bi bi-arrow-repeat me-1"></i>更新`;
    } else {
      submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>送信`;
    }
  }

  const modalDeleteBtn = document.getElementById("modal_delete_button");
  if (modalDeleteBtn) modalDeleteBtn.classList.remove("d-none");

  const form = document.getElementById("form_report_entry");
  if (form) {
    form.reset();
    form.classList.remove("was-validated");
  }

  // 🌟 ここから追記 🌟
  // データを画面に詰め終わった直後、ブラウザの「値が変わった！」という勘違いを強制リセット
  if (typeof isFormChanged !== "undefined") isFormChanged = false;
  if (typeof isDirty !== "undefined") isDirty = false;
  if (typeof hasChanges !== "undefined") hasChanges = false;
  // 🌟 ここまで追記 🌟

  // ==========================================
  // レポートの作成者名を取得してセット
  // ==========================================
  const reportUser = reportData.user_master;
  let reporterName = "";
  let reporterFullName = "";

  const currentLoginUser = typeof loginUser !== "undefined" && loginUser ? loginUser : {};

  // 1. もし自分のレポート、またはログインユーザーとIDが一致する場合
  if (reportData.user_id === currentLoginUser.id) {
    const localFN = `${currentLoginUser.last_name || ""} ${currentLoginUser.first_name || ""}`.trim();
    reporterName = currentLoginUser.user_name || localFN;
    reporterFullName = localFN || "自分";
  }
  // 2. 他人のレポートの場合
  else if (reportUser) {
    const dbFN = `${reportUser.last_name || ""} ${reportUser.first_name || ""}`.trim();
    if (reportUser.user_name) {
      reporterName = reportUser.user_name;
    } else {
      reporterName = dbFN;
    }
    reporterFullName = dbFN || "";
  }

  // 3. セーフティネット
  if (!reporterName || reporterName === "不明なユーザー") {
    reporterName = localStorage.getItem("cached_user_name") || "ログインユーザー";
    reporterFullName = "ユーザー";
  }

  const targetNameEl = document.getElementById("reporter_name");
  if (targetNameEl) {
    targetNameEl.innerText = reporterName.trim();
  }

  if (document.getElementById("report_type")) document.getElementById("report_type").value = reportData.report_type;

  if (document.getElementById("subject_title")) document.getElementById("subject_title").value = reportData.subject_title || "";
  if (document.getElementById("work_location")) document.getElementById("work_location").value = reportData.work_location || "";
  if (document.getElementById("customer_name")) document.getElementById("customer_name").value = reportData.customer_name || "";
  if (document.getElementById("companion_name")) document.getElementById("companion_name").value = reportData.companion_name || "";
  if (document.getElementById("instructor_name")) document.getElementById("instructor_name").value = reportData.instructor_name || "";

  if (reportData.report_type === "日報") {
    if (document.getElementById("work_period_single")) document.getElementById("work_period_single").value = reportData.work_period_start;
  } else {
    if (document.getElementById("work_period_start")) document.getElementById("work_period_start").value = reportData.work_period_start;
    if (document.getElementById("work_period_end")) document.getElementById("work_period_end").value = reportData.work_period_end;
  }

  if (reportData.report_type === "週報" && reportData.work_content) {
    try {
      const weeklyData = JSON.parse(reportData.work_content);
      if (document.getElementById("work_mon")) document.getElementById("work_mon").value = weeklyData.mon || "";
      if (document.getElementById("work_tue")) document.getElementById("work_tue").value = weeklyData.tue || "";
      if (document.getElementById("work_wed")) document.getElementById("work_wed").value = weeklyData.wed || "";
      if (document.getElementById("work_thu")) document.getElementById("work_thu").value = weeklyData.thu || "";
      if (document.getElementById("work_fri")) document.getElementById("work_fri").value = weeklyData.fri || "";
      if (document.getElementById("work_sat")) document.getElementById("work_sat").value = weeklyData.sat || "";
      if (document.getElementById("work_sun")) document.getElementById("work_sun").value = weeklyData.sun || "";
    } catch (e) {
      if (document.getElementById("work_content_free")) document.getElementById("work_content_free").value = reportData.work_content;
    }
  }

  if (reportData.report_type !== "週報" && document.getElementById("work_content_free")) {
    document.getElementById("work_content_free").value = reportData.work_content || "";
  }

  const textFields = [
    "content_impression",
    "content_remaining_work",
    "content_near_goal",
    "content_issue",
    "content_action_plan",
    "next_schedule",
    "content_notice",
  ];

  textFields.forEach((field) => {
    if (document.getElementById(field)) document.getElementById(field).value = reportData[field] || "";
  });

  // ==========================================
  // 組み立てた「フルネーム」を渡してUIとタイトルを同期
  // ==========================================
  syncReportTypeUI(reporterFullName);

  // 非同期で既存の共有先データを引っ張ってきてからリストを生成する
  (async () => {
    let savedCompanyIds = [];
    try {
      const { data: shares, error } = await supabase.from("report_shares").select("user_master(company_id)").eq("report_id", reportData.id);

      if (error) throw error;

      if (shares && shares.length > 0) {
        const companyIdSet = new Set();
        shares.forEach((share) => {
          if (share.user_master && share.user_master.company_id) {
            companyIdSet.add(share.user_master.company_id);
          }
        });
        savedCompanyIds = Array.from(companyIdSet);
      }
    } catch (err) {
      console.error("【編集モーダル】共有先データの再取得に失敗しました:", err.message);
    } finally {
      setupSharedWithList(savedCompanyIds);

      const reportModal = getModalInstance();
      if (reportModal) reportModal.show();
    }
  })();
}

/**
 * 画面内の永続要素（新規作成ボタン・編集ボタンなど）のイベントを設定する関数
 */
function initReportMenuEvents() {
  const newBtn = document.getElementById("report_new_button");
  const editBtn = document.getElementById("report_edit_button");

  if (newBtn) {
    newBtn.replaceWith(newBtn.cloneNode(true));
    const cleanNewBtn = document.getElementById("report_new_button");

    cleanNewBtn.addEventListener("click", () => {
      console.log("新規作成ボタンがクリックされました。モーダルを開きます。");
      openNewReportModal();
    });
  }

  if (editBtn) {
    editBtn.replaceWith(editBtn.cloneNode(true));
    const cleanEditBtn = document.getElementById("report_edit_button");

    if (typeof currentDisplayReportData === "undefined" || !currentDisplayReportData || !currentDisplayReportData.id) {
      cleanEditBtn.disabled = true;
      cleanEditBtn.classList.add("opacity-50");
    } else {
      cleanEditBtn.disabled = false;
      cleanEditBtn.classList.remove("opacity-50");
    }

    cleanEditBtn.addEventListener("click", () => {
      if (typeof currentDisplayReportData !== "undefined" && currentDisplayReportData && currentDisplayReportData.id) {
        console.log("編集ボタンがクリックされました。対象データをモーダルに引き渡します:", currentDisplayReportData);
        openEditReportModal(currentDisplayReportData);
      } else {
        console.warn("編集対象のデータが選択されていないか、データがまだ読み込まれていません。");
        if (typeof window.showToast === "function") {
          window.showToast("編集するレポートデータがありません。", "error");
        }
      }
    });
  }
}

/**
 * SupabaseデータベースへのUpsert処理
 */
async function saveReport(status) {
  const form = document.getElementById("form_report_entry");

  if (form) {
    form.classList.remove("was-validated");
  }

  const reportTypeSelect = document.getElementById("report_type");
  if (!reportTypeSelect) return;
  const reportType = reportTypeSelect.value;

  if (status === "published") {
    if (form) {
      form.querySelectorAll(".form-control, .form-select").forEach((el) => {
        el.style.border = "";
        el.style.boxShadow = "";
      });
    }

    const isFormInvalid = form && !form.checkValidity();

    if (isFormInvalid) {
      if (form) form.classList.add("was-validated");

      let targetElement = form.querySelector(":invalid");

      if (targetElement) {
        targetElement.style.setProperty("border", "1px solid #dc3545", "important");
        targetElement.style.setProperty("box-shadow", "0 0 12px rgba(220, 53, 69, 0.8)", "important");

        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });

        const removeRedStyle = () => {
          targetElement.style.border = "";
          targetElement.style.boxShadow = "";
          targetElement.removeEventListener("input", removeRedStyle);
          targetElement.removeEventListener("blur", removeRedStyle);
        };
        targetElement.addEventListener("input", removeRedStyle);
        targetElement.addEventListener("blur", removeRedStyle);
      }

      if (typeof window.showToast === "function") {
        window.showToast("必須項目が入力されていません", "error");
      }
      return;
    }
  }

  let startDate = document.getElementById("work_period_start") ? document.getElementById("work_period_start").value : null;
  let endDate = document.getElementById("work_period_end") ? document.getElementById("work_period_end").value : null;

  if (reportType === "日報") {
    const singleDate = document.getElementById("work_period_single") ? document.getElementById("work_period_single").value : null;
    startDate = singleDate;
    endDate = singleDate;
  }

  startDate = startDate === "" ? null : startDate;
  endDate = endDate === "" ? null : endDate;

  let finalWorkContent = "";
  let finalImpression = document.getElementById("content_impression") ? document.getElementById("content_impression").value : "";

  if (reportType === "週報") {
    const weeklyJson = {
      mon: document.getElementById("work_mon") ? document.getElementById("work_mon").value : "",
      tue: document.getElementById("work_tue") ? document.getElementById("work_tue").value : "",
      wed: document.getElementById("work_wed") ? document.getElementById("work_wed").value : "",
      thu: document.getElementById("work_thu") ? document.getElementById("work_thu").value : "",
      fri: document.getElementById("work_fri") ? document.getElementById("work_fri").value : "",
      sat: document.getElementById("work_sat") ? document.getElementById("work_sat").value : "",
      sun: document.getElementById("work_sun") ? document.getElementById("work_sun").value : "",
    };
    finalWorkContent = JSON.stringify(weeklyJson);
  } else {
    finalWorkContent = document.getElementById("work_content_free") ? document.getElementById("work_content_free").value : "";
  }

  const updateData = {
    user_id: currentReportId && currentDisplayReportData ? currentDisplayReportData.user_id : loginUser.id,
    report_date: startDate || new Date().toISOString().split("T")[0],
    report_type: reportType,
    work_period_start: startDate,
    work_period_end: endDate,
    company_id: currentReportId && currentDisplayReportData ? currentDisplayReportData.company_id : loginUser.company_id,
    customer_name: document.getElementById("customer_name") ? document.getElementById("customer_name").value : "",
    subject_title: document.getElementById("subject_title") ? document.getElementById("subject_title").value : "",
    work_location: document.getElementById("work_location") ? document.getElementById("work_location").value : "",
    companion_name: document.getElementById("companion_name") ? document.getElementById("companion_name").value : "",
    instructor_name: document.getElementById("instructor_name") ? document.getElementById("instructor_name").value : "",
    work_content: finalWorkContent,
    content_impression: finalImpression,
    content_remaining_work: document.getElementById("content_remaining_work") ? document.getElementById("content_remaining_work").value : "",
    content_near_goal: document.getElementById("content_near_goal") ? document.getElementById("content_near_goal").value : "",
    content_issue: document.getElementById("content_issue") ? document.getElementById("content_issue").value : "",
    content_action_plan: document.getElementById("content_action_plan") ? document.getElementById("content_action_plan").value : "",
    next_schedule: document.getElementById("next_schedule") ? document.getElementById("next_schedule").value : "",
    content_notice: document.getElementById("content_notice") ? document.getElementById("content_notice").value : "",
    status: status,
    is_active: status === "draft" ? false : true,
  };

  let isReportChanged = true;

  if (currentReportId && currentDisplayReportData) {
    const isChanged =
      updateData.subject_title !== (currentDisplayReportData.subject_title || "") ||
      updateData.work_content !== (currentDisplayReportData.work_content || "") ||
      updateData.content_impression !== (currentDisplayReportData.content_impression || "") ||
      updateData.customer_name !== (currentDisplayReportData.customer_name || "") ||
      updateData.work_location !== (currentDisplayReportData.work_location || "") ||
      updateData.work_period_start !== (currentDisplayReportData.work_period_start || "") ||
      updateData.work_period_end !== (currentDisplayReportData.work_period_end || "") ||
      updateData.is_active !== currentDisplayReportData.is_active;

    isReportChanged = isChanged;

    if (isChanged) {
      updateData.updated_at = new Date().toISOString();
    }
    if (currentDisplayReportData.status === "draft" && status === "published") {
      updateData.created_at = new Date().toISOString();
      isReportChanged = true;
      console.log("【モーダル保存】下書きから正式提出へ切り替わったため、作成日時(created_at)を現在の時刻に更新します。");
    }
  }

  // 🌟【最優先チェック】もし内容に変更がない場合は、確認モーダルすら出さずにトースト通知して終了する
  if (currentReportId && status === "published" && !isReportChanged) {
    console.log("【モーダル保存】内容に変更がないため、処理を中断します。");
    if (typeof window.showToast === "function") {
      window.showToast("変更はありませんでした。", "info");
    }
    return; // 👈 ここで終わらせることで、編集モーダルも閉じず、そのままの状態をキープします！
  }

  // 🌟【確認モーダル起動ロジック】既存のレポートを更新する場合のみ実行
  let shouldResetShares = false;

  if (currentReportId && status === "published" && currentDisplayReportData && currentDisplayReportData.status === "published") {
    // ユーザーの選択を待つPromise処理
    const userChoice = await new Promise((resolve) => {
      const modalEl = document.getElementById("reportUpdateConfirmModal");
      if (!modalEl) return resolve("cancel");

      // ボタンのイベント二重登録を防ぐためのクローン初期化
      const btnReset = document.getElementById("btn_report_update_with_reset");
      const btnKeep = document.getElementById("btn_report_update_keep_read");
      const btnCancel = document.getElementById("btn_report_update_cancel");

      const newBtnReset = btnReset.cloneNode(true);
      const newBtnKeep = btnKeep.cloneNode(true);
      const newBtnCancel = btnCancel.cloneNode(true);

      btnReset.parentNode.replaceChild(newBtnReset, btnReset);
      btnKeep.parentNode.replaceChild(newBtnKeep, btnKeep);
      btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

      const bsModal = new bootstrap.Modal(modalEl);

      // モーダルが開くタイミングで背景のz-indexも自動調整
      modalEl.addEventListener(
        "show.bs.modal",
        () => {
          // 1. 後ろにあるメインの入力モーダルを非表示にして下げる
          const reportModal = getModalInstance();
          if (reportModal) {
            reportModal.hide();
          }

          setTimeout(() => {
            const backdrops = document.querySelectorAll(".modal-backdrop");
            if (backdrops.length > 1) {
              backdrops[backdrops.length - 1].style.zIndex = "9998";
            }
          }, 50);
        },
        { once: true },
      );

      bsModal.show();

      // 各ボタンのクリックイベント
      newBtnReset.addEventListener(
        "click",
        () => {
          bsModal.hide();
          resolve("reset");
        },
        { once: true },
      );
      newBtnKeep.addEventListener(
        "click",
        () => {
          bsModal.hide();
          resolve("keep");
        },
        { once: true },
      );
      newBtnCancel.addEventListener(
        "click",
        () => {
          bsModal.hide();

          // 2. 【追加ケア】確認モーダルでキャンセルされた場合は、入力モーダルを再表示して元に戻す
          const reportModal = getModalInstance();
          if (reportModal) {
            reportModal.show();
          }

          resolve("cancel");
        },
        { once: true },
      );
    });

    // キャンセル時は編集画面をそのまま維持
    if (userChoice === "cancel") {
      console.log("【モーダル保存】更新がキャンセルされました。");
      return;
    }

    if (userChoice === "reset") {
      shouldResetShares = true;
    }
  }

  try {
    let savedReportId = currentReportId;

    if (currentReportId) {
      const { data, error } = await supabase.from("report_logs").update(updateData).eq("id", currentReportId).select();
      if (error) throw error;
      console.log("【モーダル保存】レポートを更新しました。");
    } else {
      const { data, error } = await supabase.from("report_logs").insert([updateData]).select();
      if (error) throw error;
      if (data && data.length > 0) {
        savedReportId = data[0].id;
      }
      console.log("【モーダル保存】新規レポートを登録しました。ID:", savedReportId);
    }

    // 🌟【修正】既読リセットと共有先保存のコントロール
    if (currentReportId && shouldResetShares) {
      // ①「既読リセットして更新」が選ばれた場合：既存データを一括未読化する
      console.log("【モーダル保存】共有先の既読状況を一律未読にリセットします。");
      const { error: resetError } = await supabase
        .from("report_shares")
        .update({
          is_read: false,
          read_at: null,
        })
        .eq("report_id", currentReportId);

      if (resetError) {
        console.error("【モーダル保存】既読状況のリセットに失敗しました:", resetError);
      }
    } else if (!currentReportId) {
      // ②「新規登録」の場合のみ：新しく共有先を保存する
      if (savedReportId) {
        await saveReportShares(savedReportId);
      }
    } else {
      // ③「既読を維持して更新」の場合：
      // saveReportShares を呼び出さないことで、Supabase側にある既存の既読データ（is_read や read_at）を完全に無傷で残します！
      console.log("【モーダル保存】既読状況を維持するため、共有先の再保存処理をスキップしました。");
    }

    if (typeof window.showToast === "function") {
      if (!isReportChanged) {
        window.showToast("変更はありませんでした。", "info");
      } else {
        let msg = "";
        if (status === "draft") {
          msg = "下書きとして保存しました。";
        } else {
          if (currentReportId) {
            msg = shouldResetShares ? "既読状況をリセットしてレポートを更新しました。" : "既読状況を維持したままレポートを更新しました。";
          } else {
            msg = "レポートを提出しました。";
          }
        }
        window.showToast(msg, "success");
      }
    }

    const reportModal = getModalInstance();
    if (reportModal) {
      reportModal.hide();
    }

    document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
    document.body.classList.remove("modal-open");
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";

    if (typeof refreshReportList === "function") {
      await refreshReportList();
    }
  } catch (err) {
    console.error("【モーダル保存】エラーが発生しました:", err.message);
    if (typeof window.showToast === "function") {
      window.showToast(`保存に失敗しました: ${err.message}`, "error");
    }
  }
}
