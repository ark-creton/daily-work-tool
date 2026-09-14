// 全角数字を半角にし、数字以外を除去する関数
function sanitizeToDigits(str) {
  if (!str) return "";
  // 全角数字（０-９）を半角（0-9）に変換
  let half = str.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
  // 数字以外の文字（ひらがな、記号、アルファベット等）をすべて削除
  return half.replace(/[^0-9]/g, "");
}

// 休憩時間入力欄へのイベント設定
const breakInput = document.getElementById("total_break_m");

if (breakInput) {
  // 入力中（確定時）にリアルタイムで補正
  breakInput.addEventListener("input", (e) => {
    if (e.isComposing) return; // 日本語入力の変換中は邪魔しない
    e.target.value = sanitizeToDigits(e.target.value);
    calculateAttendance(); // 再計算
  });

  // フォーカスが外れたタイミングで未変換文字などを最終掃除
  breakInput.addEventListener("blur", (e) => {
    e.target.value = sanitizeToDigits(e.target.value);
    calculateAttendance(); // 再計算
  });
}

window.isUserWorking = async () => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const today = new Date().toISOString().split("T")[0];
    const { data: record, error } = await supabase
      .from("attendance_data")
      .select("status, registration_mode")
      .match({ user_id: user.id, work_date: today, is_active: true })
      .maybeSingle();

    if (error) throw error;

    // ステータスが出勤中/外出中、かつ「通常打刻」で登録されたデータの場合のみ「打刻中(ロック)」とする
    if (record && record.registration_mode === "button" && (record.status === "working" || record.status === "going_out")) {
      return true;
    }

    // registration_mode === "modal" の場合は、ここをすり抜けて false を返すためロックされません
    return false;
  } catch (e) {
    console.error("isUserWorkingエラー:", e);
    return false;
  }
};

