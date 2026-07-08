/**
 * メイン画面（main.html）専用の初期化関数
 */
async function initializeMainPage() {
  console.log("main.js: メイン画面専用の処理を開始します。");

  const dateDisplay = document.getElementById("current_date_display");
  const timeDisplay = document.getElementById("current_time_display");

  // --- 1. 時計・日付パーツ of 自動起動 ---
  if (dateDisplay && timeDisplay) {
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    const updateClock = () => {
      const now = new Date();
      dateDisplay.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekDays[now.getDay()]})`;
      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");
      const seconds = String(now.getSeconds()).padStart(2, "0");
      timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
    };
    updateClock();
    const clockInterval = setInterval(() => {
      if (!document.getElementById("current_time_display")) {
        clearInterval(clockInterval);
        return;
      }
      updateClock();
    }, 1000);
  }

  // --- 2. 打刻ボタンの連動ロジック ---
  const statusLabel = document.getElementById("current_status_label");
  const clockInBtn = document.getElementById("clock_in_button");
  const clockOutBtn = document.getElementById("clock_out_button");
  const breakToggleBtn = document.getElementById("break_toggle_button");

  if (statusLabel && clockInBtn && clockOutBtn && breakToggleBtn) {
    const logArea = document.getElementById("recent_logs_area");

    // 【司令塔】UI状態を一括管理する関数
    const updateUI = (status) => {
      // どのケースでも共通して、データがあれば出勤ボタンを無効にする処理を入れます
      switch (status) {
        case "未打刻":
          statusLabel.textContent = "未打刻";
          statusLabel.className = "status-badge status-default";
          clockInBtn.disabled = false;
          clockOutBtn.disabled = true;
          breakToggleBtn.disabled = true;
          breakToggleBtn.textContent = "外出開始";
          break;
        case "出勤中":
          statusLabel.textContent = "出勤中";
          statusLabel.className = "status-badge status-working";
          clockInBtn.disabled = true; // ここで無効化
          clockOutBtn.disabled = false;
          breakToggleBtn.disabled = false;
          breakToggleBtn.textContent = "外出開始";
          break;
        case "外出中":
          statusLabel.textContent = "外出中";
          statusLabel.className = "status-badge status-break";
          clockInBtn.disabled = true;
          clockOutBtn.disabled = true;
          breakToggleBtn.disabled = false;
          breakToggleBtn.textContent = "外出終了";
          break;
        case "退勤済":
          statusLabel.textContent = "退勤済";
          statusLabel.className = "status-badge status-returned";
          clockInBtn.disabled = true; // ここで無効化
          clockOutBtn.disabled = true;
          breakToggleBtn.disabled = true;
          break;
      }
    };

    // --- DB同期と状態復元関数 ---
    const restoreStateFromDB = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const today = new Date().toISOString().split("T")[0];
        const { data: record } = await supabase
          .from("attendance_data")
          .select("*")
          .match({ user_id: user.id, work_date: today, is_active: true })
          .maybeSingle();

        const remarksInput = document.getElementById("today_remarks_input");
        const saveRemarksBtn = document.getElementById("btn_save_remarks");

        if (record) {
          // 💡判定ロジック：出勤(clock_in)か退勤(clock_out)が既に登録されているか確認
          const isAlreadyClocked = record.clock_in !== null || record.clock_out !== null;

          if (remarksInput && saveRemarksBtn) {
            remarksInput.value = record.memo || "";
            if (record.memo) {
              remarksInput.disabled = true;
              saveRemarksBtn.textContent = "編集";
              saveRemarksBtn.style.backgroundColor = "#6c757d";
            }
          }

          // ========================================================
          // パターンA：編集モーダルから登録された「出勤中」データの場合
          // ========================================================
          if (record.registration_mode === "modal" && record.status === "working") {
            // 1. ステータスラベルを「出勤中」にする
            statusLabel.textContent = "出勤中";
            statusLabel.className = "status-badge status-working";

            // 2. メイン画面の「打刻ボタン」はすべてロック（通常打刻をさせない）
            clockInBtn.disabled = true;
            clockInBtn.textContent = "打刻済";
            clockOutBtn.disabled = true;
            breakToggleBtn.disabled = true;
            breakToggleBtn.textContent = "外出開始";

            // ※ この時は通常打刻ではないので、カレンダー側の編集モーダルは開ける（前回同様）

            // ========================================================
            // パターンB：通常の打刻（画面の出勤ボタン等）でデータがある場合
            // ========================================================
          } else {
            // 1. 既存のステータスベースでUIを復元
            if (record.status === "finished") updateUI("退勤済");
            else if (record.status === "going_out") updateUI("外出中");
            else if (record.status === "working") updateUI("出勤中");
            else updateUI("未打刻");

            // 2. 通常の出勤打刻があれば「出勤ボタン」をロック
            if (isAlreadyClocked && clockInBtn) {
              clockInBtn.disabled = true;
              clockInBtn.textContent = "打刻済";
            }

            // 3. 【復活】通常打刻データが存在する場合、カレンダー側の編集モーダルを「編集不可」にロック
            // （別ファイルや共通処理が record.registration_mode を参照できるようにDB値を維持、
            //   またはフロント側の判定用に何らかのフラグを立てるか、既存の mode === "clock" 判定に流します）
          }
        } else {
          updateUI("未打刻");
          if (remarksInput && saveRemarksBtn) {
            remarksInput.value = "";
            remarksInput.disabled = false;
            saveRemarksBtn.textContent = "保存";
            saveRemarksBtn.style.backgroundColor = "#8ea3c2";
          }
          const todayKey = `attendance_logs_${today}`;
          localStorage.removeItem(todayKey);
          localStorage.removeItem("attendance_state_data");
          if (logArea) logArea.value = "";
        }
      } catch (e) {
        console.error("DB同期エラー:", e);
      }
    };

    // ①【出勤ボタン】
    clockInBtn.addEventListener("click", async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (window.showToast) {
            window.showToast("ユーザー情報の取得に失敗しました。再ログインしてください。", "error");
          } else {
            alert("ユーザー情報の取得に失敗しました。再ログインしてください。");
          }
          return;
        }

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const todayStr = `${yyyy}-${mm}-${dd}`;
        const nowIso = now.toISOString();

        // 1. 今日（is_active: true）のレコードがすでにあるか確認
        const { data: existingRecord } = await supabase
          .from("attendance_data")
          .select("id")
          .match({ user_id: user.id, work_date: todayStr, is_active: true })
          .maybeSingle();

        if (existingRecord) {
          // 👉 UPDATE
          const { error } = await supabase
            .from("attendance_data")
            .update({
              status: "working",
              clock_in: nowIso,
              original_clock_in: nowIso,
              registration_mode: "button",
              updated_at: getNowISO(),
            })
            .eq("id", existingRecord.id);

          if (error) throw error;
        } else {
          // 👉 INSERT
          const { error } = await supabase.from("attendance_data").insert({
            user_id: user.id,
            work_date: todayStr,
            status: "working",
            clock_in: nowIso,
            original_clock_in: nowIso,
            is_active: true,
            registration_mode: "button",
            updated_at: getNowISO(),
          });

          if (error) throw error;
        }

        await renderCalendarInternal();

        updateUI("出勤中");
        addLogCommon("出勤", "出勤しました。");
        if (window.showToast) window.showToast("出勤打刻を保存しました。", "success");
      } catch (err) {
        console.error("❌ 出勤打刻の保存に失敗しました:", err);
        if (window.showToast) {
          window.showToast("打刻の保存に失敗しました。通信環境を確認し、もう一度お試しください。", "error");
        } else {
          alert("打刻の保存に失敗しました。通信環境を確認し、もう一度お試しください。");
        }
      }
    });

    // ②【退勤ボタン】
    clockOutBtn.addEventListener("click", async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const now = new Date();
        const nowIso = now.toISOString();
        const todayStr = nowIso.split("T")[0];

        // 既存レコードの出勤時刻を取得
        const { data: currentRecord, error: fetchError } = await supabase
          .from("attendance_data")
          .select("clock_in")
          .match({ user_id: user.id, work_date: todayStr, is_active: true })
          .maybeSingle();

        if (fetchError) throw fetchError;

        let autoBreakM = 0;
        if (currentRecord && currentRecord.clock_in) {
          const clockInTime = new Date(currentRecord.clock_in);
          // 拘束時間（分単位）
          const diffMin = Math.floor((now - clockInTime) / (1000 * 60));

          // 法律に準拠した判定
          if (diffMin > 9 * 60) {
            autoBreakM = 60; // 9時間超 ➔ 60分
          } else if (diffMin > 6 * 60 + 45) {
            autoBreakM = 45; // 6時間45分超 〜 9時間以下 ➔ 45分
          }
        }

        const { error } = await supabase
          .from("attendance_data")
          .update({
            clock_out: nowIso,
            original_clock_out: nowIso,
            total_break_m: autoBreakM,
            status: "finished",
            updated_at: getNowISO(),
          })
          .match({ user_id: user.id, work_date: todayStr, is_active: true });

        if (error) throw error;

        await renderCalendarInternal();

        updateUI("退勤済");
        addLogCommon("退勤", "退勤しました。お疲れ様でした！");
        if (window.showToast) window.showToast("退勤打刻を保存しました。お疲れ様でした！", "success");
      } catch (err) {
        console.error("❌ 退勤打刻の保存に失敗しました:", err);
        if (window.showToast) {
          window.showToast("退勤データの保存に失敗しました。もう一度お試しください。", "error");
        } else {
          alert("退勤データの保存に失敗しました。もう一度お試しください。");
        }
      }
    });

    // ③【外出 / 外出終了ボタン】
    breakToggleBtn.addEventListener("click", async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split("T")[0];
        const isCurrentlyBreaking = breakToggleBtn.textContent.trim() === "外出終了";

        let updateData = {};

        if (!isCurrentlyBreaking) {
          // 「外出開始」を押したとき
          updateData = {
            status: "going_out",
            break_start: nowIso,
            updated_at: getNowISO(),
          };
        } else {
          // 「外出終了」を押したとき
          updateData = {
            status: "working",
            break_end: nowIso,
            updated_at: getNowISO(),
          };
        }

        const { error } = await supabase.from("attendance_data").update(updateData).match({ user_id: user.id, work_date: todayStr, is_active: true });

        if (error) throw error;

        // UI状態変更とログ出力
        updateUI(isCurrentlyBreaking ? "出勤中" : "外出中");
        addLogCommon(isCurrentlyBreaking ? "外出終了" : "外出開始", isCurrentlyBreaking ? "外出から戻りました。" : "外出を開始しました。");
        if (window.showToast) {
          window.showToast(isCurrentlyBreaking ? "外出から戻りました。" : "外出を開始しました。", "success");
        }
      } catch (err) {
        console.error("❌ 外出状態の更新に失敗しました:", err);
        if (window.showToast) {
          window.showToast("外出状態の保存に失敗しました。もう一度お試しください。", "error");
        } else {
          alert("外出状態の保存に失敗しました。もう一度お試しください。");
        }
      }
    });

    // 備考保存ボタン
    const remarksInput = document.getElementById("today_remarks_input");
    const saveRemarksBtn = document.getElementById("btn_save_remarks");

    if (remarksInput && saveRemarksBtn) {
      saveRemarksBtn.addEventListener("click", async () => {
        if (saveRemarksBtn.textContent.trim() === "保存") {
          const remarksText = remarksInput.value.trim();

          // 空文字なら処理を即終了する
          if (remarksText === "") {
            console.log("備考が空のため、保存処理をスキップしました。");
            return;
          }

          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
              if (window.showToast) {
                window.showToast("ユーザー情報の取得に失敗しました。再ログインしてください。", "error");
              } else {
                alert("ユーザー情報の取得に失敗しました。再ログインしてください。");
              }
              return;
            }

            const todayStr = new Date().toISOString().split("T")[0];

            // 1. 今日の有効なレコードがすでに存在するかチェック
            const { data: existingRecord } = await supabase
              .from("attendance_data")
              .select("id, memo")
              .match({ user_id: user.id, work_date: todayStr, is_active: true })
              .maybeSingle();

            if (existingRecord) {
              // 👉 UPDATE
              const { error } = await supabase
                .from("attendance_data")
                .update({
                  memo: remarksText,
                  updated_at: getNowISO(),
                })
                .eq("id", existingRecord.id);

              if (error) throw error;
              addLogCommon("備考", "備考を更新しました。");
            } else {
              // 👉 INSERT
              const { error } = await supabase.from("attendance_data").insert({
                user_id: user.id,
                work_date: todayStr,
                status: "not_started",
                memo: remarksText,
                is_active: true,
                registration_mode: "modal", // 💡打刻前なのでモーダル編集を許可するために modal にしておく
                updated_at: getNowISO(),
              });

              if (error) throw error;
              addLogCommon("備考", "備考を新規保存しました。");
            }

            // フロントUIの切り替え
            remarksInput.disabled = true;
            saveRemarksBtn.textContent = "編集";
            saveRemarksBtn.style.backgroundColor = "#6c757d";
            if (window.showToast) window.showToast("備考を保存しました。", "success");
          } catch (err) {
            console.error("❌ 備考の保存に失敗しました:", err);
            if (window.showToast) {
              window.showToast("備考の保存に失敗しました。もう一度お試しください。", "error");
            } else {
              alert("備考の保存に失敗しました。もう一度お試しください。");
            }
          }
        } else {
          remarksInput.disabled = false;
          remarksInput.focus();
          saveRemarksBtn.textContent = "保存";
          saveRemarksBtn.style.backgroundColor = "#8ea3c2";
        }
      });
    }

    // --- ページ読み込み時にLocalStorageから本日のログを復元する ---
    const restoreLogsFromStorage = () => {
      if (!logArea) return;
      const todayKey = `attendance_logs_${new Date().toISOString().split("T")[0]}`;
      const savedLogs = localStorage.getItem(todayKey);
      if (savedLogs) {
        logArea.value = savedLogs;
      }
    };

    // ログの復元を実行
    restoreLogsFromStorage();

    // 最後にDBの状態を読み込んで画面に適用
    await restoreStateFromDB();

    // 📱 【新規追加】スマホ・タブレット表示時はデフォルトでアコーディオンを格納する
    adjustAccordionForMobile();

    // --- 3. 経費専用モーダル（modal-expense-entry.html）の連動ロジック ---
    const expenseTriggerBtn = document.getElementById("btn_open_expense_modal");

    if (expenseTriggerBtn) {
      let currentAttendanceId = null;
      let hasExistingExpenses = false;

      // 経費入力行の動的HTML生成と追加処理
      const addExpenseRow = (data = { id: null, category: "transportation", detail: "", amount: "" }) => {
        const expenseList = document.getElementById("expense_entry_list");
        if (!expenseList) return;

        const generateFallbackUUID = () => {
          return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        };

        const expenseId = data.id || generateFallbackUUID();
        const rowId = "expense_row_" + Date.now() + Math.random().toString(36).substring(2, 7);
        const div = document.createElement("div");

        div.className = "d-flex flex-column p-2 rounded-2 shadow-sm expense-notebook-row position-relative mb-2";
        div.id = rowId;
        div.setAttribute("data-db-id", expenseId);

        const currentCategory = data.category || "transportation";
        const isTransport = currentCategory === "transportation" || currentCategory === "交通費" ? "selected" : "";
        const isOther = currentCategory === "other" || currentCategory === "その他" ? "selected" : "";

        div.innerHTML = `
          <div class="d-flex align-items-center justify-content-start gap-3 w-100 m-0 p-0">
            <select class="form-select form-select-sm expense-notebook-select expense-category" 
                    style="width: 120px !important; height: 32px !important; background-color: #ffffff !important; color: #2b2c3a !important; font-size: 0.875rem !important; font-weight: 500 !important; border: 1px solid #ced4da !important; display: inline-block !important;">
              <option value="transportation" ${isTransport}>交通費</option>
              <option value="other" ${isOther}>その他</option>
            </select>

            <div class="d-flex align-items-center bg-transparent border-bottom expense-notebook-amount-wrap ms-auto">
              <input type="number" class="form-control form-control-sm border-0 p-0 text-end bg-transparent fw-bold expense-notebook-amount-field expense-amount" 
                     placeholder="0" min="0" value="${data.amount ?? ""}">
              <span class="text-muted ms-1 text-yen">円</span>
            </div>
            
            <button type="button" class="btn btn-sm text-secondary border-0 p-0 rounded-circle btn-delete-expense d-flex align-items-center justify-content-center expense-notebook-delete-btn" title="削除">
              <i class="bi bi-x-circle-fill"></i>
            </button>
          </div>
          
          <div class="w-100 m-0 pt-1">
            <input type="text" class="form-control form-control-sm border-0 border-bottom bg-transparent expense-notebook-input expense-memo w-100" 
                   placeholder="摘要・ルートなど" value="${data.detail || ""}">
          </div>
        `;

        const selectEl = div.querySelector(".expense-notebook-select");
        if (selectEl) {
          selectEl.style.setProperty("line-height", "normal", "important");
          selectEl.style.setProperty("padding", "0px 24px 0px 8px", "important");
        }

        div.querySelector(".expense-notebook-amount-field").addEventListener("input", calculateTotalExpense);

        div.querySelector(".btn-delete-expense").addEventListener("click", () => {
          div.remove();
          calculateTotalExpense();
          if (window.showToast) {
            window.showToast("明細を行から削除しました（保存するまで確定されません）。", "success");
          }
        });

        expenseList.appendChild(div);
        calculateTotalExpense();
      };

      const calculateTotalExpense = () => {
        const amounts = document.querySelectorAll("#expense_entry_list .expense-notebook-amount-field");
        let total = 0;

        amounts.forEach((input) => {
          const val = parseInt(input.value, 10);
          if (!isNaN(val) && val > 0) {
            total += val;
          }
        });

        const totalDisplay = document.getElementById("expense_entry_total_display");
        if (totalDisplay) {
          totalDisplay.textContent = total.toLocaleString();
        }
      };

      // 「経費登録」メインボタンを押した時のイベント
      expenseTriggerBtn.addEventListener("click", async () => {
        const targetId = expenseTriggerBtn.getAttribute("data-bs-target");
        const modalElement = document.querySelector(targetId);

        const expenseContainer = document.getElementById("expense_entry_list");
        const totalDisplay = document.getElementById("expense_entry_total_display");
        const expenseForm = document.getElementById("expense_entry_form");
        const addRowBtn = document.getElementById("btn_add_expense_entry_row");
        const clearAllBtn = document.getElementById("btn_clear_all_expenses");

        if (!modalElement || !expenseContainer || !totalDisplay || !expenseForm || !addRowBtn) {
          console.error(`❌ ${targetId} のHTML要素が画面上に見つかりません。`);
          return;
        }

        const mainDateDisplay = document.getElementById("current_date_display");
        const modalDateCapsule = document.getElementById("expense_modal_date_display");

        if (mainDateDisplay && modalDateCapsule) {
          modalDateCapsule.textContent = mainDateDisplay.textContent;
        }

        expenseContainer.innerHTML = "";
        totalDisplay.textContent = "0";
        currentAttendanceId = null;
        hasExistingExpenses = false;

        try {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

          if (user) {
            const { data: existingRecords, error: fetchError } = await supabase
              .from("expense_records")
              .select("*")
              .match({ user_id: user.id, expense_date: todayStr, is_active: true });

            if (fetchError) throw fetchError;

            if (existingRecords && existingRecords.length > 0) {
              currentAttendanceId = existingRecords[0].attendance_id;
              hasExistingExpenses = true;

              existingRecords.forEach((rec) => {
                addExpenseRow({
                  id: rec.id,
                  category: rec.expense_type,
                  detail: rec.memo,
                  amount: rec.amount,
                });
              });
            } else {
              // 過去経費データがない場合
              const { data: attRecord } = await supabase
                .from("attendance_data")
                .select("id")
                .match({ user_id: user.id, work_date: todayStr, is_active: true })
                .maybeSingle();

              if (attRecord) {
                currentAttendanceId = attRecord.id;
              } else {
                const { data: newAtt, error: attError } = await supabase
                  .from("attendance_data")
                  .insert({
                    user_id: user.id,
                    work_date: todayStr,
                    status: "not_started",
                    work_type: "normal",
                    is_active: true,
                    total_break_m: 0,
                  })
                  .select("id")
                  .single();

                if (!attError && newAtt) {
                  currentAttendanceId = newAtt.id;
                }
              }

              addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
            }
          }
        } catch (err) {
          console.error("❌ 既存経費の読み込みに失敗しました:", err);
          addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
        }

        addRowBtn.onclick = (e) => {
          e.preventDefault();
          addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
          const rows = expenseContainer.querySelectorAll(".expense-notebook-row");
          if (rows.length > 0) {
            rows[rows.length - 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        };

        if (clearAllBtn) {
          clearAllBtn.onclick = (e) => {
            e.preventDefault();
            expenseContainer.innerHTML = "";
            calculateTotalExpense();
            if (window.showToast) {
              window.showToast("すべての明細をクリアしました（保存するまで確定されません）。", "success");
            }
          };
        }

        // フォーム送信（登録するボタンを押した時のDB保存処理）
        expenseForm.onsubmit = async (e) => {
          e.preventDefault();

          const expenseItems = [];
          expenseContainer.querySelectorAll(".expense-notebook-row").forEach((row) => {
            const category = row.querySelector(".expense-category").value;
            const amount = parseInt(row.querySelector(".expense-amount").value, 10) || 0;
            const memo = row.querySelector(".expense-memo").value.trim();

            if (amount > 0) {
              expenseItems.push({ category, amount, memo });
            }
          });

          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
              if (window.showToast) window.showToast("ユーザー情報の取得に失敗しました。", "error");
              return;
            }

            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

            // 1. 今日のデータを一旦すべて論理削除（is_active: false）
            const { error: updateError } = await supabase
              .from("expense_records")
              .update({ is_active: false })
              .match({ user_id: user.id, expense_date: todayStr });

            if (updateError) throw updateError;

            // 2. 新しい明細があればインサート
            if (expenseItems.length > 0) {
              if (!currentAttendanceId) {
                const { data: newAtt, error: attError } = await supabase
                  .from("attendance_data")
                  .insert({
                    user_id: user.id,
                    work_date: todayStr,
                    status: "not_started",
                    work_type: "normal",
                    is_active: true,
                    total_break_m: 0,
                    updated_at: getNowISO(),
                  })
                  .select("id")
                  .single();

                if (attError) throw attError;
                currentAttendanceId = newAtt.id;
              }

              const insertData = expenseItems.map((item) => ({
                attendance_id: currentAttendanceId,
                user_id: user.id,
                expense_date: todayStr,
                expense_type: item.category,
                memo: item.memo,
                amount: item.amount,
                is_active: true,
                updated_at: getNowISO(),
              }));

              const { error: insertError } = await supabase.from("expense_records").insert(insertData);
              if (insertError) throw insertError;

              if (typeof addLogCommon === "function") {
                addLogCommon("経費", `合計 ${totalDisplay.textContent} 円の経費を保存しました。`);
              }
              if (window.showToast) window.showToast("経費データを保存しました！", "success");
            } else {
              if (hasExistingExpenses) {
                if (typeof addLogCommon === "function") {
                  addLogCommon("経費", "本日の経費明細をすべて削除しました。");
                }
                if (window.showToast) window.showToast("経費データをすべて削除しました。", "success");
              }
            }

            // 💡【追加】経費の保存（または一括削除）が成功したので、メインカレンダーをその場で即時更新する
            await renderCalendarInternal();

            // モーダルを閉じる既存処理
            const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
            modalInstance.hide();
          } catch (err) {
            console.error("❌ 経費の保存に失敗しました:", err);
            if (window.showToast) window.showToast(`エラー: ${err.message}`, "error");
          }
        };

        const modalInstance = bootstrap.Modal.getOrCreateInstance(modalElement);
        modalInstance.show();
      });
    }
  }
}

/**
 * 📱 スマホ時はデフォルトでアコーディオンを閉じる補助関数
 */
function adjustAccordionForMobile() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    const accordionContent = document.querySelector(".card-body-content") || document.querySelector(".collapse");
    const toggleButton = document.querySelector(".card-header-toggle") || document.querySelector("[data-bs-toggle='collapse']");

    if (accordionContent) {
      // Bootstrap標準の開閉クラス（show）を落とす、またはstyleで隠す
      accordionContent.classList.remove("show");
      if (accordionContent.style.display !== "block") {
        accordionContent.style.display = "none";
      }
    }
    if (toggleButton) {
      toggleButton.classList.add("collapsed");
    }
  }
}

// グローバル変数で現在表示中の年月を管理（初期値は今日）
let currentCalendarDate = new Date();

/**
 * 年月プルダウン（セレクトボックス）の選択肢を初期化する
 */
function initCalendarSelector() {
  const selector = document.getElementById("calendar-month-selector");
  if (!selector) return;

  selector.innerHTML = ""; // クリア
  const now = new Date();

  for (let i = -3; i <= 3; i++) {
    const optDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = optDate.getFullYear();
    const month = optDate.getMonth();

    const option = document.createElement("option");
    option.value = `${year}-${month}`;
    option.textContent = `${year}年${month + 1}月`;

    if (i === 0) {
      option.selected = true;
    }
    selector.appendChild(option);
  }

  selector.onchange = async (e) => {
    const [year, month] = e.target.value.split("-").map(Number);
    currentCalendarDate = new Date(year, month, 1);
    await renderCalendarInternal();
  };
}

/**
 * ◆ 外部APIから祝日データを取得し、holiday_masterへUpsert同期
 */
async function syncHolidaysFromExternalAPI(year) {
  try {
    const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
    if (!response.ok) throw new Error("外部祝日APIの取得に失敗しました");
    const holidayData = await response.json();
    const nowIso = new Date().toISOString();

    const upsertRows = Object.entries(holidayData).map(([dateStr, name]) => ({
      holiday_date: dateStr,
      name: name,
      updated_at: nowIso,
    }));

    if (upsertRows.length === 0) return;

    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    const { error } = await supabaseClient.from("holiday_master").upsert(upsertRows, { onConflict: "holiday_date" });
    if (error) throw error;
    console.log(`✨ ${year}年の祝日データを外部APIからDBへ同期しました`);
  } catch (err) {
    console.error("❌ 祝日の自動同期に失敗しました:", err);
  }
}

/**
 * 指定された年月のカレンダーを生成して画面に表示する
 */
async function renderCalendarInternal() {
  const calendarDays = document.getElementById("calendar-days");
  if (!calendarDays) return;

  calendarDays.innerHTML = ""; // 最初に完全クリア

  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;

  let holidays = {};
  const attendanceMap = new Map();

  try {
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient) {
      const {
        data: { user: currentUser },
      } = await supabaseClient.auth.getUser();
      if (!currentUser) throw new Error("ログインユーザーが取得できません");

      let [holidaysResult, attendanceResult] = await Promise.all([
        supabaseClient.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr),
        supabaseClient
          .from("attendance_data")
          .select("work_date, clock_in, clock_out, work_type")
          .eq("user_id", currentUser.id)
          .eq("is_active", true)
          .gte("work_date", startStr)
          .lte("work_date", endStr),
      ]);

      const currentYear = new Date().getFullYear();
      if (year >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        await syncHolidaysFromExternalAPI(year);
        const { data: reFetchResult } = await supabaseClient
          .from("holiday_master")
          .select("holiday_date, name")
          .gte("holiday_date", startStr)
          .lte("holiday_date", endStr);
        if (reFetchResult) holidaysResult.data = reFetchResult;
      }

      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }

      if (attendanceResult.data) {
        attendanceResult.data.forEach((record) => {
          const dayNum = new Date(record.work_date).getDate();
          attendanceMap.set(dayNum, record);
        });
      }
    }
  } catch (err) {
    console.error("メインカレンダー: データのロードに失敗しました:", err);
  }

  // 📐 前月の日付を計算する下準備
  const prevLastDate = new Date(year, month, 0).getDate();

  /**
   * マスを生成して共通の曜日・祝日クラスを付与する共通関数
   */
  function createDayCell(dayNum, isOtherMonth = false, otherMonthOffset = 0) {
    const div = document.createElement("div");
    
    // レポート画面用の基本クラス「report-cal-day」をメイン画面側にも付与
    div.className = "report-cal-day";
    
    // 内部の文字要素クラスも「day-num」に統一
    div.innerHTML = `
      <div class="calendar-day-header w-100 h-100">
        <span class="day-num">${dayNum}</span>
        <div class="calendar-day-badge-area"></div>
        <div class="calendar-icons-area"></div>
      </div>
    `;

    const checkDate = new Date(year, month + otherMonthOffset, dayNum);
    const dayOfWeek = checkDate.getDay();

    if (isOtherMonth) {
      // レポート画面の先月・来月クラス「other-month」に統一
      div.classList.add("other-month");
    } else {
      const holidayName = holidays[dayNum];
      if (holidayName) {
        div.classList.add("is-holiday");
        div.title = holidayName;
      } else if (dayOfWeek === 0) {
        div.classList.add("is-sunday");
      } else if (dayOfWeek === 6) {
        div.classList.add("is-sat");
      }

      if (dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
        div.classList.add("today"); // 💡 「is-today」から「today」に統一
      }
    }
    return div;
  }

  // ①【前月の余白を埋める】
  for (let i = firstDay - 1; i >= 0; i--) {
    const prevDayNum = prevLastDate - i;
    const div = createDayCell(prevDayNum, true, -1);
    calendarDays.appendChild(div);
  }

  // ②【当月の日付を描画】
  for (let d = 1; d <= lastDate; d++) {
    const div = createDayCell(d, false, 0);
    calendarDays.appendChild(div);

    const attendanceRecord = attendanceMap.get(d);
    if (attendanceRecord) {
      if (attendanceRecord.work_type === "paid") {
        const badgeArea = div.querySelector(".calendar-day-badge-area");
        const label = document.createElement("span");
        label.className = "cal-status-text label-paid";
        label.textContent = "有給";
        badgeArea.appendChild(label);
      } else if (attendanceRecord.work_type === "absent") {
        const badgeArea = div.querySelector(".calendar-day-badge-area");
        const label = document.createElement("span");
        label.className = "cal-status-text label-absent";
        label.textContent = "欠勤";
        badgeArea.appendChild(label);
      } else {
        const iconsArea = div.querySelector(".calendar-icons-area");
        const iconEl = document.createElement("i");
        if (!attendanceRecord.clock_out) {
          iconEl.className = "bi bi-box-arrow-in-right cal-icon-working"; // 出勤中アイコン
          iconEl.title = "出勤中";
        } else {
          iconEl.className = "bi bi-check-circle-fill cal-icon-done"; // 退勤済アイコン
          iconEl.title = "退勤済";
        }
        iconsArea.appendChild(iconEl);
      }
    }
  }

  // ③【翌月の余白を埋める】（土曜日で終わるよう動的計算）
  const currentSlots = calendarDays.children.length;
  const remainder = currentSlots % 7;
  const nextMonthNeedSlots = remainder === 0 ? 0 : 7 - remainder;

  for (let n = 1; n <= nextMonthNeedSlots; n++) {
    const div = createDayCell(n, true, 1);
    calendarDays.appendChild(div);
  }
}

// ==========================================
// 共通基盤（SPA）用に公開
// ==========================================
window.renderCalendar = async () => {
  initCalendarSelector();
  await renderCalendarInternal();
};
