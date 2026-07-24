/**
 * 業務レポート入力・編集モーダル制御スクリプト
 */

// ログイン中のユーザー情報を保持するオブジェクト
let loginUser = {
  id: null,
  user_name: "未ログイン",
  last_name: "",
  first_name: "",
  company_id: null,
};

// 編集モード判定用の変数（nullの場合は新規作成）
let currentReportId = null;

// 現在開いているレポートの作成者フルネームを一時保持する変数
let currentReportAuthorName = null;

// 編集中のデータを丸ごと保持する変数
let currentEditReportData = null;

// ◆ 週報・月報の「開始日」と「終了日」の範囲制御（開始日より過去を選択不可にする）
function updateEndDateMinLimit() {
  const startEl = document.getElementById("work_period_start");
  const endEl = document.getElementById("work_period_end");

  if (!startEl || !endEl) return;

  const startVal = startEl.value; // 例: "2026-07-23"

  if (startVal) {
    // ① 終了日のカレンダーで開始日より前の日付を選択不可（min指定）にする
    endEl.min = startVal;

    // ② もし終了日に「開始日より前の日付」が既に入っていたら、開始日と同じ日付に繰り上げる
    if (endEl.value && endEl.value < startVal) {
      endEl.value = startVal;
    }
  } else {
    // 開始日が空なら制限解除
    endEl.removeAttribute("min");
  }
}

// ユーザーが開始日（work_period_start）を手動変更した時のイベントを登録
document.addEventListener("DOMContentLoaded", () => {
  const startEl = document.getElementById("work_period_start");
  if (startEl) {
    startEl.addEventListener("change", updateEndDateMinLimit);
    startEl.addEventListener("input", updateEndDateMinLimit);
  }
});

// ◆ ログインユーザー情報同期処理
//  【目的】Supabase Authから現在のセッションユーザーを取得し、さらにuser_masterテーブルから最新のプロファイル情報を取得してローカル変数およびキャッシュに同期する
async function fetchAndSetLoginUser() {
  try {
    // Step1: Supabase Authから現在のログインセッション情報を取得
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.warn("ログインユーザーの取得に失敗したか、セッションがありません。");
      return;
    }

    const userUuid = user.id;

    // Step2: ユーザーマスタから有効なプロファイル情報（会社ID等を含む）を取得
    const { data: profile, error: dbError } = await supabase
      .from("user_master")
      .select("id, user_name, last_name, first_name, company_id")
      .eq("id", userUuid)
      .eq("is_active", true)
      .single();

    if (dbError) throw dbError;

    // Step3: 取得した情報をスクリプト共通オブジェクトおよびローカルストレージへ同期
    if (profile) {
      loginUser.id = profile.id;
      loginUser.user_name = profile.user_name;
      loginUser.last_name = profile.last_name;
      loginUser.first_name = profile.first_name || "";
      loginUser.company_id = profile.company_id;

      localStorage.setItem("cached_user_name", profile.user_name);
      localStorage.setItem("cached_user_company_id", profile.company_id);

      const fullName = `${loginUser.last_name} ${loginUser.first_name}`.trim();
      console.log(`ログインユーザー情報を同期しました: ${fullName}さん (会社ID: ${loginUser.company_id})`);
    }
  } catch (error) {
    console.error("ログインユーザー情報の取得中にエラーが発生しました:", error.message);
  }
}

/**
 * ◆ モーダルヘッダータイトル動的更新処理
 * 【目的】報告種別（日報・週報・月報）と対象ユーザーの氏名を結合し、モーダル内のタイトル表示領域（要素のタグ種別を問わず）へ動的に反映する
 * @param {string} type - 報告種別
 * @param {string} [reporterFullName] - 作成者のフルネーム（編集モード用）
 */
function updateModalDynamicTitle(type, reporterFullName = null) {
  let displayName = "";
  if (reporterFullName) {
    displayName = reporterFullName;
  } else {
    displayName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim();
  }

  const generatedTitle = `${type}：${displayName || "ユーザー"}`;

  // Step1: メインの動的タイトル要素（input/textareaタグか通常のテキスト要素か）を判定して書き込み
  const dynamicTitleSpan = document.getElementById("modal_report_dynamic_title");
  if (dynamicTitleSpan) {
    if (dynamicTitleSpan.tagName === "INPUT" || dynamicTitleSpan.tagName === "TEXTAREA") {
      dynamicTitleSpan.value = generatedTitle;
    } else {
      dynamicTitleSpan.innerText = generatedTitle;
    }
  }

  // Step2: 新規登録か編集モードかに応じてヘッダーの補助タイトルテキストを切り替え
  const mainTitleText = document.getElementById("report_modal_title_text");
  if (mainTitleText) {
    mainTitleText.innerText = currentReportId ? "レポート編集" : "レポート登録";
  }
}

/**
 * ◆ 報告種別連動UI切り替え処理
 * 【目的】選択された報告種別（日報/週報/月報）に応じて、ラベル文字の変更、特定入力エリアの表示・非表示、プレースホルダーの切り替えを統括制御する
 * @param {string} [reporterFullName] - 作成者のフルネーム
 */
