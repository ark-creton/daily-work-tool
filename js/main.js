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

    // 💡 プルダウンが切り替わった時にカレンダーをリアルタイムで再描画する処理
    const targetUserSelect = document.getElementById("target_user_id");
    if (targetUserSelect) {
      targetUserSelect.addEventListener("change", async () => {
        console.log("プルダウンが変更されました。カレンダーを再描画します:", targetUserSelect.value);
        await renderCalendarInternal();
      });
    }

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

// =========================================================================
// グローバル変数・多重実行ガード
// =========================================================================
let isCalendarRendering = false;
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
 * 指定された年月のカレンダーを生成して画面に表示する（400エラー完全ガード版）
 */
async function renderCalendarInternal() {
  const calendarDays = document.getElementById("calendar-days");
  if (!calendarDays) return;

  if (isCalendarRendering) return;
  isCalendarRendering = true;

  calendarDays.innerHTML = "";

  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;

  let holidays = {};
  const attendanceMap = new Map();
  const myReportMap = new Map();
  const otherUserReportMap = new Map();
  const unreadDotsMap = new Map();

  // 💡 フィルター値の安全取得
  let filterUserVal = document.getElementById("target_user_id")?.value || "all";
  filterUserVal = filterUserVal.trim();

  if (filterUserVal === "" || filterUserVal === "全てのレポート" || filterUserVal === "すべて") {
    filterUserVal = "all";
  } else if (filterUserVal === "自分のレポート" || filterUserVal === "自分") {
    filterUserVal = "mine";
  }

  const isLookingAtMe = filterUserVal === "all" || filterUserVal === "mine";

  try {
    const supabaseClient = window.supabase || supabase;
    if (supabaseClient) {
      // 💡 確実にログインユーザーのセッションを担保（eq.null 防止ガード）
      const {
        data: { user: currentUser },
      } = await supabaseClient.auth.getUser();
      if (!currentUser) {
        isCalendarRendering = false;
        return;
      }

      // 1. レポートクエリの構築
      let reportQuery = supabaseClient
        .from("report_logs")
        .select(
          `
          id, report_date, user_id, is_active, report_type, status,
          user_master ( id, last_name, first_name ),
          report_shares ( report_id, user_id, is_read )
        `,
        )
        .gte("report_date", startStr)
        .lte("report_date", endStr);

      if (filterUserVal === "mine") {
        reportQuery = reportQuery.eq("user_id", currentUser.id);
      } else if (filterUserVal !== "all") {
        reportQuery = reportQuery.eq("user_id", filterUserVal);
      }

      // 2. 並行データ取得
      let [reportsResult, holidaysResult, attendanceResult] = await Promise.all([
        reportQuery,
        supabaseClient.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr),
        supabaseClient
          .from("attendance_data")
          .select("work_date, clock_in, clock_out, work_type")
          .eq("user_id", currentUser.id)
          .eq("is_active", true)
          .gte("work_date", startStr)
          .lte("work_date", endStr),
      ]);

      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }

      if (attendanceResult.data && isLookingAtMe) {
        attendanceResult.data.forEach((record) => {
          const dayNum = new Date(record.work_date).getDate();
          attendanceMap.set(dayNum, record);
        });
      }

      // 3. データの仕分け
      if (reportsResult.data) {
        reportsResult.data.forEach((r) => {
          if (r.is_active === false) return;

          const isMyReport = String(r.user_id) === String(currentUser.id);
          const dayNum = parseInt(r.report_date.split("-")[2], 10);

          // 既読・未読判定 (定義書の user_id カラムに準拠)
          let isRead = false;
          const shares = Array.isArray(r.report_shares) ? r.report_shares : r.report_shares ? [r.report_shares] : [];
          if (isMyReport) {
            isRead = true;
          } else {
            const myShare = shares.find((s) => s && String(s.user_id) === String(currentUser.id));
            isRead = myShare ? myShare.is_read : false;
          }

          if (filterUserVal === "all" && !isMyReport) {
            const isSharedToMe = shares.some((s) => s && String(s.user_id) === String(currentUser.id));
            if (!isSharedToMe) return;
            if (isRead) return;
          }

          if (isMyReport) {
            myReportMap.set(dayNum, r.status);
          } else {
            otherUserReportMap.set(dayNum, true);
          }

          if (!isRead) {
            unreadDotsMap.set(dayNum, true);
          }
        });
      }

      // 祝日データの補正同期
      const currentYear = new Date().getFullYear();
      if (year >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        if (typeof syncHolidaysFromExternalAPI === "function") {
          await syncHolidaysFromExternalAPI(year);
        }
      }
    }
  } catch (err) {
    console.error("メインカレンダーデータのロードに失敗しました:", err);
  }

  // セル生成関数
  function createDayCell(dayNum, isOtherMonth = false, otherMonthOffset = 0) {
    const div = document.createElement("div");
    div.className = "calendar-day-cell";
    div.innerHTML = `
      <div class="calendar-day-header">
        <span class="day-number">${dayNum}</span>
        <div class="calendar-day-badge-area"></div>
      </div>
      <div class="calendar-day-bottom-flex" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: auto;">
        <div class="calendar-attendance-group"></div>
        <div class="calendar-report-group" style="display: flex; align-items: center;"></div>
      </div>
    `;

    const checkDate = new Date(year, month + otherMonthOffset, dayNum);
    const dayOfWeek = checkDate.getDay();

    if (isOtherMonth) {
      div.classList.add("is-other-month");
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
        div.classList.add("is-today");
      }
    }
    return div;
  }

  // 1. 前月分
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    calendarDays.appendChild(createDayCell(prevLastDate - i, true, -1));
  }

  // 2. 当月分の描画
  for (let d = 1; d <= lastDate; d++) {
    const div = createDayCell(d, false, 0);
    calendarDays.appendChild(div);

    const badgeArea = div.querySelector(".calendar-day-badge-area");
    const attendanceGroup = div.querySelector(".calendar-attendance-group");
    const reportGroup = div.querySelector(".calendar-report-group");

    if (isLookingAtMe) {
      const attendanceRecord = attendanceMap.get(d);
      if (attendanceRecord) {
        if (attendanceRecord.work_type === "paid") {
          const label = document.createElement("span");
          label.className = "cal-status-text label-paid";
          label.textContent = "有給";
          badgeArea.appendChild(label);
        } else if (attendanceRecord.work_type === "absent") {
          const label = document.createElement("span");
          label.className = "cal-status-text label-absent";
          label.textContent = "欠勤";
          badgeArea.appendChild(label);
        } else if (!attendanceRecord.clock_out) {
          const workingIndicator = document.createElement("span");
          workingIndicator.className = "cal-working-indicator";
          attendanceGroup.appendChild(workingIndicator);
        }
      }
    }

    if (isLookingAtMe && myReportMap.has(d)) {
      const status = myReportMap.get(d);
      if (status === "draft") {
        const reportIconDraft = document.createElement("i");
        reportIconDraft.className = "bi bi-file-earmark cal-report-draft-flat";
        reportGroup.appendChild(reportIconDraft);
      } else {
        const reportIconSpan = document.createElement("span");
        reportIconSpan.className = "report-icon";
        reportIconSpan.textContent = "📝";
        reportGroup.appendChild(reportIconSpan);
      }
    }

    if (!isLookingAtMe && otherUserReportMap.has(d)) {
      const reportIconSpan = document.createElement("span");
      reportIconSpan.className = "report-icon";
      reportIconSpan.textContent = unreadDotsMap.has(d) ? "📝" : "📄";
      if (!unreadDotsMap.has(d)) {
        reportIconSpan.style.opacity = "0.6";
      }
      reportGroup.appendChild(reportIconSpan);
    }

    if (unreadDotsMap.has(d)) {
      if (isLookingAtMe && !myReportMap.has(d)) {
        const reportIconUnread = document.createElement("span");
        reportIconUnread.className = "cal-unread-dot-fixed";
        badgeArea.appendChild(reportIconUnread);
      } else if (!isLookingAtMe && otherUserReportMap.has(d)) {
        const reportIconUnread = document.createElement("span");
        reportIconUnread.className = "cal-unread-dot-fixed";
        badgeArea.appendChild(reportIconUnread);
      }
    }
  }

  // 3. 翌月分
  const totalRenderedSlots = firstDayOfWeek + lastDate;
  const remainder = totalRenderedSlots % 7;
  const nextMonthNeedSlots = remainder === 0 ? 0 : 7 - remainder;

  for (let n = 1; n <= nextMonthNeedSlots; n++) {
    calendarDays.appendChild(createDayCell(n, true, 1));
  }

  isCalendarRendering = false;
}

