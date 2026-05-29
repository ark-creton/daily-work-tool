window.initAttendanceCalendar = async () => {
  const displayPeriodInput = document.getElementById("display_period");
  const attendanceTbody = document.getElementById("attendance_tbody");
  const modalContainer = document.getElementById("modal_container");

  // もし必要な要素がなければ処理を終了
  if (!displayPeriodInput || !attendanceTbody) {
    return;
  }

  // --- 1. 初期化・読み込み処理 内の修正 ---
  if (modalContainer && modalContainer.innerHTML.trim() === "") {
    try {
      const response = await fetch("./attendance-edit-modal.html?v=3");
      const html = await response.text();
      modalContainer.innerHTML = html;
      console.log("✅ モーダルHTMLを読み込みました");

      // 既存の勤怠計算リスナー
      attachAttendanceCalculationListeners();
      // 経費明細のボタンイベント初期化
      initExpenseCalculationListeners();
    } catch (err) {
      console.error("モーダル読み込み失敗:", err);
    }
  }

  // --- 2. 期間設定とイベント登録 ---
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

  if (!displayPeriodInput.value) {
    displayPeriodInput.value = `${currentYear}-${currentMonth}`;
  }

  displayPeriodInput.removeEventListener("change", handlePeriodChange);
  displayPeriodInput.addEventListener("change", handlePeriodChange);

  // 初期表示のためにカレンダー生成処理をキック
  await handlePeriodChange();

  // ==========================================
  // 各種メイン処理
  // ==========================================

  async function syncHolidaysFromExternalAPI(year) {
    try {
      console.log(`🌐 ${year}年の祝日データを外部APIから取得中...`);
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
      const { error } = await supabase.from("holiday_master").upsert(upsertRows, { onConflict: "holiday_date" });
      if (error) throw error;
      console.log(`✅ ${year}年の祝日データをSupabaseに自動同期しました！`);
    } catch (err) {
      console.error("❌ 祝日の自動同期に失敗しました:", err);
    }
  }

  async function handlePeriodChange() {
    const periodValue = displayPeriodInput.value;
    if (!periodValue) return;

    try {
      const [year, month] = periodValue.split("-").map(Number);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      let [recordsResult, holidaysResult] = await Promise.all([
        supabase
          .from("attendance_data")
          .select("*, expense_records(*)")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .gte("work_date", startStr)
          .lte("work_date", endStr),
        supabase.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr),
      ]);

      const currentYear = new Date().getFullYear();
      if (year >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        await syncHolidaysFromExternalAPI(year);
        holidaysResult = await supabase.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr);
      }

      const holidays = {};
      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }

      const recordMap = new Map();
      if (recordsResult.data) {
        recordsResult.data.forEach((r) => {
          const day = new Date(r.work_date).getDate();
          recordMap.set(day, r);
        });
      }
      generateCalendar(year, month, holidays, recordMap, user);
    } catch (err) {
      console.error("データ取得中にエラーが発生しました:", err);
    }
  }

  function generateCalendar(year, month, holidays, recordMap, user) {
    const lastDay = new Date(year, month, 0).getDate();
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    let htmlRows = "";

    // 集計用カウンター
    const summary = {
      workDays: 0,
      totalWorkMin: 0,
      overtimeMin: 0,
      breakMin: 0,
      outingMin: 0,
      holidayWorkDays: 0,
      totalExpenseFee: 0,
    };

    // カレンダーの行を1日ずつ作る
    for (let day = 1; day <= lastDay; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeekNum = dateObj.getDay();

      // 曜日は常に「月」「火」などの1文字を保持します
      const dayOfWeekStr = weekDays[dayOfWeekNum];
      const holidayName = holidays[day];
      const record = recordMap ? recordMap.get(day) : null;

      // この日に紐づくアクティブな経費レコードの金額を、1ヶ月の総合計に加算する
      if (record?.expense_records && Array.isArray(record.expense_records)) {
        record.expense_records.forEach((e) => {
          if (e.is_active) {
            summary.totalExpenseFee += Number(e.amount || 0);
          }
        });
      }

      // 祝日や土日の見た目・曜日表記の設定
      let dayColorClass = "";
      let rowClass = "";
      let dateDisplayStr = "";
      const isHolidayOrWeekend = !!holidayName || dayOfWeekNum === 0 || dayOfWeekNum === 6;

      if (holidayName) {
        dayColorClass = "text-danger";
        rowClass = "row-holiday";
        // 祝日の場合は、元の曜日(日・月など)に「祝」や「振」を組み合わせ、その横に？マークを配置
        const isSubstitute = holidayName.includes("振替休日");
        const suffix = isSubstitute ? "・振" : "・祝";
        dateDisplayStr = `${month}/${day} (${dayOfWeekStr}${suffix}) <span class="help-icon" data-bs-toggle="popover" data-bs-content="${holidayName}" tabindex="0" style="cursor: pointer;"><i class="bi bi-question-circle text-muted" style="font-size: 0.85rem;"></i></span>`;
      } else if (dayOfWeekNum === 0) {
        dayColorClass = "text-danger";
        rowClass = "row-holiday";
        dateDisplayStr = `${month}/${day} (${dayOfWeekStr})`;
      } else if (dayOfWeekNum === 6) {
        dayColorClass = "text-primary";
        rowClass = "row-saturday";
        dateDisplayStr = `${month}/${day} (${dayOfWeekStr})`;
      } else {
        dateDisplayStr = `${month}/${day} (${dayOfWeekStr})`;
      }

      // 消えていた時刻フォーマット関数をここに再定義
      const formatTime = (iso) =>
        iso
          ? new Date(iso).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "--:--";

      // 計算ロジック
      let totalWorkStr = "-",
        overtimeStr = "-",
        outingStr = "-";

      // 有給(paid)・欠勤(absent)の場合はテーブル上の計算をスキップして「-」表示にする
      if (record && record.work_type !== "paid" && record.work_type !== "absent" && record.clock_in && record.clock_out) {
        const toM = (iso) => {
          const d = new Date(iso);
          return d.getHours() * 60 + d.getMinutes();
        };
        const outingM = record.break_start && record.break_end ? Math.max(0, toM(record.break_end) - toM(record.break_start)) : 0;
        const totalM = Math.max(0, toM(record.clock_out) - toM(record.clock_in) - (record.total_break_m || 0) - outingM);
        const overtimeM = Math.max(0, totalM - 8 * 60);

        totalWorkStr = `${Math.floor(totalM / 60)}:${String(totalM % 60).padStart(2, "0")}`;
        overtimeStr = `${Math.floor(overtimeM / 60)}:${String(overtimeM % 60).padStart(2, "0")}`;
        outingStr = `${Math.floor(outingM / 60)}:${String(outingM % 60).padStart(2, "0")}`;

        summary.workDays++;
        summary.totalWorkMin += totalM;
        summary.overtimeMin += overtimeM;
        summary.breakMin += record.total_break_m || 0;
        summary.outingMin += outingM;
        if (isHolidayOrWeekend) summary.holidayWorkDays++;
      }

      // 勤務区分に応じて行のメモの前にバッジを出すなどの装飾用のテキスト
      let statusBadge = "";
      if (record?.work_type === "paid") statusBadge = '<span class="badge bg-success me-1">有給</span>';
      if (record?.work_type === "absent") statusBadge = '<span class="badge bg-danger me-1">欠勤</span>';

      // ==========================================
      // 表示用データの整形
      // ==========================================
      const isLeave = record?.work_type === "paid" || record?.work_type === "absent";

      // 始業と終業を「〜」で繋ぐ（データがない、または有給・欠勤時は「-」）
      const timeRangeStr =
        isLeave || !record?.clock_in || !record?.clock_out ? "-" : `${formatTime(record.clock_in)} 〜 ${formatTime(record.clock_out)}`;

      // 休憩時間に「分」を付ける（データがない、または有給・欠勤時は「-」）
      const breakTimeDisplay = isLeave || !record?.total_break_m ? "-" : `${record.total_break_m} 分`;
      // ==========================================

      htmlRows += `
        <tr class="${rowClass}">
          <td class="text-center"><button class="btn btn-sm btn-outline-secondary btn-table-edit" data-day="${day}">編集</button></td>
          <td class="fw-bold ${dayColorClass}">${dateDisplayStr}</td>
          
          <td class="text-center">${timeRangeStr}</td>
          
          <td class="text-center">${totalWorkStr}</td>
          <td class="text-center">${overtimeStr}</td>
          
          <td class="text-center">${breakTimeDisplay}</td>
          
          <td class="text-center">${outingStr}</td>
          
         <td class="text-start text-truncate small cell-expense">
            ${
              record?.expense_records && record.expense_records.length > 0
                ? record.expense_records
                    .filter((e) => e.is_active && (e.expense_type || e.amount || e.memo))
                    .map((e) => `【${e.memo || e.expense_type || ""} ${Number(e.amount || 0).toLocaleString()}円】`)
                    .join(", ")
                : ""
            }
          </td>
          
          <td class="text-truncate">${statusBadge}${record?.memo || ""}</td>
        </tr>`;
    }

    attendanceTbody.innerHTML = htmlRows;

    const formatMin = (m) => (m > 0 ? (m / 60).toFixed(1).replace(/\.0$/, "") : "0");

    document.getElementById("work_days_count").textContent = summary.workDays;
    document.getElementById("total_work_hours").textContent = formatMin(summary.totalWorkMin);
    document.getElementById("total_overtime_hours").textContent = formatMin(summary.overtimeMin);
    document.getElementById("total_out_hours").textContent = formatMin(summary.outingMin);

    const holidayWorkDaysEl = document.getElementById("holiday_work_days");
    if (holidayWorkDaysEl) {
      holidayWorkDaysEl.textContent = summary.holidayWorkDays;
    }

    // 計算した1ヶ月全体の経費合計をメイン画面の「total_expense_fee」要素に反映する
    const totalExpenseFeeEl = document.getElementById("total_expense_fee");
    if (totalExpenseFeeEl) {
      totalExpenseFeeEl.textContent = summary.totalExpenseFee.toLocaleString();
    }

    // 欠勤日数の計算
    let absent = 0;

    for (let d = 1; d <= lastDay; d++) {
      const rec = recordMap.get(d);

      // 画面で「欠勤」が選ばれていて、データがアクティブ（削除されていない）状態のものだけをカウント
      if (rec && rec.work_type === "absent" && rec.is_active === true) {
        absent++;
      }
    }

    // 画面の「欠勤日数」パーツに反映
    const absentDaysCountEl = document.getElementById("absent_days_count");
    if (absentDaysCountEl) {
      absentDaysCountEl.textContent = absent;
    }

    const popoverTriggerList = [].slice.call(attendanceTbody.querySelectorAll('[data-bs-toggle="popover"]'));
    const triggerMode = window.innerWidth < 768 ? "focus" : "hover focus";
    popoverTriggerList.map((el) => new bootstrap.Popover(el, { trigger: triggerMode }));

    setupEditButtonEvents(recordMap, user);
  }

  // 有給・欠勤の時に入力欄をグレーアウト＆値をリセットする制御関数
  function toggleModalInputsByWorkType(workType) {
    const timeInputs = ["edit_clock_in", "edit_clock_out", "edit_break_time", "edit_break_start", "edit_break_end"];

    if (workType === "paid" || workType === "absent") {
      // 有給・欠勤の場合は時間入力を不可にして、値をクリアする
      timeInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = true;
          // 休憩時間(number)は0に、それ以外(time)は空文字にする
          el.value = id === "edit_break_time" ? "0" : "";
        }
      });
    } else {
      // 通常出勤の場合はすべて解放
      timeInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      });
    }
    // グレーアウト状態を反映させて再計算
    calculateAttendance();
  }

  /**
   * モーダル編集イベント登録
   */
  function setupEditButtonEvents(recordMap, user) {
    const formatToBadgeDisplay = (isoString) => {
      if (!isoString) return { date: "--/--", time: "--:--" };
      const date = new Date(isoString);
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
      };
    };

    const formatToTimeInput = (isoString) => {
      if (!isoString) return "";
      const date = new Date(isoString);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };

    document.querySelectorAll(".btn-table-edit").forEach((button) => {
      button.addEventListener("click", (e) => {
        const dayStr = e.target.getAttribute("data-day");
        const dayNum = parseInt(dayStr);
        const record = recordMap.get(dayNum);
        const modalEl = document.getElementById("attendanceEditModal");
        if (!modalEl) return;

        // --- 安全な要素取得と値セット ---
        const [y, m] = displayPeriodInput.value.split("-").map(Number);
        const dateObj = new Date(y, m - 1, dayNum);

        const editDateEl = document.getElementById("display_edit_date");
        if (editDateEl) {
          editDateEl.textContent = `${dateObj.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })} (${dateObj.toLocaleDateString("ja-JP", { weekday: "short" })})`;
        }

        const workTypeSelect = document.getElementById("edit_work_type");
        if (workTypeSelect) {
          workTypeSelect.value = record?.work_type || "normal";
        }

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        };

        setVal("edit_clock_in", record?.clock_in ? formatToTimeInput(record.clock_in) : "09:00");
        setVal("edit_clock_out", record?.clock_out ? formatToTimeInput(record.clock_out) : "18:00");
        setVal("edit_break_time", record?.total_break_m || "60");
        setVal("edit_memo", record?.memo || "");
        setVal("edit_break_start", record?.break_start ? formatToTimeInput(record.break_start) : "");
        setVal("edit_break_end", record?.break_end ? formatToTimeInput(record.break_end) : "");

        toggleModalInputsByWorkType(workTypeSelect?.value || "normal");

        if (workTypeSelect) {
          workTypeSelect.removeEventListener("change", handleWorkTypeChange);
          workTypeSelect.addEventListener("change", handleWorkTypeChange);
        }
        function handleWorkTypeChange(ev) {
          toggleModalInputsByWorkType(ev.target.value);
        }

        // 実績表示のセット
        const inData = formatToBadgeDisplay(record?.original_clock_in);
        const outData = formatToBadgeDisplay(record?.original_clock_out);

        const setTxt = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.textContent = val;
        };

        setTxt("display_original_date_in", inData.date);
        setTxt("display_original_clock_in", inData.time);
        setTxt("display_original_date_out", outData.date);
        setTxt("display_original_clock_out", outData.time);

        // 1. 最終更新日時のフォーマット関数（重複を排除して1つだけにします）
        const formatToFullDisplay = (isoString) => {
          if (!isoString) return "-";
          const date = new Date(isoString);
          return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        };

        setTxt("display_updated_at", formatToFullDisplay(record?.updated_at));

        // ==========================================
        // 🔄 経費明細エリアのリセットと初期2行生成
        // ==========================================
        const expenseList = document.getElementById("expense_list");
        if (expenseList) expenseList.innerHTML = ""; // 前回の残りをクリア

        // データベースに保存済みの経費があるかチェック
        if (record?.expense_records && Array.isArray(record.expense_records) && record.expense_records.length > 0) {
          // すでにデータがあれば登録されている件数分すべて展開
          record.expense_records.forEach((item) => {
            addExpenseRow({
              id: item.id,
              category: item.expense_type,
              detail: item.memo,
              amount: item.amount,
            });
          });
        } else {
          // データがない日（新規など）は、最初からデフォルトで1行表示する
          addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
        }

        calculateAttendance();

        // --- 保存ボタンの処理（経費明細の連動保存を追加） ---
        const saveButton = document.getElementById("attendance_save_btn");
        if (saveButton) {
          const newSaveButton = saveButton.cloneNode(true);
          saveButton.parentNode.replaceChild(newSaveButton, saveButton);

          newSaveButton.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            newSaveButton.disabled = true;
            newSaveButton.textContent = "保存中...";

            try {
              const clockInTime = document.getElementById("edit_clock_in").value;
              const clockOutTime = document.getElementById("edit_clock_out").value;
              const breakTimeM = parseInt(document.getElementById("edit_break_time").value) || 0;
              const memo = document.getElementById("edit_memo").value;
              const breakStart = document.getElementById("edit_break_start").value;
              const breakEnd = document.getElementById("edit_break_end").value;
              const workType = document.getElementById("edit_work_type").value;

              const createIsoString = (timeStr) => {
                if (!timeStr) return null;
                const [hours, minutes] = timeStr.split(":");
                return new Date(y, m - 1, dayNum, parseInt(hours), parseInt(minutes)).toISOString();
              };

              const targetDateStr = `${y}-${String(m).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const currentNowIso = new Date().toISOString();

              const upsertData = {
                user_id: user.id,
                work_date: targetDateStr,
                work_type: workType,
                clock_in: createIsoString(clockInTime),
                clock_out: createIsoString(clockOutTime),
                total_break_m: breakTimeM,
                break_start: createIsoString(breakStart),
                break_end: createIsoString(breakEnd),
                memo: memo,
                original_clock_in: record?.original_clock_in || currentNowIso,
                original_clock_out: record?.original_clock_out || currentNowIso,
                is_active: true,
                updated_at: currentNowIso,
              };
              if (record?.id) upsertData.id = record.id;

              // ーーー 【ステップ1】まず勤怠親データを保存し、確定したレコードを返す ーーー
              const { data: savedAttendance, error: attendanceError } = await supabase
                .from("attendance_data")
                .upsert(upsertData, { onConflict: "id" })
                .select()
                .single();

              if (attendanceError) throw attendanceError;

              // 確定した親のIDを取得
              const parentAttendanceId = savedAttendance.id;

              // ーーー 【ステップ2】画面から手入力された経費入力行をすべて回収する ーーー
              const expenseRows = document.querySelectorAll("#expense_list .expense-notebook-row");
              const expenseRecordsToUpsert = [];

              expenseRows.forEach((row) => {
                // 画面上の行から、隠し持たせていたレコードIDを取得
                const dbId = row.getAttribute("data-db-id");

                const categoryEl = row.querySelector(".expense-notebook-select");
                const amountEl = row.querySelector(".expense-notebook-amount-field");
                const detailEl = row.querySelector(".expense-notebook-input");

                const amountValue = amountEl ? parseInt(amountEl.value, 10) || 0 : 0;
                const categoryValue = categoryEl ? categoryEl.value.trim() : "";
                const detailValue = detailEl ? detailEl.value.trim() : "";

                // 💡 【修正の核心】金額が0より大きい（有効な入力がある）場合のみ、保存対象の配列にプッシュする
                if (amountValue > 0) {
                  // 自前UUID生成ロジック（万が一IDが漏れていた場合の最終防衛線）
                  const fallbackUUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                    const r = (Math.random() * 16) | 0;
                    const v = c === "x" ? r : (r & 0x3) | 0x8;
                    return v.toString(16);
                  });

                  const dataRow = {
                    id: dbId && dbId.trim() !== "" ? dbId.trim() : fallbackUUID,
                    attendance_id: parentAttendanceId,
                    user_id: user.id,
                    expense_date: targetDateStr,
                    expense_type: categoryValue,
                    memo: detailValue,
                    amount: amountValue,
                    is_active: true,
                    updated_at: currentNowIso,
                  };

                  expenseRecordsToUpsert.push(dataRow);
                }
              });

              // 新しい経費データがあれば upsert で一括保存・更新
              if (expenseRecordsToUpsert.length > 0) {
                console.log("🚀 Supabaseに送信する直前の経費データの中身:", expenseRecordsToUpsert);

                const { data: upsertedData, error: expenseError } = await supabase
                  .from("expense_records")
                  .upsert(expenseRecordsToUpsert, { onConflict: "id" });

                if (expenseError) {
                  console.error("❌ 経費のUpsertでエラーが発生しました:", expenseError);
                  throw expenseError;
                }
                console.log("✅ 経費のUpsertが成功しました！");
              } else {
                // もし有効な経費データが1件もなければ、ログを出してそのまま次へ進む
                console.log("ℹ️ 保存対象の有効な経費（金額 > 0）がないため、経費の保存をスキップしました。");
              }

              bootstrap.Modal.getInstance(modalEl)?.hide();
              await handlePeriodChange();
            } catch (err) {
              console.error(err);
              window.showToast("保存に失敗しました。", "error");
            } finally {
              newSaveButton.disabled = false;
              newSaveButton.textContent = "保存";
            }
          });
        }

        // ==========================================
        // 🔄 2段構えのリセット・消去モーダル制御
        // ==========================================
        const editModalEl = document.getElementById("attendanceEditModal");
        const discardModalEl = document.getElementById("discardConfirmModal");

        // 1. メイン画面の「データをリセット」ボタンを押した時
        const resetButton = document.getElementById("attendance_reset_btn");
        resetButton.onclick = () => {
          // まだデータベースにデータがない（当日一度も保存も打刻もない）場合はスキップ
          if (!record || !record.id) {
            return window.showToast("リセットするデータがありません", "error");
          }

          // 編集モーダルを一旦ハイドし、確認モーダルを重ねて表示する
          editModalEl.classList.remove("show");
          setTimeout(() => {
            editModalEl.style.display = "none";
            discardModalEl.style.display = "block";
            requestAnimationFrame(() => {
              discardModalEl.classList.add("show");
            });
          }, 150);
        };

        // 2. 確認画面：「キャンセル」で元の編集画面に戻る処理
        const cancelBtn = document.getElementById("btn_discard_cancel");
        cancelBtn.onclick = () => {
          discardModalEl.classList.remove("show");
          setTimeout(() => {
            discardModalEl.style.display = "none";
            editModalEl.style.display = "block";
            requestAnimationFrame(() => {
              editModalEl.classList.add("show");
            });
          }, 150);
        };

        // 3. 確認画面：【理想の挙動】「手入力をクリアして再入力」ボタンを押した時
        const clearInputsBtn = document.getElementById("btn_clear_inputs");
        clearInputsBtn.onclick = () => {
          // フォーム内の手入力可能な箇所をすべてリセット（空っぽに）する
          document.getElementById("edit_work_type").value = "normal"; // 通常出勤に戻す
          document.getElementById("edit_clock_in").value = ""; // 空っぽ
          document.getElementById("edit_clock_out").value = ""; // 空っぽ
          document.getElementById("edit_break_time").value = ""; // 空っぽ
          document.getElementById("edit_break_start").value = ""; // 空っぽ
          document.getElementById("edit_break_end").value = ""; // 空っぽ
          document.getElementById("edit_memo").value = ""; // 空っぽ

          // 有給・欠勤のグレーアウト制御を通常状態に戻す
          toggleModalInputsByWorkType("normal");

          // 勤務時間・時間外のリアルタイム計算表示を "--:--"（または0）に戻す
          calculateAttendance();

          window.showToast("手入力をクリアしました。グレーの打刻時間を参考に再入力してください。", "success");

          // 確認モーダルを閉じ、編集モーダルを「開いたまま」元の状態に戻す
          cancelBtn.click();
        };

        // 4. 確認画面：「この日の記録を完全消去」ボタンを押した時
        const completelyDeleteBtn = document.getElementById("btn_completely_delete");
        completelyDeleteBtn.onclick = async () => {
          try {
            if (!record || !record.id) {
              return window.showToast("消去するデータがありません", "error");
            }

            // ーーー 【ステップ1】勤怠親データを論理削除 (is_active = false) ーーー
            const { error: attendanceError } = await supabase.from("attendance_data").update({ is_active: false }).eq("id", record.id);

            if (attendanceError) throw attendanceError;

            // ーーー 【ステップ2】紐づく経費データもすべて論理削除 (is_active = false) ーーー
            const { error: expenseError } = await supabase
              .from("expense_records")
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq("attendance_id", record.id);

            if (expenseError) {
              console.error("❌ 経費データの論理削除に失敗しました:", expenseError);
              throw expenseError;
            }

            window.showToast("この日の記録（経費含む）を完全に消去しました。", "success");

            // 全てのモーダルを完全に閉じてカレンダーをリフレッシュする
            discardModalEl.classList.remove("show");
            setTimeout(() => {
              discardModalEl.style.display = "none";
              const backdrop = document.querySelector(".modal-backdrop");
              if (backdrop) backdrop.remove();

              const modalInstance = bootstrap.Modal.getInstance(editModalEl);
              if (modalInstance) modalInstance.hide();

              // カレンダー再読み込み
              handlePeriodChange();
            }, 150);
          } catch (e) {
            console.error(e);
            window.showToast("削除に失敗しました。", "error");
          }
        };

        window.preventFormEnterSubmit("attendance_edit_form");

        const modal = bootstrap.Modal.getInstance(editModalEl) || new bootstrap.Modal(editModalEl);
        modal.show();
      });
    });
  }

  // ==========================================
  // 計算・リスナー関連処理
  // ==========================================
  function attachAttendanceCalculationListeners() {
    ["edit_clock_in", "edit_clock_out", "edit_break_time", "edit_break_start", "edit_break_end"].forEach((id) =>
      document.getElementById(id)?.addEventListener("input", calculateAttendance),
    );
  }

  function calculateAttendance() {
    const inVal = document.getElementById("edit_clock_in")?.value;
    const outVal = document.getElementById("edit_clock_out")?.value;
    const breakVal = parseInt(document.getElementById("edit_break_time")?.value) || 0;
    const breakStart = document.getElementById("edit_break_start")?.value;
    const breakEnd = document.getElementById("edit_break_end")?.value;

    // 💡【追加】もし現在「有給」や「欠勤」が選ばれていて入力欄が未入力・無効化されていたら、計算結果を「0時間0分」にする
    const workType = document.getElementById("edit_work_type")?.value;
    if (workType === "paid" || workType === "absent") {
      document.getElementById("calc_total_work").textContent = "0時間0分";
      document.getElementById("calc_overtime").textContent = "0時間0分";
      return;
    }

    if (!inVal || !outVal) {
      document.getElementById("calc_total_work").textContent = "--:--";
      document.getElementById("calc_overtime").textContent = "--:--";
      return;
    }

    const toM = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const outingM = breakStart && breakEnd ? Math.max(0, toM(breakEnd) - toM(breakStart)) : 0;
    const totalM = Math.max(0, toM(outVal) - toM(inVal) - breakVal - outingM);

    const fmt = (m) => `${Math.floor(m / 60)}時間${m % 60}分`;
    document.getElementById("calc_total_work").textContent = fmt(totalM);
    document.getElementById("calc_overtime").textContent = fmt(Math.max(0, totalM - 8 * 60));
  }

  /**
   * 経費明細の入力行を1行追加する（レコードIDの自動生成を強化）
   */
  function addExpenseRow(data = { id: null, category: "交通費", detail: "", amount: "" }) {
    const expenseList = document.getElementById("expense_list");
    if (!expenseList) return;

    // 💡 環境不問のUUID生成関数
    const generateFallbackUUID = () => {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };

    // 💡 既存IDが渡されなければ、即座にUUIDを確定させて埋め込む
    const expenseId = data.id || generateFallbackUUID();

    const rowId = "expense_row_" + Date.now() + Math.random().toString(36).substring(2, 7);
    const div = document.createElement("div");

    div.className = "d-flex flex-column p-2 rounded-2 shadow-sm expense-notebook-row position-relative";
    div.id = rowId;
    div.setAttribute("data-db-id", expenseId); // 💡 これで確実に data-db-id にUUIDが入る

    const currentCategory = data.category || "交通費";

    div.innerHTML = `
    <div class="d-flex align-items-center justify-content-start gap-3 w-100 m-0 p-0">
      <input type="text" class="form-control form-control-sm border-0 border-bottom bg-transparent fw-bold expense-notebook-select" 
             style="width: 100px;" placeholder="カテゴリ" value="${currentCategory}">

      <div class="d-flex align-items-center bg-transparent border-bottom expense-notebook-amount-wrap">
        <input type="number" class="form-control form-control-sm border-0 p-0 text-end bg-transparent fw-bold expense-notebook-amount-field" 
               placeholder="0" min="0" value="${data.amount ?? ""}">
        <span class="text-muted ms-1 text-yen">円</span>
      </div>
      
      <button type="button" class="btn btn-sm text-secondary border-0 p-0 rounded-circle btn-delete-expense d-flex align-items-center justify-content-center expense-notebook-delete-btn" title="削除">
        <i class="bi bi-x-circle-fill"></i>
      </button>
    </div>
    
    <div class="w-100 m-0 pt-1">
      <input type="text" class="form-control form-control-sm border-0 border-bottom bg-transparent expense-notebook-input w-100" 
             placeholder="摘要・ルートなど" value="${data.detail || ""}">
    </div>
  `;

    // 金額リアルタイム再計算
    div.querySelector(".expense-notebook-amount-field").addEventListener("input", calculateTotalExpense);

    // ❌ 削除ボタン処理
    div.querySelector(".btn-delete-expense").addEventListener("click", async () => {
      const dbId = div.getAttribute("data-db-id");
      if (dbId) {
        // すでにDBにあるデータが画面で消されたら物理削除
        await supabase.from("expense_records").delete().eq("id", dbId);
      }
      div.remove();
      calculateTotalExpense();
    });

    expenseList.appendChild(div);
    calculateTotalExpense();
  }

  /**
   * 経費入力枠の金額を集計して合計値に反映する
   */
  function calculateTotalExpense() {
    const amounts = document.querySelectorAll("#expense_list .expense-notebook-amount-field");
    let total = 0;

    amounts.forEach((input) => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val > 0) {
        total += val;
      }
    });

    const totalDisplay = document.getElementById("total_expense");
    if (totalDisplay) {
      totalDisplay.textContent = total.toLocaleString();
    }
  }

  /**
   * 経費明細エリアの初期イベント登録
   */
  function initExpenseCalculationListeners() {
    const addBtn = document.querySelector(".expense-add-btn");

    if (addBtn) {
      addBtn.removeEventListener("click", handleExpenseAddClick);
      addBtn.addEventListener("click", handleExpenseAddClick);
    }
  }

  // ボタンがクリックされた時の処理
  function handleExpenseAddClick(e) {
    e.preventDefault();
    e.stopPropagation();

    // 💡 追加ボタンを押した時もIDは自動生成（nullを渡す）されるので安心です
    addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
  }
};