function syncReportTypeUI(reporterFullName = null) {
  const reportTypeSelect = document.getElementById("report_type");
  if (!reportTypeSelect) return;

  const type = reportTypeSelect.value;

  // Step1: 報告種別と氏名をベースにヘッダータイトルを更新
  updateModalDynamicTitle(type, reporterFullName);

  // Step2: 顧客名・指示者ラベルおよび同伴者入力フィールドの動的切り替え
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

  // Step3: アーク空調かつ日報選択時専用の残作業注意喚起文言制御
  const remainingWorkTextarea = document.getElementById("content_remaining_work");
  if (remainingWorkTextarea) {
    if (loginUser.company_id === "d4594757-127a-4a2c-abf7-95828e03698c" && type === "日報") {
      remainingWorkTextarea.placeholder = "※残作業（見積等）・継続作業はTODOにも入力すること";
    } else {
      remainingWorkTextarea.placeholder = "";
    }
  }

  // Step4: 作業内容記述エリアの切り替え（週報用の曜日別テーブル vs 日報・月報用のフリー入力）
  const workContentFreeWrapper = document.getElementById("work_content_free_wrapper");
  const workContentWeeklyWrapper = document.getElementById("work_content_weekly_wrapper");

  if (workContentFreeWrapper && workContentWeeklyWrapper) {
    if (type === "週報") {
      workContentFreeWrapper.classList.add("d-none");
      workContentWeeklyWrapper.classList.remove("d-none");
    } else {
      workContentFreeWrapper.classList.remove("d-none");
      workContentWeeklyWrapper.classList.add("d-none");
    }
  }

  // Step5: 作業期間入力エリアの切り替え（日報用の単一日付 vs 週報・月報用の開始・終了範囲入力）
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
 * ◆ 共有先チェックボックスリスト構築処理
 * 【目的】マスタ定義された共有対象会社一覧に基づき、チェックボックスHTMLを動的に生成してコンテナへ配置する（編集可否や所属による初期値制御を含む）
 * @param {Array<string>} [savedCompanyIds=[]] - 編集モード時に既に保存されている会社IDの配列
 * @param {boolean} [isEditable=true] - 編集可能かどうか（falseの場合は操作不可に制限）
 */
function setupSharedWithList(savedCompanyIds = [], isEditable = true) {
  const containerEl = document.getElementById("shared_with_container");
  if (!containerEl) return;

  const ARC_RETON_ID = "b91cf02c-7614-4baa-9ee0-de42c1311d81"; // アークリトンID
  const ARC_KUCHO_ID = "d4594757-127a-4a2c-abf7-95828e03698c"; // アーク空調ID

  const companies = [
    { id: ARC_RETON_ID, name: "株式会社アークリトン（全体）" },
    { id: ARC_KUCHO_ID, name: "株式会社アーク空調設備（全体）" },
  ];

  containerEl.innerHTML = companies
    .map((company) => {
      let isChecked = "";

      // 新規か編集かに応じて初期チェック状態を判定
      if (currentReportId) {
        isChecked = savedCompanyIds.includes(company.id) ? "checked" : "";
      } else {
        isChecked = loginUser.company_id === company.id ? "checked" : ""; //
      }

      const isDisabled = isEditable ? "" : "disabled";

      return `
      <div class="form-check mb-2">
        <input class="form-check-input shared-company-checkbox" type="checkbox" value="${company.id}" id="chk_company_${company.id}" ${isChecked} ${isDisabled}>
        <label class="form-check-label small fw-semibold text-dark" for="chk_company_${company.id}">
          ${company.name}
        </label>
      </div>
    `;
    })
    .join("");
}

/**
 * ◆ 共有先閲覧権限一括更新・登録処理（差分更新・既読状態保持版）
 * 【目的】チェックされた所属会社の有効ユーザーを特定し、既存データとの差分（追加・削除）のみをDBに反映する。
 *         以前から共有されていたユーザーの既読ステータス（is_read, read_at）は維持される。
 * @param {string} reportId - 対象となる report_logs の UUID
 */
async function saveReportShares(reportId) {
  const checkedBoxes = document.querySelectorAll(".shared-company-checkbox:checked");
  const selectedCompanyIds = Array.from(checkedBoxes).map((cb) => cb.value);

  try {
    // Step1: 現在画面で選択されている会社に属する「最新の対象ユーザーID一覧」を取得
    let targetUserIds = [];
    if (selectedCompanyIds.length > 0) {
      const { data: users, error: userError } = await supabase
        .from("user_master")
        .select("id")
        .in("company_id", selectedCompanyIds)
        .eq("is_active", true);

      if (userError) throw userError;

      // 安全のため文字列変換を挟み、共有対象リストからレポート提出者本人を厳格に除外
      const currentUserId = loginUser && loginUser.id ? String(loginUser.id).toLowerCase() : null;
      targetUserIds = (users || []).map((u) => u.id).filter((id) => String(id).toLowerCase() !== currentUserId);
    }

    // Step2: 現在 DB の report_shares テーブルに登録されているユーザー一覧を取得
    const { data: currentShares, error: fetchError } = await supabase.from("report_shares").select("user_id").eq("report_id", reportId);

    if (fetchError) throw fetchError;

    const existingUserIds = (currentShares || []).map((s) => s.user_id);

    // Step3: 差分（新規追加すべき人 / 削除すべき人）の抽出
    // 今回チェックされたが、まだDBにないユーザー（新規追加）
    const toInsertUserIds = targetUserIds.filter((id) => !existingUserIds.includes(id));

    // DBに存在するが、今回チェックが外されたユーザー（削除）
    const toDeleteUserIds = existingUserIds.filter((id) => !targetUserIds.includes(id));

    console.log("【共有先更新デバッグ】新規追加対象者数:", toInsertUserIds.length, "削除対象者数:", toDeleteUserIds.length);

    // Step4: DBへの差分反映（新規は insert / 除外は delete / 変更なしはそのまま保持）
    // ① 新しく追加された共有先に「未読」で新規登録
    if (toInsertUserIds.length > 0) {
      const insertData = toInsertUserIds.map((userId) => ({
        report_id: reportId,
        user_id: userId,
        is_read: false,
      }));

      const { error: insertError } = await supabase.from("report_shares").insert(insertData);
      if (insertError) throw insertError;
    }

    // ② チェックが外された共有先からレコードを削除
    if (toDeleteUserIds.length > 0) {
      const { error: deleteError } = await supabase.from("report_shares").delete().eq("report_id", reportId).in("user_id", toDeleteUserIds);

      if (deleteError) throw deleteError;
    }

    console.log(
      `【共有先更新完了】新規追加: ${toInsertUserIds.length}件, 削除: ${toDeleteUserIds.length}件（既存の既読データは正常に保持されました）`,
    );
  } catch (err) {
    console.error("【共有先更新エラー】", err.message);
    if (typeof window.showToast === "function") {
      window.showToast(`共有先の更新に失敗しました: ${err.message}`, "error");
    }
  }
}

// ◆ モーダルDOMイベントバインド初期化処理
//  【目的】モーダル構築完了後に一度だけ呼び出され、種別変更イベント、提出・下書きボタン、論理/物理削除の確認フロー、および変更検知付きの閉じるキャンセル処理を登録する
function initializeReportModalLogic() {
  console.log("モーダル制御ロジックのバインドを実行します...");

  setupSharedWithList();

  // 種別変更セレクトボックスの連動イベント登録
  const reportTypeSelect = document.getElementById("report_type");
  const modalElement = document.getElementById("modal_report_entry");

  if (reportTypeSelect) {
    reportTypeSelect.onchange = () => {
      if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
        const master = currentDisplayReportData.user_master;
        const fn = master ? `${master.last_name || ""} ${master.first_name || ""}`.trim() : null;
        syncReportTypeUI(fn);
      } else {
        syncReportTypeUI();
      }
    };
  }

  // モーダル完全表示（shown.bs.modal）時のUI表示最終同期フローの登録
  if (modalElement) {
    modalElement.addEventListener("shown.bs.modal", () => {
      if (currentReportId && currentReportAuthorName) {
        console.log("【shown.bs.modal】編集モードでUIとタイトルを最終同期します。作成者:", currentReportAuthorName);
        syncReportTypeUI(currentReportAuthorName);
      } else {
        console.log("【shown.bs.modal】新規作成モードでUIとタイトルを同期します。");
        syncReportTypeUI();
      }
    });
  }

  // 提出・下書き保存ボタンに対する保存関数のバインド
  const submitBtn = document.getElementById("submit_button");
  const draftBtn = document.getElementById("draft_button");
  if (submitBtn) submitBtn.addEventListener("click", () => saveReport("published"));
  if (draftBtn) draftBtn.addEventListener("click", () => saveReport("draft"));

  // 削除ボタン押下時のモーダル切り替えと物理/論理削除実行フローのハンドリング
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

  // キャンセル（閉じる）ボタン押下時の未保存変更検知ダイアログ制御処理
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

    // 編集モード時：既存データオブジェクトと現在のDOM入力内容を全網羅で厳密に比較判定
    if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
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
        isDateChanged;
    } else {
      // 新規作成モード時：各値のデフォルト空状態からの変更をチェック
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

    // 値に変更が検知された場合のみ、確認の破棄警告モーダルを背後からポップアップ表示
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

// ◆ Bootstrapモーダルインスタンス安全取得処理
//  【目的】指定のDOM要素から既存のBootstrapモーダルインスタンスを取得し、未生成であれば新規生成して安全に返却する共通ヘルパー
function getModalInstance() {
  const modalElement = document.getElementById("modal_report_entry");
  if (!modalElement) return null;
  let modalInstance = bootstrap.Modal.getInstance(modalElement);
  if (!modalInstance) {
    modalInstance = new bootstrap.Modal(modalElement);
  }
  return modalInstance;
}

// ◆ モーダル表示制御処理（新規登録モード）
//  【目的】レポートの新規登録に必要な各フォームフィールドの値をデフォルト化し、UIボタンの表示状態を初期化して新規登録モーダルを表示する
function openNewReportModal() {
  currentReportId = null;
  currentReportAuthorName = null;

  // Step1: 各種タイトル文言・ステータス表示のクリアと初期化
  const mainTitleText = document.getElementById("report_modal_title_text");
  if (mainTitleText) mainTitleText.innerText = "レポート登録";

  const modalMainTitleEl =
    document.getElementById("reportModalLabel") || document.getElementById("modal_report_title") || document.querySelector(".modal-title");

  if (modalMainTitleEl) {
    modalMainTitleEl.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>レポート登録`; // 👈 閲覧から「登録」に書き戻す！
  }

  const badgeSpan = document.getElementById("report_modal_status_badge");
  if (badgeSpan) badgeSpan.innerHTML = "";

  // Step2: 操作ボタン（下書き、送信、削除）の表示状態制御
  const draftBtn = document.getElementById("draft_button");
  if (draftBtn) {
    draftBtn.classList.remove("d-none");
    draftBtn.style.removeProperty("display");
  }

  const submitBtn = document.getElementById("submit_button");
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>送信`;
    submitBtn.classList.remove("d-none");
    submitBtn.style.removeProperty("display");
  }

  const modalDeleteBtn = document.getElementById("modal_delete_button");
  if (modalDeleteBtn) {
    modalDeleteBtn.classList.add("d-none");
    modalDeleteBtn.style.setProperty("display", "none", "important");
  }

  // Step3: 入力フォーム全体のバリデーション表示リセットと要素有効化
  const form = document.getElementById("form_report_entry");
  if (form) {
    form.reset();
    form.classList.remove("was-validated");
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    form.querySelectorAll(".form-control, .form-select").forEach((el) => {
      el.style.border = "";
      el.style.boxShadow = "";
    });

    // 閲覧モードで付与された「disabled = true」の解除 ＆ プレースホルダーの復元
    Array.from(form.elements).forEach((el) => {
      el.disabled = false;

      // 💡 閲覧モード時に退避させていたプレースホルダーがあれば元に戻す！
      if (el.hasAttribute("data-original-placeholder")) {
        el.setAttribute("placeholder", el.getAttribute("data-original-placeholder"));
      }
    });
  }

  // Step4: 各日付・内容入力フィールドの初期化（本日の日付を自動セット）
  const todayStr = new Date().toLocaleDateString("sv-SE"); // "YYYY-MM-DD"

  const startEl = document.getElementById("work_period_start");
  const endEl = document.getElementById("work_period_end");
  const singleEl = document.getElementById("work_period_single");

  if (startEl) startEl.value = todayStr; // 週報・月報の開始日: 当日
  if (endEl) endEl.value = ""; // 終了日は空（任意入力）
  if (singleEl) singleEl.value = todayStr; // 日報の作業年月日: 当日

  // 💡 開始日(当日)に合わせて終了日の最小選択日(min)をセット！
  updateEndDateMinLimit();

  if (document.getElementById("work_content_free")) document.getElementById("work_content_free").value = "";

  const defaultType = "日報";
  const reportTypeSelect = document.getElementById("report_type");
  if (reportTypeSelect) reportTypeSelect.value = defaultType;

  // Step5: 報告者（ログインユーザー自身）の氏名反映処理
  const reporterNameDiv = document.getElementById("reporter_name");
  if (reporterNameDiv) {
    const cachedName = localStorage.getItem("cached_user_name") || "ログインユーザー";
    const localFullName = `${loginUser.last_name || ""} ${loginUser.first_name || ""}`.trim();
    const finalName = localFullName || cachedName;

    if (reporterNameDiv.tagName === "INPUT" || reporterNameDiv.tagName === "TEXTAREA") {
      reporterNameDiv.value = finalName;
      reporterNameDiv.setAttribute("readonly", true);
    } else {
      reporterNameDiv.innerText = finalName;
    }
  }

  // Step6: 共有先データの初期化とモーダルのフェードイン表示
  const reportForm = document.getElementById("form_report_entry");
  if (reportForm) {
    reportForm.style.opacity = "0";
  }

  syncReportTypeUI(null);
  setupSharedWithList([], true);

  const reportModal = getModalInstance();
  if (reportModal) {
    reportModal.show();
  }

  setTimeout(() => {
    if (reportForm) {
      reportForm.style.opacity = "1";
    }
  }, 50);
}

/**
 * ◆ モーダル表示・データ充填処理（編集・閲覧モード兼用）
 * 【目的】指定されたレポートデータに基づき、作成者のプロファイル補完、編集・閲覧権限の判定、UI各部の値のセット、およびボタン表示切替を一元制御する
 * @param {Object} rawReportData - データベースから取得したレポートデータオブジェクト
 */
async function openEditReportModal(rawReportData) {
  if (!rawReportData || !rawReportData.id) {
    console.error("【編集モーダル】引き渡されたレポートデータが不正です。");
    return;
  }

  let reportData = rawReportData;

  // Step1: ユーザーマスタ（作成者情報）が不足している場合の個別補完処理
  if (!reportData.user_master || (Array.isArray(reportData.user_master) && reportData.user_master.length > 0)) {
    console.log(`【編集モーダル】ユーザーマスタ直接補完を開始します。作成者ID: ${reportData.user_id}`);
    try {
      // user_master テーブルから直接 user_id に一致するレコードを取得（結合を使わないので100%安全）
      const { data: userData, error: userError } = await supabase.from("user_master").select("*").eq("id", reportData.user_id).maybeSingle(); // 単一オブジェクトとして取得

      if (userError) throw userError;

      if (userData) {
        reportData.user_master = userData; // 配列ではなく正しいオブジェクトをセット
      }
    } catch (err) {
      console.error("【編集モーダル】作成者情報の再取得に失敗しました:", err.message);
    }
  }

  currentReportId = reportData.id;
  currentEditReportData = reportData;

  // Step2: 閲覧者本人がレポート作成者（自分）であるかどうかの権限判定
  const isMyReport = loginUser && loginUser.id && String(reportData.user_id) === String(loginUser.id);
  console.log(`【モーダル判定】自分のレポートですか？: ${isMyReport}`);

  // Step3: 階層構造を考慮した作成者フルネームの抽出と特定
  const reportUser = reportData.user_master;

  if (isMyReport) {
    currentReportAuthorName = (loginUser.user_name || `${loginUser.last_name || ""} ${loginUser.first_name || ""}`).trim();
    if (!currentReportAuthorName) {
      currentReportAuthorName = "山田 太郎";
    }
  } else if (reportUser) {
    if (reportUser.user_name) {
      currentReportAuthorName = reportUser.user_name.trim();
    } else {
      const lastName = (reportUser.last_name || "").trim();
      const firstName = (reportUser.first_name || "").trim();
      currentReportAuthorName = `${lastName} ${firstName}`.trim() || "他ユーザー";
    }
  } else {
    currentReportAuthorName = "他ユーザー";
  }

  console.log(`【編集モーダル】オブジェクトから特定した作成者名: "${currentReportAuthorName}"`);

  // Step4: 自分以外のレポートだった場合は全入力をロック（閲覧専用）＆プレースホルダー非表示化
  const form = document.getElementById("form_report_entry");
  if (form) {
    Array.from(form.elements).forEach((el) => {
      el.disabled = !isMyReport;

      // 💡 閲覧モード（自分以外のレポート）の時はプレースホルダーを非表示にする
      if (!isMyReport) {
        if (el.hasAttribute("placeholder") && el.getAttribute("placeholder") !== "") {
          // 元のプレースホルダーを一時保存して削除
          el.setAttribute("data-original-placeholder", el.getAttribute("placeholder"));
          el.removeAttribute("placeholder");
        }
      } else {
        // 編集モード（自分のレポート）の時は元のプレースホルダーを復元
        if (el.hasAttribute("data-original-placeholder")) {
          el.setAttribute("placeholder", el.getAttribute("data-original-placeholder"));
        }
      }
    });
  }

  // Step5: 権限および下書き・アクティブ状態に応じたボタン（削除・一時保存・送信・更新）の表示制御
  const draftBtn = document.getElementById("draft_button");
  const submitBtn = document.getElementById("submit_button");
  const modalDeleteBtn = document.getElementById("modal_delete_button");

  if (!isMyReport) {
    // 他人のレポート：ボタン類は一切非表示
    if (draftBtn) {
      draftBtn.classList.add("d-none");
      draftBtn.style.setProperty("display", "none", "important");
    }
    if (submitBtn) {
      submitBtn.classList.add("d-none");
      submitBtn.style.setProperty("display", "none", "important");
    }
    if (modalDeleteBtn) {
      modalDeleteBtn.classList.add("d-none");
      modalDeleteBtn.style.setProperty("display", "none", "important");
    }
  } else {
    // 自分のレポート
    if (modalDeleteBtn) {
      modalDeleteBtn.classList.remove("d-none");
      modalDeleteBtn.style.removeProperty("display");
    }

    if (draftBtn) {
      // 既に提出済（published）の場合は「一時保存（下書き）」ボタンを非表示、下書き（draft）状態なら表示
      if (reportData.status === "published") {
        draftBtn.classList.add("d-none");
        draftBtn.style.setProperty("display", "none", "important");
      } else {
        draftBtn.classList.remove("d-none");
        draftBtn.style.removeProperty("display");
      }
    }

    if (submitBtn) {
      submitBtn.classList.remove("d-none");
      submitBtn.style.removeProperty("display");

      // 状態が「下書き」なら新規登録時と同様に「送信」ボタンにし、提出済なら「更新」ボタンにする
      if (reportData.status === "draft") {
        submitBtn.innerHTML = `<i class="bi bi-send me-1"></i>送信`;
      } else {
        submitBtn.innerHTML = `<i class="bi bi-arrow-repeat me-1"></i>更新`;
      }
    }
  }

  // Step6: フォームバリデーション履歴のクリアと変更フラグ類のリセット
  if (form) {
    form.reset();
    form.classList.remove("was-validated");
  }

  if (typeof isFormChanged !== "undefined") isFormChanged = false;
  if (typeof isDirty !== "undefined") isDirty = false;
  if (typeof hasChanges !== "undefined") hasChanges = false;

  // Step7: データベース値から基本テキスト入力フィールド群へのマッピング
  if (document.getElementById("report_type")) {
    document.getElementById("report_type").value = reportData.report_type;
  }

  const subjectInput = document.getElementById("subject_title");
  if (subjectInput) {
    subjectInput.value = reportData.subject_title || "";
  }

  if (document.getElementById("work_location")) {
    document.getElementById("work_location").value = reportData.work_location || "";
  }
  if (document.getElementById("customer_name")) {
    document.getElementById("customer_name").value = reportData.customer_name || "";
  }
  if (document.getElementById("companion_name")) {
    document.getElementById("companion_name").value = reportData.companion_name || "";
  }
  if (document.getElementById("instructor_name")) {
    document.getElementById("instructor_name").value = reportData.instructor_name || "";
  }

  // Step8: 報告種別ごとの日付・期間値の配分マッピング
  if (reportData.report_type === "日報") {
    if (document.getElementById("work_period_single")) {
      document.getElementById("work_period_single").value = reportData.work_period_start;
    }
  } else {
    if (document.getElementById("work_period_start")) {
      document.getElementById("work_period_start").value = reportData.work_period_start;
    }
    if (document.getElementById("work_period_end")) {
      document.getElementById("work_period_end").value = reportData.work_period_end;
    }
  }

  // 💡 DBから充填された開始日に合わせて終了日の最小選択日(min)をセット！
  updateEndDateMinLimit();

  // Step9: 週報（JSON構造）または他形式の業務内容データ展開マッピング
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
      if (document.getElementById("work_content_free")) {
        document.getElementById("work_content_free").value = reportData.work_content;
      }
    }
  }

  if (reportData.report_type !== "週報" && document.getElementById("work_content_free")) {
    document.getElementById("work_content_free").value = reportData.work_content || "";
  }

  // 残る所感・TODO等のフリーテキストエリア群へのマッピング
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
    if (document.getElementById(field)) {
      document.getElementById(field).value = reportData[field] || "";
    }
  });

  // Step10: 報告者名表示欄およびタイトル表示文言の確定
  const reporterEl = document.getElementById("reporter_name");
  if (reporterEl) {
    if (reporterEl.tagName === "INPUT" || reporterEl.tagName === "TEXTAREA") {
      reporterEl.value = currentReportAuthorName;
    } else {
      reporterEl.textContent = currentReportAuthorName;
    }
  }

  const reportTypeSelect = document.getElementById("report_type");
  const currentType = reportTypeSelect ? reportTypeSelect.value : reportData.report_type || "日報";
  const generatedTitle = `${currentType}：${currentReportAuthorName}`;

  const titleEl = document.getElementById("modal_report_dynamic_title");
  if (titleEl) {
    titleEl.textContent = generatedTitle;
  }

  // 編集/閲覧の権限モードに応じてヘッダータイトル表示を書き替え
  const modalMainTitleEl =
    document.getElementById("reportModalLabel") || document.getElementById("modal_report_title") || document.querySelector(".modal-title");
  if (modalMainTitleEl) {
    if (isMyReport) {
      modalMainTitleEl.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>レポート編集`;
    } else {
      modalMainTitleEl.innerHTML = `<i class="bi bi-file-earmark-text me-2"></i>レポート閲覧`;
    }
  }

  // Step11: データベースからの閲覧共有設定マスタ値の復元とチェックリスト描画
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
    setupSharedWithList(savedCompanyIds, isMyReport);

    const reportModal = getModalInstance();
    if (reportModal) reportModal.show();
  }
}

// ◆ グローバルメニュー内常駐UIイベント設定処理
//  【目的】画面上に永続的に存在する新規作成ボタン、およびレポート選択に応じた編集ボタンのアクションイベント・不活性表示を安全にバインド・更新する
function initReportMenuEvents() {
  const newBtn = document.getElementById("report_new_button");
  const editBtn = document.getElementById("report_edit_button");

  // Step1: 新規作成ボタンへのクローン置換方式による安全なイベント多重登録回避
  if (newBtn) {
    newBtn.replaceWith(newBtn.cloneNode(true));
    const cleanNewBtn = document.getElementById("report_new_button");

    cleanNewBtn.addEventListener("click", () => {
      console.log("新規作成ボタンがクリックされました。モーダルを開きます。");
      openNewReportModal();
    });
  }

  // Step2: レポート選択状態有無に応じた編集ボタンの有効化判定とイベント登録
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
 * ◆ レポート登録・更新処理（Supabase Upsert処理）
 * 【目的】入力チェックを行い、日報・週報・月報形式に適したパラメータ・JSON文字列データを整形してデータベースへ安全に送信（作成または更新）する
 * @param {string} status - 登録状態（'published' = 正式提出 / 'draft' = 下書き）
 */
async function saveReport(status) {
  // ★保存ボタンの要素を確実なID指定を含めて取得
  const saveButtons = document.querySelectorAll("#submit_button, #draft_button, #form_report_entry button[type='submit'], .btn-save-report");

  // すでに処理中の場合は即時中断（二重実行ガード）
  if (window.isReportSaving) {
    console.warn("【モーダル保存】現在保存処理中のため、重複実行をガードしました。");
    return;
  }

  // ボタンを活性/非活性にするヘルパー
  const toggleSaveButtons = (isDisabled) => {
    window.isReportSaving = isDisabled;
    saveButtons.forEach((btn) => {
      btn.disabled = isDisabled;
      if (isDisabled) {
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>保存中...`;
      } else {
        if (btn.dataset.originalHtml) {
          btn.innerHTML = btn.dataset.originalHtml;
        }
      }
    });
  };

  // 1. まずボタンを速攻で非活性化＆ローディング表示化
  toggleSaveButtons(true);

  try {
    const form = document.getElementById("form_report_entry");

    if (form) {
      form.classList.remove("was-validated");
    }

    const reportTypeSelect = document.getElementById("report_type");
    if (!reportTypeSelect) {
      toggleSaveButtons(false);
      return;
    }
    const reportType = reportTypeSelect.value;

    // Step1: バリデーション評価
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

        // ボタンの状態を戻してから終了する
        toggleSaveButtons(false);
        return;
      }
    }

    // Step2: 日報（単一指定）と週報・月報（開始・終了期間）の日付範囲フォーマット割り当て
    let startDate = document.getElementById("work_period_start") ? document.getElementById("work_period_start").value : null;
    let endDate = document.getElementById("work_period_end") ? document.getElementById("work_period_end").value : null;

    if (reportType === "日報") {
      const singleDate = document.getElementById("work_period_single") ? document.getElementById("work_period_single").value : null;
      startDate = singleDate;
      endDate = singleDate;
    }

    startDate = startDate === "" ? null : startDate;
    endDate = endDate === "" ? null : endDate;

    // Step3: 週報（曜日配列オブジェクト）と他形式（フリーテキスト）の業務内容文字列生成
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

    // Step4: データベース用更新カラムデータのマッピングと論理ステータスの統合
    const updateData = {
      user_id:
        currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData
          ? currentDisplayReportData.user_id
          : loginUser.id,
      report_date: startDate || new Date().toISOString().split("T")[0],
      report_type: reportType,
      work_period_start: startDate,
      work_period_end: endDate,
      company_id:
        currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData
          ? currentDisplayReportData.company_id
          : loginUser.company_id,
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
      is_active: true,
    };

    let isReportChanged = true;

    // Step5: 既存データおよび共有先チェックボックスとの差異検知（編集時のみ判定）
    if (currentReportId && typeof currentDisplayReportData !== "undefined" && currentDisplayReportData) {
      // 共有先会社のチェック状態の差分チェック
      const currentCheckedBoxes = Array.from(document.querySelectorAll(".shared-company-checkbox:checked"))
        .map((cb) => cb.value)
        .sort();

      let savedCompanyIds = [];
      if (Array.isArray(currentDisplayReportData.report_shares)) {
        const idSet = new Set();
        currentDisplayReportData.report_shares.forEach((s) => {
          if (s && s.user_master && s.user_master.company_id) idSet.add(s.user_master.company_id);
        });
        savedCompanyIds = Array.from(idSet).sort();
      }
      const isSharesChanged = JSON.stringify(currentCheckedBoxes) !== JSON.stringify(savedCompanyIds);

      // 全項目の網羅的チェック
      const isChanged =
        updateData.subject_title !== (currentDisplayReportData.subject_title || "") ||
        updateData.work_content !== (currentDisplayReportData.work_content || "") ||
        updateData.content_impression !== (currentDisplayReportData.content_impression || "") ||
        updateData.customer_name !== (currentDisplayReportData.customer_name || "") ||
        updateData.work_location !== (currentDisplayReportData.work_location || "") ||
        updateData.companion_name !== (currentDisplayReportData.companion_name || "") ||
        updateData.instructor_name !== (currentDisplayReportData.instructor_name || "") ||
        updateData.content_remaining_work !== (currentDisplayReportData.content_remaining_work || "") ||
        updateData.content_near_goal !== (currentDisplayReportData.content_near_goal || "") ||
        updateData.content_issue !== (currentDisplayReportData.content_issue || "") ||
        updateData.content_action_plan !== (currentDisplayReportData.content_action_plan || "") ||
        updateData.next_schedule !== (currentDisplayReportData.next_schedule || "") ||
        updateData.content_notice !== (currentDisplayReportData.content_notice || "") ||
        updateData.work_period_start !== (currentDisplayReportData.work_period_start || "") ||
        updateData.work_period_end !== (currentDisplayReportData.work_period_end || "") ||
        updateData.is_active !== currentDisplayReportData.is_active ||
        isSharesChanged;

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

    // Step6: 編集モードかつ未変更時のみ処理を中断（新規作成時は絶対中断しない）
    if (currentReportId && status === "published" && !isReportChanged) {
      console.log("【モーダル保存】内容に変更がないため、処理を中断します。");
      if (typeof window.showToast === "function") {
        window.showToast("変更はありませんでした。", "info");
      }
      toggleSaveButtons(false);
      return;
    }

    let shouldResetShares = false;

    // Step7: 既存提出済みレポートの更新時における、共有先既読状況リセット可否の確認プロミスフロー
    if (
      currentReportId &&
      status === "published" &&
      typeof currentDisplayReportData !== "undefined" &&
      currentDisplayReportData &&
      currentDisplayReportData.status === "published"
    ) {
      const userChoice = await new Promise((resolve) => {
        const modalEl = document.getElementById("reportUpdateConfirmModal");
        if (!modalEl) return resolve("cancel");

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

        modalEl.addEventListener(
          "show.bs.modal",
          () => {
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

            const reportModal = getModalInstance();
            if (reportModal) {
              reportModal.show();
            }

            resolve("cancel");
          },
          { once: true },
        );
      });

      if (userChoice === "cancel") {
        console.log("【モーダル保存】更新がキャンセルされました。");
        toggleSaveButtons(false);
        return;
      }

      if (userChoice === "reset") {
        shouldResetShares = true;
      }
    }

    let savedReportId = currentReportId;

    // Step8: Supabaseデータベースへのデータ登録・更新（Insert/Update）処理の実行
    let savedReport = null;

    if (currentReportId) {
      const { data, error } = await supabase.from("report_logs").update(updateData).eq("id", currentReportId).select();
      if (error) throw error;
      if (data && data.length > 0) savedReport = data[0];
      console.log("【モーダル保存】レポートを更新しました。");
    } else {
      const { data, error } = await supabase.from("report_logs").insert([updateData]).select();
      if (error) throw error;
      if (data && data.length > 0) {
        savedReport = data[0];
        savedReportId = savedReport.id;
      }
      console.log("【モーダル保存】新規レポートを登録しました。ID:", savedReportId);
    }

    // Step9: 共有先の差分更新（新規・編集問わず常に実行）とリセット処理
    if (savedReportId) {
      // 差分更新（追加分は未読追加、削除分は削除、継続分は既読状態維持）
      await saveReportShares(savedReportId);

      // ユーザーが「既読をリセットする」を選択していた場合のみ一律未読に上書き
      if (currentReportId && shouldResetShares) {
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
      }
    }

    // Step10: 操作内容に応じたトーストメッセージの分岐通知
    if (typeof window.showToast === "function") {
      if (currentReportId && !isReportChanged) {
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

    // Step11: モーダルの非表示化（フォーカスによる画面ジャンプを防ぐ）
    const reportModal = getModalInstance();
    if (reportModal) {
      // フォーカスが強制移動して画面が上に動くのを防ぐため、一旦ActiveElementのフォーカスを外す
      if (document.activeElement) {
        document.activeElement.blur();
      }
      reportModal.hide();
    }

    setTimeout(() => {
      if (!document.querySelector(".modal.show")) {
        document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
        document.body.classList.remove("modal-open");
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      }
    }, 300);

    // Step12: 登録・更新成功後の画面即時反映（画面に応じた完全分岐）
    try {
      const targetDateStr = updateData.report_date || updateData.work_period_start;
      if (!targetDateStr) return;

      const [targetYear, targetMonth] = targetDateStr.split("-").map(Number);
      const targetVal = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

      // 💡 今いる画面の判定（画面特有の要素が存在するかでチェック）
      const isReportPage = !!document.getElementById("report_detail_view") || !!document.getElementById("display_period");
      const isMainPage = !isReportPage && !!document.getElementById("calendar-month-selector");

      // ==========================================
      // A. レポート画面（詳細画面）の場合の処理
      // ==========================================
      if (isReportPage) {
        console.log("📄 【レポート画面】で保存が実行されました。");

        // 画面の年月プルダウン（display_period）を自動で保存した年月に変更
        const reportMonthInput = document.getElementById("display_period");
        if (reportMonthInput) {
          reportMonthInput.value = targetVal;
        }

        // レポート画面専用のリフレッシュ・追尾を実行
        if (typeof window.refreshReportList === "function") {
          await window.refreshReportList(targetYear, targetMonth, savedReportId);
        }
      }

      // ==========================================
      // B. メイン画面（ホーム画面）の場合の処理
      // ==========================================
      else if (isMainPage) {
        console.log(`🏠 【メイン画面】保存対象日付: ${targetYear}年${targetMonth}月 (${targetVal})`);

        const monthInput = document.getElementById("calendar-month-selector");
        let isWithinRange = false;
        let matchedOptionValue = null;

        if (monthInput) {
          const options = Array.from(monthInput.options || []);

          // 💡 プルダウン内に保存した「年・月」が存在するかチェック
          const targetOption = options.find((opt) => {
            const val = opt.value;
            const txt = opt.textContent.trim();
            const isValMatch =
              val === targetVal ||
              val === `${targetYear}-${targetMonth}` ||
              val === `${targetYear}/${String(targetMonth).padStart(2, "0")}` ||
              val === `${targetYear}/${targetMonth}`;
            const isTextMatch =
              txt.includes(`${targetYear}年${targetMonth}月`) || txt.includes(`${targetYear}年${String(targetMonth).padStart(2, "0")}月`);
            return isValMatch || isTextMatch;
          });

          if (targetOption) {
            isWithinRange = true;
            matchedOptionValue = targetOption.value;
          }
        }

        // 💡 範囲内の場合のみメイン画面の更新＆追尾を実行！
        if (isWithinRange) {
          console.log("🚀 【メイン画面】範囲内のため画面更新と追尾を実行します。");

          if (monthInput && matchedOptionValue !== null) {
            monthInput.value = matchedOptionValue;
          }
          if (typeof window.currentCalendarDate !== "undefined") {
            window.currentCalendarDate = new Date(targetYear, targetMonth - 1, 1);
          }

          // 1. カレンダーの更新
          if (typeof renderCalendarInternal === "function") {
            await renderCalendarInternal();
          }

          // 2. 過去レポート一覧の更新
          if (typeof updateMainPageReportList === "function") {
            await updateMainPageReportList(targetYear, targetMonth);
          }
          // 3. 🎯 【統一カラー版】メイン画面の過去レポート一覧（<a>タグ）へスクロール＆選択色ハイライト！
          if (savedReportId) {
            setTimeout(() => {
              const targetItem =
                document.querySelector(`#past_report_list a[data-id="${savedReportId}"]`) || document.querySelector(`[data-id="${savedReportId}"]`);

              if (targetItem) {
                console.log("🎯 【メイン画面追尾成功】対象のレポート行へスクロール＆ハイライト:", targetItem);

                // ① 対象行へスムーズスクロール
                targetItem.scrollIntoView({ behavior: "smooth", block: "center" });

                // 元の背景色を保持
                const originalBg = targetItem.style.background || targetItem.style.backgroundColor;

                // ② 画像と同じ淡いブルーグレー (#f1f5f9) を適用
                targetItem.style.setProperty("transition", "background-color 0.5s ease", "important");
                targetItem.style.setProperty("background-color", "#f1f5f9", "important");

                // ③ 2.5秒後にふわっと元の透明（背景色）に戻す
                setTimeout(() => {
                  if (originalBg) {
                    targetItem.style.setProperty("background-color", originalBg);
                  } else {
                    targetItem.style.removeProperty("background-color");
                  }

                  // アニメーションプロパティのクリア
                  setTimeout(() => {
                    targetItem.style.removeProperty("transition");
                  }, 500);
                }, 2500);
              } else {
                console.warn("⚠️ 【メイン画面追尾失敗】#past_report_list 内に対象IDが見つかりませんでした。ID:", savedReportId);
              }
            }, 200);
          }
        } else {
          console.warn(`🛑 【メイン画面】${targetYear}年${targetMonth}月 は表示範囲外のため更新をスキップしました。`);
        }
      }
      console.log("✨ 【保存完了】一連の処理が正常に完了しました。");
    } catch (err) {
      console.error("【保存完了】画面反映中にエラーが発生しました:", err);
    }
  } catch (err) {
    console.error("【モーダル保存】エラーが発生しました:", err.message);
    if (typeof window.showToast === "function") {
      window.showToast(`保存に失敗しました: ${err.message}`, "error");
    }
  } finally {
    // 処理完了後に必ずボタンを再活性化
    toggleSaveButtons(false);
  }
}