// =========================================================================
// メイン画面専用：過去のレポート一覧取得＆描画処理（モック撤廃・動的マスタ版）
// =========================================================================
async function updateMainPageReportList() {
  const pastReportListEl = document.getElementById("past_report_list");
  if (!pastReportListEl) return; // 💡 DOMがない時は即終了（警告ログ対策）

  try {
    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    // 1. ログインユーザー情報の動的取得
    const {
      data: { user: authUser },
    } = await supabaseClient.auth.getUser();
    if (!authUser) return;

    // 💡 テーブルマスタから本当の名前を動的に引っ張ってくる
    const { data: userMasterRow } = await supabaseClient.from("user_master").select("last_name, first_name").eq("id", authUser.id).single();

    const loginUser = {
      id: authUser.id,
      last_name: userMasterRow ? userMasterRow.last_name : "ユーザー",
      first_name: userMasterRow ? userMasterRow.first_name : "",
    };

    // 2. プルダウンの安全な選択肢組み立て
    const userSelect = document.getElementById("target_user_id");
    if (userSelect) {
      if (userSelect.options.length === 0) {
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "全てのレポート";
        allOption.selected = true;
        userSelect.appendChild(allOption);

        const mineOption = document.createElement("option");
        mineOption.value = "mine";
        mineOption.textContent = "自分のレポート";
        userSelect.appendChild(mineOption);
      }

      const savedSelectedValue = userSelect.value;

      const { data: allReports } = await supabaseClient.from("report_logs").select(`
          id, report_type, report_date, is_active, status, user_id,
          user_master ( id, last_name, first_name ),
          report_shares ( user_id )
        `);

      if (allReports) {
        const seenUserIds = new Set();
        allReports.forEach((r) => {
          if (r.user_id != loginUser.id && !seenUserIds.has(r.user_id) && r.is_active !== false) {
            seenUserIds.add(r.user_id);
            let fullName = "他ユーザー";
            if (r.user_master) {
              const masterArray = Array.isArray(r.user_master) ? r.user_master : [r.user_master];
              const targetMaster = masterArray.find((m) => m && m.id == r.user_id);
              if (targetMaster) {
                fullName = `${targetMaster.last_name || ""} ${targetMaster.first_name || ""}`.trim();
              }
            }

            const exists = Array.from(userSelect.options).some((opt) => opt.value == r.user_id);
            if (!exists) {
              const opt = document.createElement("option");
              opt.value = r.id;
              opt.textContent = fullName;
              userSelect.appendChild(opt);
            }
          }
        });

        if (savedSelectedValue && Array.from(userSelect.options).some((opt) => opt.value === savedSelectedValue)) {
          userSelect.value = savedSelectedValue;
        }
      }
    }

    const filterValue = userSelect ? userSelect.value : "all";

    // 3. メイン表示用の直近10件を取得
    let query = supabaseClient
      .from("report_logs")
      .select(
        `
        id, report_date, report_type, status, user_id, is_active,
        user_master(id, last_name, first_name),
        report_shares(report_id, user_id, is_read)
      `,
      )
      .or("is_active.eq.true,status.eq.draft")
      .order("report_date", { ascending: false })
      .limit(10);

    if (filterValue !== "all" && filterValue !== "mine") {
      query = query.eq("user_id", filterValue);
    } else if (filterValue === "mine") {
      query = query.eq("user_id", loginUser.id);
    }

    const { data: displayReports, error } = await query;
    if (error) throw error;

    if (!displayReports || displayReports.length === 0) {
      pastReportListEl.innerHTML = `<div class="text-muted p-3 text-center" style="font-size: 0.85rem;">表示するレポートはありません。</div>`;
      return;
    }

    let htmlContent = "";
    displayReports.forEach((report) => {
      const isMyReport = report.user_id == loginUser.id;
      let isRead = false;
      const sharesArray = Array.isArray(report.report_shares) ? report.report_shares : report.report_shares ? [report.report_shares] : [];

      if (isMyReport) {
        isRead = true;
      } else {
        const myShare = sharesArray.find((s) => s && s.user_id == loginUser.id);
        isRead = myShare ? myShare.is_read : false;
      }

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

      const formattedDate = report.report_date ? report.report_date.replace(/-/g, "/") : "ー/ー/ー";

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
        }
      }

      htmlContent += `
        <a href="javascript:void(0);" class="list-group-item list-group-item-action d-flex align-items-center justify-content-between past-report-item" 
           data-id="${report.id}"
           style="padding: 0.65rem 0.5rem; border: none; border-bottom: 1px solid #f1f5f9; background: transparent; transition: all 0.2s;">
          <div class="d-flex align-items-center min-w-0 flex-grow-1">
            ${leftBorderHtml}
            <div class="d-flex align-items-center gap-1.5 min-w-0" style="font-size: 0.82rem;">
              ${iconHtml}
              <span class="${textClass} text-truncate ms-1">
                ${report.report_type === "weekly" ? "週報" : "日報"}：${reporterName}
              </span>
              ${badgeHtml}
            </div>
          </div>
          <span class="text-muted flex-shrink-0 ms-2" style="font-size: 0.72rem; opacity: 0.8;">${formattedDate}</span>
        </a>
      `;
    });

    pastReportListEl.innerHTML = htmlContent;

    // イベントバインド
    document.querySelectorAll("#past_report_list .past-report-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.preventDefault();
        const currentItem = e.currentTarget;
        const reportId = currentItem.getAttribute("data-id");

        document.querySelectorAll("#past_report_list .past-report-item").forEach((el) => {
          el.classList.remove("bg-secondary-subtle", "fw-bold");
        });
        currentItem.classList.add("bg-secondary-subtle", "fw-bold");

        if (typeof fetchAndDisplaySingleReport === "function") {
          await fetchAndDisplaySingleReport(reportId);
        }

        const modalElement = document.getElementById("report_detail_modal");
        if (modalElement) {
          const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
          modal.show();
        }
      });
    });
  } catch (err) {
    console.error("❌ レポート一覧取得失敗:", err);
  }
}

// ==========================================
// 共通基盤（SPA）用にのみ公開（フライング実行を完全廃止）
// ==========================================
window.renderCalendar = async () => {
  initCalendarSelector();
  await renderCalendarInternal();
  await updateMainPageReportList();

  const userSelect = document.getElementById("target_user_id");
  if (userSelect) {
    userSelect.removeEventListener("change", onFilterChange);
    userSelect.addEventListener("change", onFilterChange);
  }
};

async function onFilterChange() {
  if (isCalendarRendering) return;
  await updateMainPageReportList();
  await renderCalendarInternal();
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("main.js: 初期化は共通基盤からの呼び出しを待ちます。");
});