window.initAttendanceCalendar = async () => {
  const displayPeriodInput = document.getElementById("display_period");
  const attendanceTbody = document.getElementById("attendance_tbody");
  const modalContainer = document.getElementById("modal_container");

  if (!displayPeriodInput || !attendanceTbody) {
    return;
  }

  // ◆ 表示対象ユーザー（ドロップダウン）の初期化とログインユーザー優先ソート
  // 【目的】マスタからログインユーザーと同じ会社に所属する有効なユーザー一覧を取得して選択肢を作り、操作中のユーザーを初期選択・最上位にする
  const userSwitcher = document.getElementById("target_user_id");
  if (userSwitcher) {
    try {
      // Step1: 現在ログインしているAuthユーザーの情報を取得
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) throw new Error("ログインユーザーが見つかりません。");

      // Step2: ログインユーザー自身のマスタレコードを取得して所属会社ID（company_id）を特定する
      const { data: loggedInUserMaster, error: loggedInUserError } = await supabase
        .from("user_master")
        .select("company_id")
        .eq("id", currentUser.id)
        .single();

      if (loggedInUserError) throw loggedInUserError;
      const myCompanyId = loggedInUserMaster?.company_id;

      if (!myCompanyId) {
        console.warn("⚠️ ログインユーザーに会社ID（company_id）が紐づいていません。全体を表示します。");
      }

      // Step3: 同じ会社に所属する、有効なユーザー一覧（user_master）を名前順で取得
      let query = supabase.from("user_master").select("id, user_name").eq("is_active", true);

      // 会社IDが存在する場合はフィルタリングをかける
      if (myCompanyId) {
        query = query.eq("company_id", myCompanyId);
      }

      const { data: users, error: masterError } = await query.order("user_name", { ascending: true });

      if (masterError) throw masterError;

      // Step4: ログインユーザーが一覧にあれば、ドロップダウンの先頭（インデックス-1）に並び替える
      if (users) {
        users.sort((a, b) => {
          if (a.id === currentUser.id) return -1;
          if (b.id === currentUser.id) return 1;
          return 0;
        });
      }

      // Step5: 生成したユーザーリストをドロップダウンにDOM反映
      userSwitcher.innerHTML = "";
      users.forEach((u) => {
        const option = document.createElement("option");
        option.value = u.id;
        option.textContent = u.user_name;
        userSwitcher.appendChild(option);
      });

      // Step6: ログインユーザーを初期選択状態にして最初のデータ読み込みを開始
      userSwitcher.value = currentUser.id;
      await handlePeriodChange();

      // 二重登録を防ぐためイベントをリセットして再登録
      userSwitcher.removeEventListener("change", handlePeriodChange);
      userSwitcher.addEventListener("change", handlePeriodChange);
    } catch (err) {
      console.error("❌ 表示対象ユーザーの取得に失敗しました:", err);
    }
  }

  // ◆ 編集モーダル用テンプレートHTMLの非同期読み込み
  // 【目的】メイン画面のHTMLを軽量に保つため、モーダル部分のHTMLを外部ファイルから動的に取得して埋め込む
  if (modalContainer && modalContainer.innerHTML.trim() === "") {
    try {
      const response = await fetch("./attendance-edit-modal.html?v=3");
      const html = await response.text();
      modalContainer.innerHTML = html;
      console.log("✅ モーダルHTMLを読み込みました");

      // モーダルが埋め込まれた直後に、時間・経費の計算リスナーを初期化する
      attachAttendanceCalculationListeners();
      initExpenseCalculationListeners();
    } catch (err) {
      console.error("モーダル読み込み失敗:", err);
    }
  }

  // ◆ 初期表示用の日付セット（当月）と期間変更イベントの登録
  // 【目的】起動時に自動で現在の「年-月」を算出して入力欄にセットし、月変更を検知できるようにする
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

  displayPeriodInput.value = `${currentYear}-${currentMonth}`;

  displayPeriodInput.removeEventListener("change", handlePeriodChange);
  displayPeriodInput.addEventListener("change", handlePeriodChange);

  await handlePeriodChange();

  // ========================================================
  // メインロジック・内部関数定義
  // ========================================================
  // ◆ 外部APIから祝日データを取得し、holiday_masterへUpsert同期
  // 【目的】日本の祝日APIから対象年の祝日一覧を取得し、データベースの祝日マスタを最新状態に上書きする
  async function syncHolidaysFromExternalAPI(year) {
    try {
      const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
      if (!response.ok) throw new Error("外部祝日APIの取得に失敗しました");
      const holidayData = await response.json();
      const nowIso = new Date().toISOString();

      // APIのJSON構造をデータベースのカラム構造にマッピング
      const upsertRows = Object.entries(holidayData).map(([dateStr, name]) => ({
        holiday_date: dateStr,
        name: name,
        updated_at: nowIso,
      }));

      if (upsertRows.length === 0) return;
      const { error } = await supabase.from("holiday_master").upsert(upsertRows, { onConflict: "holiday_date" });
      if (error) throw error;
    } catch (err) {
      console.error("❌ 祝日の自動同期に失敗しました:", err);
    }
  }

  // ◆ 選択期間・ユーザーに応じた勤怠データ、および祝日マスターの取得
  // 【目的】画面で指定された「年月」「ユーザー」を条件に、表示に必要なデータをDBからまとめてロードする
  async function handlePeriodChange() {
    const periodValue = displayPeriodInput.value;
    if (!periodValue) return;

    try {
      const [year, month] = periodValue.split("-").map(Number);

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("ログインユーザーが取得できません");

      // 対象月の開始日（01日）と最終日を算出して検索範囲（範囲文字列）を作る
      const startStr = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const selectedUserId = document.getElementById("target_user_id")?.value || currentUser.id;

      // Step1: 勤怠明細（関連する経費レコードも同時結合）と祝日データを一斉に並列取得
      let [recordsResult, holidaysResult] = await Promise.all([
        supabase
          .from("attendance_data")
          .select("*, expense_records(*)")
          .eq("user_id", selectedUserId)
          .eq("is_active", true)
          .gte("work_date", startStr)
          .lte("work_date", endStr),
        supabase.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr),
      ]);

      // Step2: 祝日マスタが空、または未来月の場合は外部APIから祝日データを取得してマスタを補填
      const currentYear = new Date().getFullYear();
      if (year >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        await syncHolidaysFromExternalAPI(year);
        holidaysResult = await supabase.from("holiday_master").select("holiday_date, name").gte("holiday_date", startStr).lte("holiday_date", endStr);
      }

      // Step3: 祝日データを「日」を取り出したオブジェクト型ハッシュに集約
      const holidays = {};
      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }

      // Step4: 取得した勤怠レコードを「日」をキーにしたMap構造に変換（描画時の検索高速化のため
      const recordMap = new Map();
      if (recordsResult.data) {
        recordsResult.data.forEach((r) => {
          const day = new Date(r.work_date).getDate();
          recordMap.set(day, r);
        });
      }

      // データの準備が完了したら、カレンダーのHTML生成処理へ渡す
      const targetUserObject = { id: selectedUserId };

      await generateCalendar(year, month, holidays, recordMap, targetUserObject, currentUser);
      await renderCalendarGrid(year, month, holidays, recordMap, targetUserObject, currentUser);

      const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

      setupEditButtonEvents(recordMap, currentUser, year, month, holidays, weekDays);
    } catch (err) {
      console.error("データ取得中にエラーが発生しました:", err);
    }
  }

  // ◆ カレンダーHTMLの組み立て・サマリー計算・DOM反映・UI初期化
  // 【目的】1ヶ月分のデータを1日ずつループ処理し、カレンダーの表（行）の組み立てと月間合計サマリーの集計を行う
  async function generateCalendar(year, month, holidays, recordMap, targetUser, loginUser) {
    const isMyData = loginUser && targetUser && loginUser.id === targetUser.id;
    const lastDay = new Date(year, month, 0).getDate();
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
    let htmlRows = "";

    // 月間総合サマリーエリア用の各数値を溜めるカウンター
    const summary = {
      workDays: 0,
      totalWorkMin: 0,
      overtimeMin: 0,
      breakMin: 0,
      outingMin: 0,
      holidayWorkDays: 0,
      totalExpenseFee: 0,
      paidLeaveDays: 0,
      transportFee: 0,
      otherFee: 0,
    };

    // 1日から月末日まで1日ずつ検証・構築するメインループ
    for (let day = 1; day <= lastDay; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeekNum = dateObj.getDay();
      const dayOfWeekStr = weekDays[dayOfWeekNum];
      const holidayName = holidays[day];
      const record = recordMap ? recordMap.get(day) : null;

      // Step1: 有効な（is_active: true）経費レコードのみを月間合計カウンターに加算
      if (record?.expense_records && Array.isArray(record.expense_records)) {
        record.expense_records.forEach((e) => {
          if (e.is_active) {
            const amt = Number(e.amount || 0);
            summary.totalExpenseFee += amt;
            if (e.expense_type === "transportation") {
              summary.transportFee += amt;
            } else if (e.expense_type === "other") {
              summary.otherFee += amt;
            }
          }
        });
      }

      // 各日付の表示文言（モーダルのタイトル等で使い回す共通文字列）の組み立て
      let viewDateStr = `${month}月${day}日（${dayOfWeekStr}`;
      if (holidayName) {
        const isSubstitute = holidayName.includes("振替休日");
        viewDateStr += isSubstitute ? "・振）" : "・祝）";
      } else {
        viewDateStr += "）";
      }

      if (record) {
        record.view_date_str = viewDateStr;
      }

      // Step2: 曜日・祝日判定に応じたCSSクラスおよび日付表示文字（ポップオーバー含む）の決定
      let dayColorClass = "";
      let rowClass = "";
      let dateDisplayStr = "";
      const isHolidayOrWeekend = !!holidayName || dayOfWeekNum === 0 || dayOfWeekNum === 6;

      if (holidayName) {
        dayColorClass = "text-danger";
        rowClass = "row-holiday";
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

      // ISOタイムスタンプから「時:分」形式の文字列を生成するインライン関数
      const formatTime = (iso) =>
        iso
          ? new Date(iso).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
          : "--:--";

      let totalWorkStr = '<span class="text-muted">-</span>',
        overtimeStr = '<span class="text-muted">-</span>',
        outingStr = '<span class="text-muted">-</span>';

      // Step3: 通常勤務日における各実労働時間の計算とカウンター加算
      if (record && record.work_type !== "paid" && record.work_type !== "absent" && record.clock_in) {
        // 退勤（clock_out）も揃っている場合のみ計算
        if (record.clock_out) {
          const toM = (iso) => {
            return Math.floor(new Date(iso).getTime() / (1000 * 60));
          };

          // それぞれの「分の数値」を取得
          const startM = toM(record.clock_in);
          let endM = toM(record.clock_out);

          // 【重要・日またぎ補正】
          if (endM < startM) {
            endM += 24 * 60; // 24時間分（1440分）を加算して翌日の時間にする
          }

          // 外出（休憩）時間の計算
          const outingM = record.break_start && record.break_end ? Math.max(0, toM(record.break_end) - toM(record.break_start)) : 0;

          // 総労働時間の計算
          const totalM = Math.max(0, endM - startM - (Number(record.total_break_m) || 0) - outingM);
          const overtimeM = Math.max(0, totalM - 8 * 60);

          totalWorkStr = totalM >= 0 ? `${Math.floor(totalM / 60)}:${String(totalM % 60).padStart(2, "0")}` : '<span class="text-muted">-</span>';
          overtimeStr = overtimeM > 0 ? `${Math.floor(overtimeM / 60)}:${String(overtimeM % 60).padStart(2, "0")}` : '<span class="text-muted">-</span>';
          outingStr = outingM > 0 ? `${Math.floor(outingM / 60)}:${String(outingM % 60).padStart(2, "0")}` : '<span class="text-muted">-</span>';

          summary.workDays++;
          summary.totalWorkMin += totalM;
          summary.overtimeMin += overtimeM;
          summary.breakMin += record.total_break_m || 0;
          summary.outingMin += outingM;
          if (isHolidayOrWeekend) summary.holidayWorkDays++;
        } else {
          totalWorkStr = '<span class="text-muted">-</span>';
          overtimeStr = '<span class="text-muted">-</span>';
          outingStr = '<span class="text-muted">-</span>';
        }
      }

      // 有給日数の計算
      if (record?.work_type === "paid") {
        summary.paidLeaveDays++;
      }

      // 有給・欠勤のステータスバッジの作成
      let statusBadge = "";
      if (record?.work_type === "paid") {
        statusBadge = '<span class="at-status-badge is-paid">有給</span>';
      } else if (record?.work_type === "absent") {
        statusBadge = '<span class="at-status-badge is-absent">欠勤</span>';
      }

      // Step4: セル表示用データの文字列整形とツールチップ用テキストの生成
      const isLeave = record?.work_type === "paid" || record?.work_type === "absent";

      let timeRangeStr = '<span class="text-muted">-</span>';
      if (!isLeave && record?.clock_in) {
        const startTime = formatTime(record.clock_in);
        if (record.clock_out) {
          timeRangeStr = `${startTime} 〜 ${formatTime(record.clock_out)}`;
        } else {
          timeRangeStr = `${startTime} 〜`;
        }
      }

      const breakTimeDisplay = isLeave || !record?.total_break_m ? '<span class="text-muted">-</span>' : `${record.total_break_m} 分`;

      // 経費区分の英字を日本語に変換するマップ
      const expenseTypeLabelMap = {
        transportation: "交通費",
        other: "その他",
      };

      const expenseText =
        record?.expense_records && record.expense_records.length > 0
          ? record.expense_records
            .filter((e) => e.is_active && (e.expense_type || e.amount || e.memo))
            .map((e) => {
              // メモがあればメモ、無ければ区分の日本語名（無ければそのまま）を取得
              const typeLabel = expenseTypeLabelMap[e.expense_type] || e.expense_type || "";
              const label = e.memo || typeLabel;
              return `【${label} ${Number(e.amount || 0).toLocaleString()}円】`;
            })
            .join(", ")
          : "";

      const memoText = record?.memo || "";

      // 操作権限（ログインユーザー自身のデータか否か）によるボタンの出し分け+勤怠ボタンで打刻中の制御
      let editButtonHtml = "";
      const todayNum = new Date().getDate();
      const isToday = year === new Date().getFullYear() && month === new Date().getMonth() + 1 && day === todayNum;

      // 引数で渡されている「recordMap」から対象日の勤怠レコードを正しく取得
      const dayRecord = recordMap ? recordMap.get(day) : null;

      // 判定ロジックのアップデート
      // 1. 今日、かつ現在進行形で「通常打刻の出勤中」か
      const isStillWorkingToday = isToday ? await window.isUserWorking() : false;

      // 2. 今日、かつ「すでに通常打刻（button）で行われたデータ」がDBに存在するケース
      const hasClockedToday = isToday && dayRecord && dayRecord.registration_mode === "button";

      let finalRowClass = rowClass || "";

      if (isMyData) {
        // 「ボタン打刻(button)で登録された」かつ「出勤中(working)または外出中(going_out)」の場合だけロック！
        const isWorkingByButton =
          isToday &&
          dayRecord &&
          dayRecord.registration_mode === "button" &&
          (dayRecord.status === "working" || dayRecord.status === "going_out");

        if (isWorkingByButton) {
          // 出勤中の場合は「打刻中」ボタンにして編集不可にする
          editButtonHtml = `
      <button class="btn btn-sm btn-table-edit" data-day="${day}" style="background-color: #f0f7ff !important; color: #1e40af !important; border: 1px solid #bfdbfe !important; font-weight: bold !important; cursor: not-allowed !important; display: inline-flex; align-items: center; gap: 6px;">
        <span class="pulsing-blue-dot"></span>打刻中
      </button>
    `;

          finalRowClass += " at-row-working-now";
        } else {
          // 未打刻(not_started)・退勤済み(finished)・モーダル登録(modal)の場合は「編集」ボタンを表示する
          editButtonHtml = `<button class="btn btn-sm btn-outline-secondary btn-table-edit" data-day="${day}">編集</button>`;
        }
      } else {
        editButtonHtml = `<button class="btn btn-sm btn-table-edit btn-table-view-only" style="pointer-events: none;">閲覧</button>`;
      }

      // -------------------------------------------------------------------------
      // クラス付与の判定（有給・欠勤・出勤中/退勤未打刻・未入力）
      // -------------------------------------------------------------------------

      // ① 有給・欠勤のクラス判定
      if (record?.work_type === "paid") {
        finalRowClass += " at-row-paid";
      } else if (record?.work_type === "absent") {
        finalRowClass += " at-row-absent";
      }

      // ② 出勤のみ（退勤未入力）の日のクラス判定
      if (record && record.clock_in && !record.clock_out && record.work_type !== "paid" && record.work_type !== "absent") {
        if (isToday) {
          if (!finalRowClass.includes("at-row-working-now")) {
            finalRowClass += " at-row-working-now";
          }
        } else {
          // 過去日の退勤漏れは at-row-no-clockout を付与（「打刻中」ボタンを出さないため）
          if (!finalRowClass.includes("at-row-no-clockout")) {
            finalRowClass += " at-row-no-clockout";
          }
        }
      }

      // -------------------------------------------------------------------------
      // 未入力日（打刻なし・有給/欠勤なし・有効な経費なし・メモなし）の判定
      // -------------------------------------------------------------------------
      const hasActiveExpense = record?.expense_records && Array.isArray(record.expense_records) && record.expense_records.some(e => e.is_active);
      const isEmptyDay = !record || (!record.clock_in && record.work_type !== "paid" && record.work_type !== "absent" && !hasActiveExpense && !record.memo);

      if (isEmptyDay) {
        finalRowClass += " at-row-empty";
      }

      // ★経費：データがある時だけdivを作成
      const expenseInner = expenseText ? `<div class="cell-expense-clamp">${expenseText}</div>` : '';

      // ★備考：テキストがあるか判定し、ある時だけ span.memo-text-body で囲む
      const hasMemoText = Boolean(memoText && memoText.trim());
      const memoTextHtml = hasMemoText ? `<span class="memo-text-body">${memoText}</span>` : '';

      // バッジ、または備考テキストの「どちらか」があれば要素を作成（どちらも無ければ完全な空文字）
      const memoInner = (statusBadge || hasMemoText)
        ? `<div class="cell-memo-clamp">${statusBadge}${memoTextHtml}</div>`
        : '';

      // Step5: テンプレートHTMLへの流し込み（8番目と9番目のtd）
      htmlRows += `
        <tr class="${finalRowClass}">
          <td class="text-center">${editButtonHtml}</td> 
          <td class="fw-bold ${dayColorClass}">${dateDisplayStr}</td>
          <td class="text-center">${timeRangeStr}</td>
          <td class="text-center">${totalWorkStr}</td>
          <td class="text-center">${overtimeStr}</td>
          <td class="text-center">${breakTimeDisplay}</td>
          <td class="text-center">${outingStr}</td>
          <td class="text-start small cell-expense" style="max-width: 180px; cursor: help; padding-top: 4px; padding-bottom: 4px;" data-bs-toggle="tooltip" data-bs-placement="top" title="${expenseText}">${expenseInner}</td>
          <td class="small cell-memo" style="max-width: 150px; cursor: help; padding-top: 4px; padding-bottom: 4px;" data-bs-toggle="tooltip" data-bs-placement="top" title="${memoText}">${memoInner}</td>
        </tr>`;
    }

    // テーブル本体のHTMLを差し替え
    attendanceTbody.innerHTML = htmlRows;
    try {
      await renderCalendarGrid(year, month, holidays, recordMap, targetUser, loginUser);
    } catch (error) {
      console.error("グリッドカレンダーの描画中にエラーが発生しました:", error);
    }

    // Step6: 「月間合計サマリー欄」のDOMテキスト書き換え
    document.getElementById("work_days_count").textContent = summary.workDays > 0 ? summary.workDays : "-";

    // 総勤務時間
    if (summary.totalWorkMin > 0) {
      const h = Math.floor(summary.totalWorkMin / 60);
      const min = summary.totalWorkMin % 60;
      document.getElementById("total_work_hours").textContent = h > 0 ? h : "-";
      document.getElementById("total_work_minutes").textContent = min;
    } else {
      document.getElementById("total_work_hours").textContent = "-";
      document.getElementById("total_work_minutes").textContent = "-";
    }

    // 時間外労働
    if (summary.overtimeMin > 0) {
      const h = Math.floor(summary.overtimeMin / 60);
      const min = summary.overtimeMin % 60;
      document.getElementById("total_overtime_hours").textContent = h > 0 ? h : "-";
      document.getElementById("total_overtime_minutes").textContent = min;
    } else {
      document.getElementById("total_overtime_hours").textContent = "-";
      document.getElementById("total_overtime_minutes").textContent = "-";
    }

    // 外出時間数
    if (summary.outingMin > 0) {
      const h = Math.floor(summary.outingMin / 60);
      const min = summary.outingMin % 60;
      document.getElementById("total_out_hours").textContent = h > 0 ? h : "-";
      document.getElementById("total_out_minutes").textContent = min;
    } else {
      document.getElementById("total_out_hours").textContent = "-";
      document.getElementById("total_out_minutes").textContent = "-";
    }

    const holidayWorkDaysEl = document.getElementById("holiday_work_days");
    if (holidayWorkDaysEl) {
      holidayWorkDaysEl.textContent = summary.holidayWorkDays > 0 ? summary.holidayWorkDays : "-";
    }

    // 有給
    const paidLeaveDaysEl = document.getElementById("paid_leave_days");
    if (paidLeaveDaysEl) {
      paidLeaveDaysEl.textContent = summary.paidLeaveDays > 0 ? summary.paidLeaveDays : "-";
    }

    // 経費合計・内訳テキストの書き換え
    const totalExpenseFeeEl = document.getElementById("total_expense_fee");
    const breakdownEl = document.getElementById("expense_breakdown");

    if (summary.totalExpenseFee > 0) {
      if (totalExpenseFeeEl) {
        totalExpenseFeeEl.textContent = summary.totalExpenseFee.toLocaleString();
      }
      if (breakdownEl) {
        breakdownEl.innerHTML = `交通費: ${summary.transportFee.toLocaleString()}円<br>その他: ${summary.otherFee.toLocaleString()}円`;
      }
    } else {
      if (totalExpenseFeeEl) {
        totalExpenseFeeEl.textContent = "-";
      }
      if (breakdownEl) {
        breakdownEl.innerHTML = `交通費: -<br>その他: -`;
      }
    }

    // Step7: 有効な（is_active: true）当月の「欠勤日数」を別途ループカウントして反映
    let absent = 0;
    for (let d = 1; d <= lastDay; d++) {
      const rec = recordMap.get(d);
      if (rec && rec.work_type === "absent" && rec.is_active === true) {
        absent++;
      }
    }

    const absentDaysCountEl = document.getElementById("absent_days_count");
    if (absentDaysCountEl) {
      absentDaysCountEl.textContent = absent > 0 ? absent : "-";
    }

    // Step8: Bootstrapポップオーバーおよび文字溢れ時限定のツールチップ初期化処理
    const popoverTriggerList = [].slice.call(attendanceTbody.querySelectorAll('[data-bs-toggle="popover"]'));
    const triggerMode = window.innerWidth < 768 ? "focus" : "hover focus";
    popoverTriggerList.map((el) => new bootstrap.Popover(el, { trigger: triggerMode }));

    setTimeout(() => {
      const tooltipTriggerList = [].slice.call(attendanceTbody.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map((el) => {
        const fullText = el.getAttribute("title")?.trim() || "";
        if (fullText === "") return;

        const clampEl = el.querySelector(".cell-expense-clamp") || el.querySelector(".cell-memo-clamp");
        if (clampEl) {
          const rect = clampEl.getBoundingClientRect();
          const isClamped = clampEl.scrollHeight > rect.height + 1; // 実際に省略（...）されているか判定

          if (isClamped) {
            return new bootstrap.Tooltip(el, { trigger: triggerMode });
          } else {
            el.setAttribute("title", "");
            el.removeAttribute("data-bs-toggle");
          }
        } else {
          return new bootstrap.Tooltip(el, { trigger: triggerMode });
        }
      });
    }, 50);
  }

  // ◆ 選択された行の日付や取得済データを編集モーダル内の各入力項目にマッピング
  // 【目的】カレンダーで編集ボタンを押した際、またはモーダル内で前日・翌日移動した際に、インプットの値を最新データに同期する
  function fillModalFields(record, dateObj, recordMap) {
    // Step1: モーダルヘッダータイトルの日付表記更新
    const editDateEl = document.getElementById("display_edit_date");
    if (editDateEl) {
      editDateEl.textContent = `${dateObj.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })} (${dateObj.toLocaleDateString("ja-JP", { weekday: "short" })})`;
    }

    const workTypeSelect = document.getElementById("edit_work_type");
    if (workTypeSelect) workTypeSelect.value = record?.work_type || "normal";

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    const formatTimeToHHMM = (isoString) => {
      if (!isoString) return "";
      const date = new Date(isoString);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };

    // Step2: モーダルの各入力フィールドに値をセット
    setVal("edit_work_type", record?.work_type || "normal");
    setVal("edit_clock_in", record?.clock_in ? formatTimeToHHMM(record.clock_in) : "");
    setVal("edit_clock_out", record?.clock_out ? formatTimeToHHMM(record.clock_out) : "");
    setVal("edit_break_start", record?.break_start ? formatTimeToHHMM(record.break_start) : "");
    setVal("edit_break_end", record?.break_end ? formatTimeToHHMM(record.break_end) : "");
    setVal("edit_memo", record?.memo || "");

    // ★ 休憩時間の要素取得とサニタイズ処理（setValによる二重上書きを排除）
    const totalBreakInput = document.getElementById("total_break_m");
    if (totalBreakInput) {
      totalBreakInput.setAttribute("type", "text");
      totalBreakInput.setAttribute("inputmode", "numeric");
      totalBreakInput.value = sanitizeToDigits(String(record?.total_break_m || ""));
    }

    // 勤務区分に基づき時間入力項目の入力禁止（disabled）をスイッチ
    toggleModalInputsByWorkType(workTypeSelect?.value || "normal");

    // Step3: モーダル内の経費明細リストの生成
    const expenseList = document.getElementById("expense_list");
    if (expenseList) expenseList.innerHTML = "";

    if (record?.expense_records && Array.isArray(record.expense_records)) {
      // 論理削除（is_active = false）されていない有効な経費データのみを抽出
      const activeExpenses = record.expense_records.filter((item) => item.is_active !== false);

      if (activeExpenses.length > 0) {
        activeExpenses.forEach((item) =>
          addExpenseRow({
            id: item.id,
            category: item.expense_type,
            detail: item.memo,
            amount: item.amount,
          }),
        );
      } else {
        addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
      }
    } else {
      addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
    }

    // 値を詰め終わった後に、労働時間等の表示値を最新値に再計算させる
    calculateAttendance();
  }

  // ◆ 勤務区分（有給・欠勤）に伴う入力欄の制御
  // 【目的】「有給」「欠勤」の時は、出退勤時間や休憩時間の入力を禁止(disabled)にし、不要なデータをクリアする
  function toggleModalInputsByWorkType(workType) {
    const timeInputs = ["edit_clock_in", "edit_clock_out", "total_break_m", "edit_break_start", "edit_break_end"];

    if (workType === "paid" || workType === "absent") {
      // Step1: 有給・欠勤時は時間入力をすべて無効化し、値をクリア（休憩は0分）
      timeInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.disabled = true;
          el.value = id === "total_break_m" ? "0" : "";
        }
      });

      // Step2: 画面上の経費入力欄をすべて消去する
      const expenseList = document.getElementById("expense_list");
      if (expenseList) {
        expenseList.innerHTML = "";
        // 最低1行は空の経費入力欄を表示しておく
        if (typeof addExpenseRow === "function") {
          addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
        }
      }
    } else {
      // Step3: 通常勤務などの場合は、時間入力をすべて編集可能に戻す
      timeInputs.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
      });
    }
    // 金額や勤務時間の再計算を走らせる
    calculateAttendance();
  }
  // 【状態管理】現在モーダルで開いているデータの一時保管場所
  let currentModalDate = null; // 開いている「日付（Dateオブジェクト）」
  let currentModalRecord = null; // DBから取得した「勤怠レコードの生データ」
  let deletedExpenseIds = []; // ユーザーがモーダル内で「削除」を押した経費のIDリスト（保存時に一括更新するため）

  // ◆ モーダル内編集イベント・保存制御
  // 【目的】カレンダーからモーダルを開いた後の、前日・翌日移動や、入力内容をDBに保存する処理をセットアップする
  function setupEditButtonEvents(recordMap, user, year, month, holidays, weekDays) {
    const formatToBadgeDisplay = (isoString) => {
      if (!isoString) return { date: "--/--", time: "--:--" };
      const date = new Date(isoString);
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
      };
    };

    // 【補助関数】ISO文字列からHTMLの <input type="time"> が認識できる「時:分」の形式に変換する
    const formatToTimeInput = (isoString) => {
      if (!isoString) return "";
      const date = new Date(isoString);
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    };

    // 【補助関数】前日・翌日移動ボタンの活性/非活性判定
    // 1日の時は「前日」を、月末の時は「翌日」を押せないようにロックする
    const updateNavButtonStates = () => {
      const prevBtn = document.getElementById("btn_prev_day");
      const nextBtn = document.getElementById("btn_next_day");
      if (!currentModalDate || !displayPeriodInput.value) return;

      const [targetYear, targetMonth] = displayPeriodInput.value.split("-").map(Number);
      const lastDayNum = new Date(targetYear, targetMonth, 0).getDate();
      const currentDayNum = currentModalDate.getDate();

      if (prevBtn) {
        prevBtn.disabled = currentDayNum === 1;
      }
      if (nextBtn) {
        nextBtn.disabled = currentDayNum === lastDayNum;
      }
    };

    // 【補助関数】日付切り替え時のモーダル内データ再読込
    // モーダルを開いたまま「前日」や「翌日」へ移動した際、中身のデータを次の日のものに差し替える
    const updateModalDate = async (offset) => {
      if (!currentModalDate || !displayPeriodInput.value) return;

      const [targetYear, targetMonth] = displayPeriodInput.value.split("-").map(Number);
      const nextDate = new Date(currentModalDate);
      nextDate.setDate(nextDate.getDate() + offset);

      // 月をまたぐ移動はバグの元になるためブロックする
      if (nextDate.getFullYear() !== targetYear || nextDate.getMonth() + 1 !== targetMonth) {
        return;
      }

      // 移動先の日付が「本日かつ打刻中」なら移動を阻止する
      const nextDayNum = nextDate.getDate();
      const today = new Date();
      const isNextDayToday = year === today.getFullYear() && month === today.getMonth() + 1 && nextDayNum === today.getDate();

      // 移動ボタンを押した時と同じ window.isUserWorking() で厳密にチェック
      const isNextDayWorking = isNextDayToday ? await window.isUserWorking() : false;

      // 移動先の日付のレコードを取得
      const nextDayRecord = recordMap ? recordMap.get(nextDayNum) : null;
      // この日（今日）すでに通常打刻（button）されたデータがあるかチェック
      const hasNextDayClocked = isNextDayToday && nextDayRecord && nextDayRecord.registration_mode === "button";
      // 通常打刻があっても、まだ退勤していない（finished 以外）ときだけロック対象にする
      const isNextDayNotFinishedYet = nextDayRecord && nextDayRecord.status !== "finished";

      // 「現在出勤中」または「今日通常打刻があって、まだ退勤していない」ならブロック
      if (isNextDayWorking || (hasNextDayClocked && isNextDayNotFinishedYet)) {
        // 退勤ステータスに合わせてメッセージを親切に変更
        const msg = "本日は現在打刻中のため、移動・編集はできません。\n退勤後に編集が可能になります。";

        window.showToast(msg, "error");
        return;
      }

      deletedExpenseIds = [];
      currentModalDate.setDate(currentModalDate.getDate() + offset);

      const newDayNum = currentModalDate.getDate();
      const newRecord = recordMap.get(newDayNum);
      currentModalRecord = newRecord;

      // 新しい日付のデータを入力欄に流し込む
      fillModalFields(newRecord, currentModalDate, recordMap);

      // モーダル上部のヘッダータイトル（◯月◯日(曜)）を更新
      const editDateEl = document.getElementById("display_edit_date");
      if (editDateEl) {
        if (newRecord?.view_date_str) {
          editDateEl.textContent = `${currentModalDate.getFullYear()}年${newRecord.view_date_str}`;
        } else {
          const hName = holidays[currentModalDate.getDate()];
          let fallbackStr = `${currentModalDate.getMonth() + 1}月${currentModalDate.getDate()}日（${weekDays[currentModalDate.getDay()]}`;
          fallbackStr += hName ? (hName.includes("振替休日") ? "・振）" : "・祝）") : "）";
          editDateEl.textContent = `${currentModalDate.getFullYear()}年${fallbackStr}`;
        }
      }

      // 「元々の打刻データ（修正前）」の表示情報を更新
      const inData = formatToBadgeDisplay(newRecord?.original_clock_in);
      const outData = formatToBadgeDisplay(newRecord?.original_clock_out);

      const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setTxt("display_original_date_in", inData.date);
      setTxt("display_original_clock_in", inData.time);
      setTxt("display_original_date_out", outData.date);
      setTxt("display_original_clock_out", outData.time);
      setTxt(
        "display_updated_at",
        newRecord?.updated_at
          ? `${currentModalDate.getFullYear()}/${String(currentModalDate.getMonth() + 1).padStart(2, "0")}/${String(newDayNum).padStart(2, "0")} ${new Date(newRecord.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
          : "-",
      );
      updateNavButtonStates();
    };

    // 前日・翌日ボタンにクリックイベントを設定
    const prevBtn = document.getElementById("btn_prev_day");
    const nextBtn = document.getElementById("btn_next_day");
    if (prevBtn) prevBtn.onclick = () => updateModalDate(-1);
    if (nextBtn) nextBtn.onclick = () => updateModalDate(1);

    // ◆ カレンダー各行の「編集」ボタンが押された時の処理
    document.querySelectorAll(".btn-table-edit").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const dayStr = e.target.getAttribute("data-day");
        let dayNum = parseInt(dayStr);
        const record = recordMap.get(dayNum);

        // 今日、かつ未退勤のときだけアラートを出す
        const todayNum = new Date().getDate();
        const isToday = year === new Date().getFullYear() && month === new Date().getMonth() + 1 && dayNum === todayNum;

        // 2. 正しい関数名 window.isUserWorking() を「await」付きで呼び出す
        const isStillWorkingToday = isToday ? await window.isUserWorking() : false;

        // この日（今日）すでに通常打刻（button）されたデータがあるかチェック
        const hasClockedToday = isToday && record && record.registration_mode === "button";

        // 通常打刻があっても、まだ退勤していない（finished 以外）ときだけロック対象にする
        const isNotFinishedYet = record && record.status !== "finished";

        // 「現在出勤中」または「今日通常打刻があって、まだ退勤していない」ならブロック
        if (isStillWorkingToday || (hasClockedToday && isNotFinishedYet)) {
          window.showToast("本日は現在打刻中のため、編集できません。\n退勤後に編集が可能になります。", "error");
          return; // モーダルを開かない
        }

        // モーダルを開いた瞬間の初期状態をセット
        currentModalRecord = record;
        deletedExpenseIds = [];

        const modalEl = document.getElementById("attendanceEditModal");
        if (!modalEl) return;

        const dateObj = new Date(year, month - 1, dayNum);
        currentModalDate = dateObj;

        // --- モーダル内の表示テキスト（日付）の初期化 ---
        const editDateEl = document.getElementById("display_edit_date");
        if (editDateEl) {
          // record が存在し、かつ view_date_str を持っている場合のみ使用
          if (record && record.view_date_str) {
            editDateEl.textContent = `${year}年${record.view_date_str}`;
          } else {
            // ✨ record が undefined（消去後）でもクラッシュしないように安全にフォールバックを組み立てる
            const holidayName = holidays ? holidays[dayNum] : null;
            const dayOfWeekNum = dateObj.getDay();
            const dayOfWeekStr = weekDays ? weekDays[dayOfWeekNum] : ["日", "月", "火", "水", "木", "金", "土"][dayOfWeekNum];

            let fallbackStr = `${month}月${dayNum}日（${dayOfWeekStr}`;
            fallbackStr += holidayName ? (holidayName.includes("振替休日") ? "・振）" : "・祝）") : "）";
            editDateEl.textContent = `${year}年${fallbackStr}`;
          }
        }

        // --- 各入力要素（input / select）への既存データの割り当て ---
        const workTypeSelect = document.getElementById("edit_work_type");
        if (workTypeSelect) {
          workTypeSelect.value = record?.work_type || "normal";
        }

        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.value = val;
        };

        setVal("edit_clock_in", record?.clock_in ? formatToTimeInput(record.clock_in) : "");
        setVal("edit_clock_out", record?.clock_out ? formatToTimeInput(record.clock_out) : "");
        setVal("edit_memo", record?.memo || "");
        setVal("edit_break_start", record?.break_start ? formatToTimeInput(record.break_start) : "");
        setVal("edit_break_end", record?.break_end ? formatToTimeInput(record.break_end) : "");

        // 勤務区分に応じた入力項目の活性・非活性制御
        toggleModalInputsByWorkType(workTypeSelect?.value || "normal");

        // 他の初期化や自動計算が走りきったあとに、満を持してDBの休憩時間をセットする
        setVal("total_break_m", record?.total_break_m || "");

        // 勤務区分を変更した時にリアルタイムで入力制限が切り替わるようにイベント登録
        if (workTypeSelect) {
          workTypeSelect.removeEventListener("change", handleWorkTypeChange);
          workTypeSelect.addEventListener("change", handleWorkTypeChange);
        }
        function handleWorkTypeChange(ev) {
          toggleModalInputsByWorkType(ev.target.value);
        }

        // 修正前のオリジナル打刻時間のセット
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

        // 最終更新日時のセット
        const formatToFullDisplay = (isoString) => {
          if (!isoString) return "-";
          const date = new Date(isoString);
          return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        };
        setTxt("display_updated_at", formatToFullDisplay(record?.updated_at));

        // --- 経費データの読み込みと行生成 ---
        const expenseList = document.getElementById("expense_list");
        if (expenseList) expenseList.innerHTML = "";

        if (record?.expense_records && Array.isArray(record.expense_records) && record.expense_records.length > 0) {
          record.expense_records.forEach((item) => {
            // 論理削除（is_active === false）されていない有効なデータのみ画面に表示
            if (item.is_active !== false) {
              addExpenseRow({
                id: item.id,
                category: item.expense_type,
                detail: item.memo,
                amount: item.amount,
              });
            }
          });
        }

        // 経費データが1件もない場合は、最初から空の入力行を1行置いておく
        if (!expenseList || expenseList.children.length === 0) {
          addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
        }

        // 時間計算とナビゲーションボタンの状態を最新にする
        calculateAttendance();
        updateNavButtonStates();

        // --- 保存ボタンの制御（重要：多重登録防止） ---
        const saveButton = document.getElementById("attendance_save_btn");
        if (saveButton) {
          const newSaveButton = saveButton.cloneNode(true);
          saveButton.parentNode.replaceChild(newSaveButton, saveButton);

          newSaveButton.disabled = false;
          newSaveButton.textContent = "保存";

          // 新しくリセットされた保存ボタンに、非同期の保存処理を登録
          newSaveButton.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            newSaveButton.disabled = true; // 連打防止のために即座にボタンを無効化
            newSaveButton.textContent = "保存中...";

            try {
              // 画面上の最新の入力値を取得
              const clockInTime = document.getElementById("edit_clock_in").value;
              const clockOutTime = document.getElementById("edit_clock_out").value;
              const breakTimeM = parseInt(document.getElementById("total_break_m").value) || 0;
              const memo = document.getElementById("edit_memo").value;
              const breakStart = document.getElementById("edit_break_start").value;
              const breakEnd = document.getElementById("edit_break_end").value;
              const workType = document.getElementById("edit_work_type").value;

              // 通常勤務で「出勤」と「退勤」が両方未入力の場合を弾くガード ---
              if ((workType === "normal" || workType === "regular") && !clockInTime && !clockOutTime) {
                window.showToast("出勤時間と退勤時間が入力されていません。", "error");

                // ボタンを元の状態に戻して保存処理を中断
                newSaveButton.disabled = false;
                newSaveButton.textContent = "保存";
                return;
              }

              // 退勤時間のみの入力を弾くバリデーション
              // 通常勤務やシフトなどで、出勤が空なのに退勤だけが入力されている場合
              if ((workType === "normal" || workType === "regular") && !clockInTime && clockOutTime) {
                window.showToast("出勤時間が入力されていません。\n出勤時間を先に入力してください。", "error");

                // ボタンを元の状態に戻して処理を中断
                newSaveButton.disabled = false;
                newSaveButton.textContent = "保存";
                return;
              }

              // 入力された「時:分」を、現在編集中の「年月日」と組み合わせて完全なISOタイムスタンプ（日時）を作る補助関数
              const createIsoString = (timeStr) => {
                if (!timeStr) return null;
                const [hours, minutes] = timeStr.split(":");
                return new Date(
                  currentModalDate.getFullYear(),
                  currentModalDate.getMonth(),
                  currentModalDate.getDate(),
                  parseInt(hours),
                  parseInt(minutes),
                ).toISOString();
              };

              const targetDateStr = `${currentModalDate.getFullYear()}-${String(currentModalDate.getMonth() + 1).padStart(2, "0")}-${String(currentModalDate.getDate()).padStart(2, "0")}`;
              const currentNowIso = new Date().toISOString();

              // 画面の入力状態から、DBに保存すべき正しいステータスを自動判定する
              let calculatedStatus = "not_started"; // 初期値：未出勤
              if (clockOutTime) {
                calculatedStatus = "finished"; // 退勤時間があれば「退勤済」
              } else if (clockInTime) {
                calculatedStatus = "working"; // 出勤時間だけなら「出勤中」
              }

              const isoClockIn = createIsoString(clockInTime);
              const isoClockOut = createIsoString(clockOutTime);

              // 1. オリジナル出勤日時（最初に出勤データが登録された実時刻）の決定
              let finalOriginalClockIn = currentModalRecord?.original_clock_in;

              // DBにまだ過去の登録記録がなく、かつ「今回出勤時間が入力されている」なら、今この瞬間を登録時刻とする
              if (!finalOriginalClockIn && clockInTime) {
                finalOriginalClockIn = currentNowIso;
              }

              // 2. オリジナル退勤日時（最初に退勤データが登録された実時刻）の決定
              let finalOriginalClockOut = currentModalRecord?.original_clock_out;

              // DBにまだ過去の登録記録がなく、かつ「今回退勤時間が入力されている」なら、今この瞬間を登録時刻とする
              if (!finalOriginalClockOut && clockOutTime) {
                finalOriginalClockOut = currentNowIso;
              }

              // 外出開始・終了のISO文字列を生成
              const isoBreakStart = createIsoString(breakStart);
              const isoBreakEnd = createIsoString(breakEnd);

              const upsertData = {
                user_id: user.id,
                work_date: targetDateStr,
                work_type: workType,
                clock_in: isoClockIn,
                clock_out: isoClockOut,
                status: calculatedStatus,
                total_break_m: breakTimeM,
                break_start: isoBreakStart,
                break_end: isoBreakEnd,
                memo: memo,
                original_clock_in: finalOriginalClockIn,
                original_clock_out: finalOriginalClockOut,
                registration_mode: "modal",
                is_active: true,
                updated_at: currentNowIso,
              };

              // すでにDBに存在するデータの修正なら、その一意のIDを指定して上書き(Upsert)させる
              if (currentModalRecord?.id) {
                upsertData.id = currentModalRecord.id;
              }

              // Step1: 勤怠親データの保存
              const { data: savedAttendance, error: attendanceError } = await supabase
                .from("attendance_data")
                .upsert(upsertData, { onConflict: "id" })
                .select()
                .single();

              if (attendanceError) throw attendanceError;

              // Step2: 紐づく子データ（経費レコード）の保存準備
              const parentAttendanceId = savedAttendance.id;
              const expenseRows = document.querySelectorAll("#expense_list .expense-notebook-row");
              const expenseRecordsToUpsert = [];
              const activeRowDbIds = new Set();

              // 各経費の入力行をループしてデータを取り出す
              expenseRows.forEach((row) => {
                const dbId = row.getAttribute("data-db-id");
                const categoryEl = row.querySelector(".expense-notebook-select");
                const amountEl = row.querySelector(".expense-notebook-amount-field");
                const detailEl = row.querySelector(".expense-notebook-input");

                const amountValue = amountEl ? parseInt(amountEl.value, 10) || 0 : 0;
                const categoryValue = categoryEl ? categoryEl.value.trim() : "";
                const detailValue = detailEl ? detailEl.value.trim() : "";

                // 金根が有効（金額 > 0）なものだけ保存
                if (amountValue > 0) {
                  const finalDbId = dbId && dbId.trim() !== "" ? dbId.trim() : null;
                  const fallbackUUID = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                    const r = (Math.random() * 16) | 0;
                    const v = c === "x" ? r : (r & 0x3) | 0x8;
                    return v.toString(16);
                  });

                  const recordId = finalDbId || fallbackUUID;
                  if (finalDbId) {
                    activeRowDbIds.add(finalDbId);
                  }

                  expenseRecordsToUpsert.push({
                    id: recordId,
                    attendance_id: parentAttendanceId,
                    user_id: user.id,
                    expense_date: targetDateStr,
                    expense_type: categoryValue,
                    memo: detailValue,
                    amount: amountValue,
                    is_active: true,
                    updated_at: currentNowIso,
                  });
                }
              });

              // ========================================================
              // 論理削除対象（ゴミ箱）の最終決定
              // ========================================================
              // もともとこのレコードに紐づいていた既存の経費レコードのうち、
              // 今回の画面上から消えてしまった（金額0になった、有休切替で消えた、行が削除された）IDを論理削除対象にする
              const finalDeleteIds = [];

              // ① ユーザーが手動で削除ボタンを押して蓄積されたID
              if (deletedExpenseIds && deletedExpenseIds.length > 0) {
                deletedExpenseIds.forEach((id) => finalDeleteIds.push(id));
              }

              // ② DBに存在していたが、有休切り替えや入力値クリアによって画面上に残らなくなった既存IDを自動回収
              if (currentModalRecord?.expense_records) {
                currentModalRecord.expense_records.forEach((orig) => {
                  if (orig.is_active !== false && orig.id && !activeRowDbIds.has(orig.id)) {
                    if (!finalDeleteIds.includes(orig.id)) {
                      finalDeleteIds.push(orig.id);
                    }
                  }
                });
              }

              // ========================================================
              // 経費データのクリーンアップ＆保存処理
              // ========================================================
              // Step1: 検出された経費を一括で論理削除（is_active = false）
              if (finalDeleteIds.length > 0) {
                console.log("🗑️ 削除された経費を無効化中...", finalDeleteIds);
                const { error: deleteError } = await supabase
                  .from("expense_records")
                  .update({
                    is_active: false,
                    updated_at: currentNowIso,
                  })
                  .in("id", finalDeleteIds);

                if (deleteError) throw deleteError;
                console.log("✅ 経費の論理削除が成功しました！");
              }

              // Step2: 新しい経費データの保存
              if (expenseRecordsToUpsert.length > 0) {
                console.log("🚀 Supabaseに送信する直前の経費データの中身:", expenseRecordsToUpsert);
                const { error: expenseError } = await supabase.from("expense_records").upsert(expenseRecordsToUpsert, { onConflict: "id" });

                if (expenseError) throw expenseError;
                console.log("✅ 経費のUpsertが成功しました！");
              }

              // Step 3: モーダルのクローズと画面の再読込
              deletedExpenseIds = [];
              const bootstrapModal = bootstrap.Modal.getInstance(modalEl);
              if (bootstrapModal) bootstrapModal.hide();

              // 1. 画面上のカレンダー・一覧テーブルを再読込
              await handlePeriodChange();

              // 2. 🔔 打刻漏れデータの再チェックと通知バッジ更新を即座に実行
              setTimeout(async () => {
                const currentUserId = (typeof targetUser !== "undefined" && targetUser) ? targetUser.id : window.currentUserId;

                if (typeof window.checkForgottenClockOut === "function") {
                  // 再判定 -> notificationsテーブル更新 -> fetchNotifications まで自動で行われます
                  await window.checkForgottenClockOut(currentUserId);
                } else if (typeof window.fetchNotifications === "function") {
                  await window.fetchNotifications(currentUserId);
                }
              }, 100);
            } catch (err) {
              console.error("❌ 保存処理でエラーが発生しました:", err);
              window.showToast("保存に失敗しました。時間をおいて再度お試しください。", "error");
              newSaveButton.disabled = false;
              newSaveButton.textContent = "保存";
            }
          });
        }

        // ==========================================
        // 2段構えのリセット・消去モーダル制御
        // ==========================================
        const editModalEl = document.getElementById("attendanceEditModal");
        const discardModalEl = document.getElementById("discardConfirmModal");

        // ◆ メイン画面の「データをリセット」ボタンを押した時の処理
        const resetButton = document.getElementById("attendance_reset_btn");
        resetButton.onclick = () => {
          if (!record || !record.id) {
            return window.showToast("リセットするデータがありません", "error");
          }

          let dateDisplay = record.view_date_str || "この日";

          const modalDateSpan = document.getElementById("discard_modal_date");
          if (modalDateSpan) {
            modalDateSpan.textContent = dateDisplay;
          }

          //// 時間差（150ms）をつけてモーダルを綺麗に切り替える演出制御
          editModalEl.classList.remove("show");
          setTimeout(() => {
            editModalEl.style.display = "none";
            discardModalEl.style.display = "block";
            requestAnimationFrame(() => {
              discardModalEl.classList.add("show");
            });
          }, 150);
        };

        // ◆ 確認画面：「キャンセル」で元の編集画面に戻る処理
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

        // ◆ 確認画面：「手入力をクリアして再入力」ボタンを押した時の処理
        const clearInputsBtn = document.getElementById("btn_clear_inputs");
        clearInputsBtn.onclick = () => {
          // Step1: 各種勤務時間・メモ入力欄のクリア
          document.getElementById("edit_work_type").value = "normal";
          document.getElementById("edit_clock_in").value = "";
          document.getElementById("edit_clock_out").value = "";
          document.getElementById("total_break_m").value = "";
          document.getElementById("edit_break_start").value = "";
          document.getElementById("edit_break_end").value = "";
          document.getElementById("edit_memo").value = "";

          // Step2: 現在画面にある全ての経費行のIDをゴミ箱に退避し、リストを初期化
          const expenseList = document.getElementById("expense_list");
          if (expenseList) {
            const expenseRows = expenseList.querySelectorAll(".expense-notebook-row");
            expenseRows.forEach((row) => {
              const dbId = row.getAttribute("data-db-id");
              if (dbId && dbId.trim() !== "" && !deletedExpenseIds.includes(dbId)) {
                deletedExpenseIds.push(dbId);
              }
            });

            expenseList.innerHTML = "";

            // デフォルトの空行を1行再生成しておく
            if (typeof addExpenseRow === "function") {
              addExpenseRow({ id: null, category: "交通費", detail: "", amount: "" });
            }
          }

          // Step3: 入力制限の解除と時間・金額の再計算
          toggleModalInputsByWorkType("normal");
          calculateAttendance();

          window.showToast("手入力をクリアしました。グレーの打刻時間を参考に再入力してください。", "success");
          cancelBtn.click();
        };

        // ◆ 確認画面：「この日の記録を完全消去」ボタンを押した時の処理
        const completelyDeleteBtn = document.getElementById("btn_completely_delete");
        completelyDeleteBtn.onclick = async (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }

          try {
            if (!record || !record.id) {
              return window.showToast("消去するデータがありません", "error");
            }

            let dateDisplay = record.view_date_str || "この日";

            // Step1: 勤怠親データを論理削除
            const { error: attendanceError } = await supabase.from("attendance_data").update({ is_active: false }).eq("id", record.id);
            if (attendanceError) throw attendanceError;

            // Step2: 紐づく経費子データをすべて論理削除
            const { error: expenseError } = await supabase
              .from("expense_records")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("attendance_id", record.id);
            if (expenseError) throw expenseError;

            window.showToast(`${dateDisplay}の記録（経費含む）を完全に消去しました。`, "success");

            // 確認モーダルを非表示にする
            discardModalEl.classList.remove("show");
            discardModalEl.style.display = "none";

            // 編集モーダルも確実に非表示にする
            if (editModalEl) {
              editModalEl.classList.remove("show");
              editModalEl.style.display = "none";
              const editBootstrapModal = bootstrap.Modal.getInstance(editModalEl);
              if (editBootstrapModal) editBootstrapModal.hide();
            }

            // Bootstrapの背景の黒幕（ backdrop ）を徹底的に除去して画面のフリーズを防ぐ
            document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
            document.body.classList.remove("modal-open");
            document.body.style.overflow = "";
            document.body.style.paddingRight = "";

            // ゴミ箱をクリア
            if (typeof deletedExpenseIds !== "undefined") {
              deletedExpenseIds = [];
            }

            // 少しだけ待ってから画面を同期的に再読込する
            // 完全消去処理の末尾付近
            setTimeout(async () => {
              await handlePeriodChange();

              // 🔔 消去完了後にベルマーク通知を最新化
              if (typeof window.fetchNotifications === "function") {
                const currentUserId = (typeof targetUser !== "undefined" && targetUser) ? targetUser.id : window.currentUserId;
                await window.fetchNotifications(currentUserId);
              }
            }, 100);
          } catch (e) {
            console.error("❌ 完全消去処理でエラーが発生しました:", e);
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

  // ★ 1. 休憩時間のフォーカス離脱時ハンドラー（未変換ひらがな等のクレンジング）
  function handleBreakBlur(e) {
    const cleanVal = sanitizeToDigits(e.target.value);
    if (e.target.value !== cleanVal) {
      e.target.value = cleanVal;
    }
    calculateAttendance();
  }

  // ★ 2. 入力時の共通ハンドラー関数（リアルタイム計算・確定後の文字クレンジング）
  function handleAttendanceInput(e) {
    // IME（日本語入力）の変換中は処理しない（確定後にサニタイズを実行）
    if (e.isComposing) return;

    // 合計休憩時間（total_break_m）に入力があった場合、リアルタイムサニタイズ（全角→半角・数字以外除去）を実施
    if (e.target.id === "total_break_m") {
      const cleanVal = sanitizeToDigits(e.target.value);
      if (e.target.value !== cleanVal) {
        e.target.value = cleanVal;
      }
    }

    // 勤務時間の自動再計算を実行
    calculateAttendance();
  }

  // ◆ 各種入力項目に対するリアルタイム計算リスナーの登録
  function attachAttendanceCalculationListeners() {
    const targetIds = ["edit_clock_in", "edit_clock_out", "total_break_m", "edit_break_start", "edit_break_end"];

    targetIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      // 二重登録を防止するために一度イベントを削除してから再登録
      el.removeEventListener("input", handleAttendanceInput);
      el.addEventListener("input", handleAttendanceInput);

      // 休憩時間（total_break_m）の場合はフォーカス離脱（blur）時もサニタイズを実施
      if (id === "total_break_m") {
        el.removeEventListener("blur", handleBreakBlur);
        el.addEventListener("blur", handleBreakBlur);
      }
    });
  }

  // ◆ 労働時間および時間外（残業）時間の自動計算処理
  // 【目的】出退勤時間や各種休憩時間（固定・外出）を基に、正確な合計勤務時間を割り出す
  function calculateAttendance() {
    const inVal = document.getElementById("edit_clock_in")?.value;
    const outVal = document.getElementById("edit_clock_out")?.value;
    const breakVal = parseInt(document.getElementById("total_break_m")?.value) || 0;
    const breakStart = document.getElementById("edit_break_start")?.value;
    const breakEnd = document.getElementById("edit_break_end")?.value;

    // 有給・欠勤時は計算を行わず結果を強制クリアするガード処理
    const workType = document.getElementById("edit_work_type")?.value;
    if (workType === "paid" || workType === "absent") {
      document.getElementById("calc_total_work").textContent = "0時間0分";
      document.getElementById("calc_overtime").textContent = "0時間0分";
      return;
    }

    if (!inVal || !outVal) {
      document.getElementById("calc_total_work").textContent = "--:--";
      document.getElementById("calc_overtime").textContent = "-";
      return;
    }

    // 時間文字列（hh:mm）を計算用の通算「分」に変換するインライン関数
    const toM = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    // Step1: 外出（休憩）時間の差分計算
    let outingStartM = breakStart ? toM(breakStart) : 0;
    let outingEndM = breakEnd ? toM(breakEnd) : 0;
    // 外出も日をまたぐケースを考慮
    if (breakStart && breakEnd && outingEndM < outingStartM) {
      outingEndM += 24 * 60;
    }
    const outingM = breakStart && breakEnd ? Math.max(0, outingEndM - outingStartM) : 0;

    // Step2: 総労働時間の算出（日またぎ対応）
    const inM = toM(inVal);
    let outM = toM(outVal);

    // ★ 退勤時間が出勤時間より前の場合は翌日（+24時間 = +1440分）として計算
    if (outM < inM) {
      outM += 24 * 60;
    }

    const totalM = Math.max(0, outM - inM - breakVal - outingM);

    // Step3: 法定外残業時間の算出（総労働から8時間＝480分を引く）
    const overtimeM = Math.max(0, totalM - 8 * 60);

    // 計算された「分」を表示用の文字列にフォーマットするインライン関数
    const fmt = (m) => (m > 0 ? `${Math.floor(m / 60)}時間${m % 60}分` : "-");

    document.getElementById("calc_total_work").textContent = totalM > 0 ? `${Math.floor(totalM / 60)}時間${totalM % 60}分` : "0時間0分";
    document.getElementById("calc_overtime").textContent = fmt(overtimeM);

    // 外出時間表示エリア（存在する場合のみ）への連動反映
    const calcOutingEl = document.getElementById("calc_outing_work");
    if (calcOutingEl) {
      calcOutingEl.textContent = fmt(outingM);
    }
  }

  // ◆ 経費入力行の動的HTML生成と追加処理
  // 【目的】モーダル内に新しい経費入力枠（1行分）を動的に組み立てて追加する
  function addExpenseRow(data = { id: null, category: "transportation", detail: "", amount: "" }) {
    const expenseList = document.getElementById("expense_list");
    if (!expenseList) return;

    // 新規追加データ用にクライアント側で一意のUUIDを即時生成する関数
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

    div.className = "d-flex flex-column p-2 rounded-2 shadow-sm expense-notebook-row position-relative";
    div.id = rowId;
    div.setAttribute("data-db-id", expenseId);

    // データベース仕様（英字値）に合わせた初期値の選択（selected）判定
    const currentCategory = data.category || "transportation";
    const isTransport = currentCategory === "transportation" || currentCategory === "交通費" ? "selected" : "";
    const isOther = currentCategory === "other" || currentCategory === "その他" ? "selected" : "";

    div.innerHTML = `
        <div class="d-flex align-items-center justify-content-start gap-3 w-100 m-0 p-0">
        <select class="form-select form-select-sm expense-notebook-select" 
                style="width: 120px !important; height: 32px !important; background-color: #ffffff !important; color: #2b2c3a !important; font-size: 0.875rem !important; font-weight: 500 !important; border: 1px solid #ced4da !important; display: inline-block !important;">
          <option value="transportation" ${isTransport}>交通費</option>
          <option value="other" ${isOther}>その他</option>
        </select>

      <div class="d-flex align-items-center bg-transparent border-bottom expense-notebook-amount-wrap">
          <input type="number" class="form-control form-control-sm border-0 p-0 text-end bg-transparent fw-bold expense-notebook-amount-field" 
                 placeholder="0" min="0" inputmode="numeric" pattern="[0-9]*" value="${data.amount ?? ""}">
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

    // Bootstrapコンポーネントのインラインデザイン微調整
    const selectEl = div.querySelector(".expense-notebook-select");
    if (selectEl) {
      selectEl.style.setProperty("line-height", "normal", "important");
      selectEl.style.setProperty("padding", "0px 24px 0px 8px", "important");
    }

    // 金額入力時のリアルタイムサニタイズと合計金額自動計算イベントを登録
    const amountInput = div.querySelector(".expense-notebook-amount-field");
    if (amountInput) {
      // 全角入力（IME）の判定を確実にするため属性を調整
      amountInput.setAttribute("type", "text");
      amountInput.setAttribute("inputmode", "numeric");
      amountInput.setAttribute("maxlength", "7"); // HTML側でも7桁制限を設定

      // 金額制限（最大9,999,999円・7桁）を適用する関数
      const applyAmountLimits = (inputEl) => {
        let cleanVal = sanitizeToDigits(inputEl.value);

        // 7桁を超えたらカット
        if (cleanVal.length > 7) {
          cleanVal = cleanVal.slice(0, 7);
        }

        // 9,999,999円を超えたら補正
        if (parseInt(cleanVal, 10) > 9999999) {
          cleanVal = "9999999";
        }

        return cleanVal;
      };

      // 入力中の処理（確定済みの値のみリアルタイム処理）
      amountInput.addEventListener("input", (e) => {
        if (e.isComposing) return;

        const limitedVal = applyAmountLimits(e.target);
        if (e.target.value !== limitedVal) {
          e.target.value = limitedVal;
        }
        calculateTotalExpense();
      });

      // フォーカス離脱時（カーソルを離した時）に全角数字・未確定文字を半角数字へ正規化＋上限チェック
      amountInput.addEventListener("blur", (e) => {
        const limitedVal = applyAmountLimits(e.target);
        if (e.target.value !== limitedVal) {
          e.target.value = limitedVal;
        }
        calculateTotalExpense();
      });
    }

    // 行内の「×」ボタンクリック時の行削除、および論理削除リストへの退避処理
    div.querySelector(".btn-delete-expense").addEventListener("click", () => {
      const dbId = div.getAttribute("data-db-id");

      if (dbId && typeof deletedExpenseIds !== "undefined") {
        deletedExpenseIds.push(dbId);
      }

      div.remove();
      if (typeof calculateTotalExpense === "function") calculateTotalExpense();
    });

    expenseList.appendChild(div);
    calculateTotalExpense();
  }

  // ◆ モーダル内経費金額の合計値集計処理
  // 【目的】現在表示されているすべての経費入力欄の値を合計し、3桁カンマ区切りで画面に表示する
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

  // ◆ 「＋追加」ボタンに対する初期クリックリスナーの紐付け
  // 【目的】二重登録によるバグを防止するため、既存リスナーを一度リセットした上で新規登録を行う
  function initExpenseCalculationListeners() {
    const addBtn = document.querySelector(".expense-add-btn");

    if (addBtn) {
      addBtn.removeEventListener("click", handleExpenseAddClick);
      addBtn.addEventListener("click", handleExpenseAddClick);
    }
  }

  // ◆ 経費追加ボタンがクリックされた時の実イベント処理
  function handleExpenseAddClick(e) {
    e.preventDefault();
    e.stopPropagation();

    addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
  }

  // ◆ カレンダー表示モード専用の制御ロジック
  // 画面切り替えのイベントをバインドする関数
  function setupViewModeSwitchEvents() {
    const btnList = document.getElementById("view_mode_list");
    const btnCalendar = document.getElementById("view_mode_calendar");
    const wrapperList = document.getElementById("list_view_wrapper");
    const wrapperCalendar = document.getElementById("calendar_view_wrapper");
    const cardList = document.getElementById("attendance_card_list");

    if (!btnList || !btnCalendar) {
      console.error("切り替えボタンが見つかりません。HTMLのIDを確認してください。");
      return;
    }

    // 一覧ボタンクリック時
    btnList.onclick = (e) => {
      if (e) e.preventDefault();
      btnList.classList.add("active");
      btnCalendar.classList.remove("active");

      if (wrapperList) wrapperList.classList.remove("d-none");
      if (wrapperCalendar) wrapperCalendar.classList.add("d-none");
      if (cardList) cardList.classList.add("d-none");
    };

    // カレンダーボタンクリック時
    btnCalendar.onclick = (e) => {
      if (e) e.preventDefault();
      btnCalendar.classList.add("active");
      btnList.classList.remove("active");

      if (wrapperList) wrapperList.classList.add("d-none");
      if (wrapperCalendar) wrapperCalendar.classList.remove("d-none");
      if (cardList) cardList.classList.add("d-none");
    };
  }

  // ◆ JavaScript側の生成クラス名も at- 付きに修正
  function renderCalendarGrid(year, month, holidays, recordMap, targetUser, loginUser) {
    const grid = document.getElementById("calendar_grid");
    if (!grid) return;
    grid.innerHTML = ""; // クリア

    const isMyData = loginUser && targetUser && loginUser.id === targetUser.id;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const blankDays = firstDay.getDay();

    // STEP1. 前月の空マスを生成
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = 0; i < blankDays; i++) {
      const blankBox = document.createElement("div");
      blankBox.className = "at-calendar-day-box out-of-month";
      const dayNum = prevMonthLastDay - (blankDays - 1 - i);
      blankBox.innerHTML = `
      <div class="at-calendar-day-header">
        <span class="at-calendar-day-num">${dayNum}</span>
      </div>
      `;
      grid.appendChild(blankBox);
    }

    // STEP2. 1日から月末までループ生成
    const totalDays = lastDay.getDate();
    for (let day = 1; day <= totalDays; day++) {
      const currentBox = document.createElement("div");
      currentBox.className = "at-calendar-day-box";
      currentBox.style.cursor = "pointer"; // クリック可能であることを明示

      const dateObj = new Date(year, month - 1, day);
      const dayOfWeekNum = dateObj.getDay();
      const holidayName = holidays[day];
      const record = recordMap ? recordMap.get(day) : null;

      // 今日かつ勤務中かどうかの判定
      const today = new Date();
      const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();

      const isStillWorkingToday = isToday && record && record.clock_in && !record.clock_out;

      if (isStillWorkingToday) {
        currentBox.classList.add("is-working-now");
      }

      // 曜日・祝日ごとのクラス付与
      if (dayOfWeekNum === 6) currentBox.classList.add("is-saturday");
      if (dayOfWeekNum === 0) currentBox.classList.add("is-sunday");
      if (holidayName) currentBox.classList.add("is-holiday");

      const formatTime = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--");

      let timeLogHtml = '<span class="text-muted" style="font-size:0.75rem;">-</span>';
      let badgesHtml = "";

      if (record) {
        // ステータスに応じたクラスを付与
        if (record.work_type === "paid") {
          currentBox.classList.add("is-paid-leave");
          timeLogHtml = "";
        } else if (record.work_type === "absent") {
          currentBox.classList.add("is-absent");
          timeLogHtml = "";
        } else if (record.clock_in) {
          currentBox.classList.add("is-normal-work");

          if (record.clock_out) {
            // 退勤済
            timeLogHtml = `<span class="at-calendar-time-log">${formatTime(record.clock_in)} ～ ${formatTime(record.clock_out)}</span>`;
          } else {
            // 現在勤務中
            if (isStillWorkingToday) {
              timeLogHtml = `<span class="at-calendar-time-log fw-normal" style="color: #1e40af;">${formatTime(record.clock_in)} ～</span>`;
            } else {
              timeLogHtml = `<span class="at-calendar-time-log">${formatTime(record.clock_in)} ～</span>`;
            }
          }
        }

        // 経費・備考アイコンの判定
        if (record.expense_records && record.expense_records.filter((e) => e.is_active).length > 0) {
          badgesHtml += `<span class="badge-mini" title="経費あり"><i class="bi bi-cash-stack"></i>`;
        }
        if (record.memo) {
          badgesHtml += `<span class="badge-mini" title="${record.memo}"><i class="bi bi-chat-left-text"></i></span>`;
        }
      }

      // 祝日名の取得ロジック部分
      const holidayDisplay = holidayName || "";
      const holidayHtml = holidayName ? `<span class="at-holiday-name-mini" title="${holidayName}">${holidayDisplay}</span>` : "";

      // 今日かつ現在勤務中なら、日付のすぐ右隣にドットを配置する
      const dotHtml = isStillWorkingToday ? `<span class="pulsing-blue-dot" style="margin-left: 6px;"></span>` : "";

      // HTMLの構成を更新
      currentBox.innerHTML = `
        <div class="at-calendar-day-header" style="display: flex; align-items: center;">
          <span class="at-calendar-day-num ${isToday ? "is-today" : ""}">${day}</span>
          ${dotHtml}
          ${holidayHtml}
        </div>
        <div class="at-calendar-day-body">
          ${timeLogHtml}
        </div>
        <div class="at-calendar-day-footer">
          ${badgesHtml}
        </div>
      `;

      // マス全体にクリックイベントを付与
      currentBox.addEventListener("click", () => {
        // 通常打刻データ（button）があっても、退勤済（finished）ならブロックせずにスルーする
        const isNotFinishedYet = record && record.status !== "finished";
        const hasClockedButton = record && record.registration_mode === "button";

        // ★ 修正ポイント: ブロック対象を「“本日” かつ 打刻中（未退勤）」のデータのみに限定する
        if (isToday && (isStillWorkingToday || (hasClockedButton && isNotFinishedYet))) {
          if (typeof window.showToast === "function") {
            window.showToast("本日は現在打刻中のため、編集できません。\n退勤後に編集が可能になります。", "error");
          } else {
            alert("本日は現在打刻中のため、編集できません。\n退勤後に編集が可能になります。");
          }
          return;
        }

        const targetTableBtn = document.querySelector(`#attendance_tbody .btn-table-edit[data-day="${day}"]`);
        if (targetTableBtn) {
          targetTableBtn.click();
        } else {
          console.log("日付クリック:", day);
        }
      });

      grid.appendChild(currentBox);
    }

    // STEP3. 翌月の空マスを生成
    const totalCells = blankDays + totalDays;
    const remainingCells = Math.ceil(totalCells / 7) * 7 - totalCells;

    for (let i = 1; i <= remainingCells; i++) {
      const nextBox = document.createElement("div");
      nextBox.className = "at-calendar-day-box out-of-month";
      nextBox.innerHTML = `
      <div class="at-calendar-day-header">
        <span class="at-calendar-day-num">${i}</span>
      </div>
      `;
      grid.appendChild(nextBox);
    }

    setupViewModeSwitchEvents();
  }
}