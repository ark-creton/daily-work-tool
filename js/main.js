/**
 * メイン画面（main.html）専用の初期化関数
 */
async function initializeMainPage() {
  console.log("main.js: メイン画面専用の処理を開始します。");

  const dateDisplay = document.getElementById("current_date_display");
  const timeDisplay = document.getElementById("current_time_display");

  // ◆ 時計・日付パーツの自動起動処理
  if (dateDisplay && timeDisplay) {
    const weekDays = ["日", "月", "火", "水", "木", "金", "土"];

    // 現在の日時を取得して画面の文字を書き換える内部関数
    const updateClock = () => {
      const now = new Date();

      // 日付と曜日の表示を設定
      dateDisplay.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日(${weekDays[now.getDay()]})`;

      // 時・分・秒を常に2桁（01, 02...）に揃えて時計を表示
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

  // ◆ レポート作成モーダル関連の初期化処理
  // 【目的】日報レポートの新規作成や編集を行うモーダルが正しく動作するための準備とイベント設定を行う
  try {
    // Step1: 現在ログインしているAuthユーザーの情報を取得・同期
    if (typeof fetchAndSetLoginUser === "function") {
      await fetchAndSetLoginUser();
    }
    // Step2: モーダル内にある入力欄やボタンなどのDOMイベントをバインド
    if (typeof initializeReportModalLogic === "function") {
      initializeReportModalLogic();
    }
    // Step3: 新規作成ボタン (open-report-modal-btn) へのクリックイベント設定
    const mainNewBtn = document.getElementById("open-report-modal-btn");
    if (mainNewBtn) {
      // イベントの二重登録を防ぐために安全にクローンして再設定
      mainNewBtn.replaceWith(mainNewBtn.cloneNode(true));
      const cleanMainNewBtn = document.getElementById("open-report-modal-btn");

      cleanMainNewBtn.addEventListener("click", () => {
        // 新規作成時は過去に開いたレポートのIDと作成者名を完全にクリアする
        currentReportId = null;
        currentReportAuthorName = null;

        console.log("メイン画面の新規作成ボタンがクリックされました。");
        if (typeof openNewReportModal === "function") {
          openNewReportModal();
        }
      });
    }
  } catch (error) {
    console.error("レポートモーダルの初期化中にエラーが発生しました:", error);
  }

  // ◆ 打刻ボタンの連動・制御ロジック
  // 【目的】ユーザーの現在のステータス（出勤中・外出中など）に応じて、各打刻ボタンの有効・無効を正しく切り替える
  const statusLabel = document.getElementById("current_status_label");
  const clockInBtn = document.getElementById("clock_in_button");
  const clockOutBtn = document.getElementById("clock_out_button");
  const breakToggleBtn = document.getElementById("break_toggle_button");

  if (statusLabel && clockInBtn && clockOutBtn && breakToggleBtn) {
    const logArea = document.getElementById("recent_logs_area");

    // 【司令塔】現在のステータスを引数に受け取り、画面のバッジ色とボタンの活性・非活性を一括管理する関数
    const updateUI = (status) => {
      // どのケースでも共通して、データがあれば出勤ボタンを無効にする処理を入れます
      switch (status) {
        case "未打刻":
          statusLabel.textContent = "未打刻";
          statusLabel.className = "status-badge status-default";
          clockInBtn.disabled = false; // 出勤ボタン：押せる
          clockOutBtn.disabled = true; // 退勤ボタン：押せない
          breakToggleBtn.disabled = true; // 外出ボタン：押せない
          breakToggleBtn.textContent = "外出開始";
          break;
        case "出勤中":
          statusLabel.textContent = "出勤中";
          statusLabel.className = "status-badge status-working";
          clockInBtn.disabled = true; // 出勤ボタン：すでに押した状態（ロック）
          clockOutBtn.disabled = false; // 退勤ボタン：押せる
          breakToggleBtn.disabled = false; // 外出ボタン：押せる
          breakToggleBtn.textContent = "外出開始";
          break;
        case "外出中":
          statusLabel.textContent = "外出中";
          statusLabel.className = "status-badge status-break";
          clockInBtn.disabled = true; // 出勤ボタン：ロック
          clockOutBtn.disabled = true; // 退勤ボタン：外出中は押せないようにする
          breakToggleBtn.disabled = false; // 外出ボタン：押せる（「終了」にするため）
          breakToggleBtn.textContent = "外出終了";
          break;
        case "退勤済":
          statusLabel.textContent = "退勤済";
          statusLabel.className = "status-badge status-returned";
          clockInBtn.disabled = true; // 出勤ボタン：ロック
          clockOutBtn.disabled = true; // 退勤ボタン：ロック
          breakToggleBtn.disabled = true; // 外出ボタン：ロック
          break;
      }
    };

    // ◆ データベース（DB）同期とステータス復元処理
    // 【目的】ページを開いた（あるいはリロードした）際、今日の打刻データをDBから取得し、現在のユーザーの状態を画面に正しく復元する
    const restoreStateFromDB = async () => {
      try {
        // Step1: ログイン中のユーザー情報を取得
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // 今日の日付文字列（YYYY-MM-DD形式）を作成
        const today = new Date().toISOString().split("T")[0];

        // Step2: 今日の有効な（is_active: true）勤怠レコードをDBから1件だけ取得
        const { data: record } = await supabase
          .from("attendance_data")
          .select("*")
          .match({ user_id: user.id, work_date: today, is_active: true })
          .maybeSingle();

        const remarksInput = document.getElementById("today_remarks_input");
        const saveRemarksBtn = document.getElementById("btn_save_remarks");

        // Step3: 今日のレコードが存在する場合の表示・制御の復元
        if (record) {
          // 出勤時刻か退勤時刻のどちらかがすでに登録されているかどうかの判定フラグ
          const isAlreadyClocked = record.clock_in !== null || record.clock_out !== null;

          // 備考（メモ）が保存されている場合は入力欄に復元し、編集不可（ロック状態）にする
          if (remarksInput && saveRemarksBtn) {
            remarksInput.value = record.memo || "";
            if (record.memo) {
              remarksInput.disabled = true;
              saveRemarksBtn.textContent = "編集";
              saveRemarksBtn.style.backgroundColor = "#6c757d";
            }
          }

          // ========================================================
          // パターンA：勤怠画面側の「編集モーダル」から手動登録されたデータの場合
          // ========================================================
          if (record.registration_mode === "modal" && record.status === "working") {
            // 1. ステータスラベルを「出勤中」に変更
            statusLabel.textContent = "出勤中";
            statusLabel.className = "status-badge status-working";

            // 2. 通常打刻ミスを防ぐため、メイン画面側の「打刻ボタン」はすべてロック（操作不可）にする
            clockInBtn.disabled = true;
            clockInBtn.textContent = "打刻済";
            clockOutBtn.disabled = true;
            breakToggleBtn.disabled = true;
            breakToggleBtn.textContent = "外出開始";

            // ========================================================
            // パターンB：通常の打刻（画面の出勤・退勤ボタンなど）でデータがある場合
            // ========================================================
          } else {
            // 1. DBに保存されていたステータス（statusカラム）を元に、UI状態を一括復元
            if (record.status === "finished") updateUI("退勤済");
            else if (record.status === "going_out") updateUI("外出中");
            else if (record.status === "working") updateUI("出勤中");
            else updateUI("未打刻");

            // 2. すでに出退勤いずれかの通常打刻データがあれば「出勤ボタン」を打刻済としてロック
            if (isAlreadyClocked && clockInBtn) {
              clockInBtn.disabled = true;
              clockInBtn.textContent = "打刻済";
            }
          }

          // Step4: 今日のレコードがまだ存在しない（完全な未出勤状態）場合の初期化
        } else {
          updateUI("未打刻");
          if (remarksInput && saveRemarksBtn) {
            remarksInput.value = "";
            remarksInput.disabled = false;
            saveRemarksBtn.textContent = "保存";
            saveRemarksBtn.style.backgroundColor = "#8ea3c2";
          }
          // 古い一時ローカルキャッシュデータを完全に破棄
          const todayKey = `attendance_logs_${today}`;
          localStorage.removeItem(todayKey);
          localStorage.removeItem("attendance_state_data");
          if (logArea) logArea.value = "";
        }
      } catch (e) {
        console.error("DB同期エラー:", e);
      }
    };

    // ①【出勤ボタンのクリックイベント】
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

        // 1. 今日（is_active: true）のレコードがすでに存在するかチェック（備考の先行入力などのパターン対策）
        const { data: existingRecord } = await supabase
          .from("attendance_data")
          .select("id")
          .match({ user_id: user.id, work_date: todayStr, is_active: true })
          .maybeSingle();

        if (existingRecord) {
          // 先行レコード（備考のみ等）がある場合は、その行に出勤時刻を「上書き更新 (UPDATE)」する
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
          // レコードがない場合は、新規に今日の勤怠行を「作成 (INSERT)」する
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

        // カレンダー側の表示もリアルタイムで最新にするため再レンダリングを実行
        await renderCalendarInternal();

        // フロントUIを出勤中状態に変え、直近ログへ書き出す
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

    // ②【退勤ボタンのクリックイベント】
    clockOutBtn.addEventListener("click", async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const now = new Date();
        const nowIso = now.toISOString();
        const todayStr = nowIso.split("T")[0];

        // 1. 本日記録された出勤時刻を取得する
        const { data: currentRecord, error: fetchError } = await supabase
          .from("attendance_data")
          .select("clock_in")
          .match({ user_id: user.id, work_date: todayStr, is_active: true })
          .maybeSingle();

        if (fetchError) throw fetchError;

        // 2. 拘束時間（出勤から現在までの分数）を算出し、法律に準拠した自動休憩時間を判定
        let autoBreakM = 0;
        if (currentRecord && currentRecord.clock_in) {
          const clockInTime = new Date(currentRecord.clock_in);
          const diffMin = Math.floor((now - clockInTime) / (1000 * 60)); // 分単位の差

          if (diffMin > 9 * 60) {
            autoBreakM = 60; // 拘束9時間超 ➔ 60分休憩を適用
          } else if (diffMin > 6 * 60 + 45) {
            autoBreakM = 45; // 拘束6時間45分超 〜 9時間以下 ➔ 45分休憩を適用
          }
        }

        // 3. 退勤時刻とステータス、自動計算された休憩時間をDBへ反映 (UPDATE)
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

        // カレンダー表示を最新に更新
        await renderCalendarInternal();

        // フロントUIを退勤済状態に変え、お疲れ様トーストを表示
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

    // ③【外出 / 外出終了ボタンのクリックイベント】
    breakToggleBtn.addEventListener("click", async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const nowIso = new Date().toISOString();
        const todayStr = nowIso.split("T")[0];

        // 現在のボタンテキストの文言から、「外出の開始」か「終了」かを動的に見分ける
        const isCurrentlyBreaking = breakToggleBtn.textContent.trim() === "外出終了";

        let updateData = {};

        if (!isCurrentlyBreaking) {
          // 「外出開始」を押した場合：ステータスを going_out にし、開始時刻を記録
          updateData = {
            status: "going_out",
            break_start: nowIso,
            updated_at: getNowISO(),
          };
        } else {
          // 「外出終了」を押した場合：ステータスを working に戻し、終了時刻を記録
          updateData = {
            status: "working",
            break_end: nowIso,
            updated_at: getNowISO(),
          };
        }

        // 今日の有効な勤怠行に対してデータを保存 (UPDATE)
        const { error } = await supabase.from("attendance_data").update(updateData).match({ user_id: user.id, work_date: todayStr, is_active: true });

        if (error) throw error;

        // ボタンの文言変更とトースト通知の出力
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

    // ◆ 備考（今日の連絡事項）保存ボタンの処理
    const remarksInput = document.getElementById("today_remarks_input");
    const saveRemarksBtn = document.getElementById("btn_save_remarks");

    if (remarksInput && saveRemarksBtn) {
      // ユーザーが「編集」を押して書き換える前の文字列を一時退避し、無駄な通信（空更新）を防ぐための変数
      let originalRemarksText = "";

      saveRemarksBtn.addEventListener("click", async () => {
        // 現在のボタンが「保存」状態のとき（＝テキスト入力が終わり、DBに反映するタイミング）
        if (saveRemarksBtn.textContent.trim() === "保存") {
          const remarksText = remarksInput.value.trim();

          // 1. 入力内容が完全に空文字の場合は処理を行わずそのまま終了
          if (remarksText === "") {
            console.log("備考が空のため、保存処理をスキップしました。");
            return;
          }

          // 2. 編集ボタンを押した時点から内容が1文字も変わっていない場合は通信を走らせず終了
          if (remarksText === originalRemarksText) {
            console.log("備考に変更がないため、更新をスキップします。");
            if (window.showToast) {
              window.showToast("変更はありません。", "info");
            }

            // テキストエリアを再びロック状態（グレーアウト）に戻す
            remarksInput.disabled = true;
            saveRemarksBtn.textContent = "編集";
            saveRemarksBtn.style.backgroundColor = "#6c757d";
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

            // 今日の有効な勤怠レコードがすでに作られているか事前確認
            const { data: existingRecord } = await supabase
              .from("attendance_data")
              .select("id, memo")
              .match({ user_id: user.id, work_date: todayStr, is_active: true })
              .maybeSingle();

            if (existingRecord) {
              // 出勤打刻などですでに今日の行がある場合は、memoカラムを「上書き更新 (UPDATE)」する
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
              // 出勤ボタンを押す前に先に備考を入れた場合は、ステータスを未始動（not_started）として「新規登録 (INSERT)」する
              // モーダル経由（registration_mode: modal）としてデータを起こす
              const { error } = await supabase.from("attendance_data").insert({
                user_id: user.id,
                work_date: todayStr,
                status: "not_started",
                memo: remarksText,
                is_active: true,
                registration_mode: "modal",
                updated_at: getNowISO(),
              });

              if (error) throw error;
              addLogCommon("備考", "備考を新規保存しました。");
            }

            // フロントUIを「閲覧モード（非活性）」へロック切り替え
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

          // 現在のボタンが「編集」状態のとき（＝これからテキストを書き換えるタイミング）
        } else {
          // 3. 「編集」が押された現在の値を退避させておき、入力欄を解放（フォーカスを当てる）
          originalRemarksText = remarksInput.value.trim();

          remarksInput.disabled = false;
          remarksInput.focus();
          saveRemarksBtn.textContent = "保存";
          saveRemarksBtn.style.backgroundColor = "#8ea3c2";
        }
      });
    }

    // --- LocalStorageから本日のログを復元する処理 ---
    // ◆ ローカルログ復元関数
    const restoreLogsFromStorage = () => {
      if (!logArea) return;
      // 今日の日付文字列（YYYY-MM-DD）をキーにして取得
      const todayKey = `attendance_logs_${new Date().toISOString().split("T")[0]}`;
      const savedLogs = localStorage.getItem(todayKey);
      if (savedLogs) {
        logArea.value = savedLogs;
      }
    };

    // ログの復元を実行
    restoreLogsFromStorage();

    // ◆ 画面初回ロード時の非同期データ読み込み一括処理
    // 【目的】画面を開いた瞬間に、必要なユーザー状態や各種UIの描画処理を並行して効率的に同期・実行する
    try {
      // Step1: 念のためデータ取得前に共通ローディングを表示状態にする
      if (typeof window.showGlobalLoading === "function") {
        window.showGlobalLoading();
      }

      // Step2: 「今日の打刻状態の復元」「カレンダー描画」「過去レポート描画」を並行して同時に実行し、すべての完了を待つ
      await Promise.all([
        restoreStateFromDB(),
        renderCalendarInternal(),
        typeof updateMainPageReportList === "function" ? updateMainPageReportList() : Promise.resolve(),
      ]);

      // ◆ レポート一覧の行クリック（既読化・詳細モーダル連動）制御ロジック
      // 【目的】レポート一覧の行がクリックされた際、多重発火を防ぎつつ、画面上の既読UI変更、カレンダー連動、DB保存、および編集モーダルの起動を制御する
      if (typeof updateMainPageReportList === "function") {
        const originalUpdateMainPageReportList = updateMainPageReportList;

        // 元の一覧描画関数をフックし、行が生成されるたびに安全なイベントバインドを追加適用する
        updateMainPageReportList = async function (...args) {
          // Step1: 本来の一覧描画処理を実行してDOMを構築
          await originalUpdateMainPageReportList(...args);

          // Step2: レポート一覧の行要素をすべて取得
          const reportRows = document.querySelectorAll("#past_report_list .past-report-item, #past_report_list a, .report-item");

          reportRows.forEach((row) => {
            // イベントの二重登録（多重発火）による競合を完全に排除するため、要素をクローンして既存のリスナーを一度消去する
            const newRow = row.cloneNode(true);
            row.replaceWith(newRow);
            newRow.addEventListener("click", async (e) => {
              // 重複するブラウザの既定動作やイベントのバブルアップ（親要素への伝播）を完全に遮断
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();

              // 対象のレポートIDをDOM属性から割り出す
              const reportId = newRow.getAttribute("data-id") || newRow.getAttribute("data-report-id") || newRow.id;

              if (!reportId || reportId === "undefined") {
                return;
              }

              // 🌟【UI即時反映】リスト項目の見た目を「既読スタイル」へ変更
              newRow.classList.add("bg-secondary-subtle", "fw-bold");

              const indicator = newRow.querySelector('div[style*="#6366f1"]') || newRow.querySelector('div[style*="background-color: #6366f1"]');
              if (indicator) {
                indicator.style.backgroundColor = "#c7d2fe";
              }

              const icon = newRow.querySelector(".bi-circle-fill");
              if (icon) {
                icon.className = "bi bi-file-earmark";
                icon.style.color = "#c7d2fe";
                icon.style.fontSize = "0.85rem";
              }

              const textSpan = newRow.querySelector(".text-dark.fw-bold");
              if (textSpan) {
                textSpan.className = "text-body fw-normal text-truncate ms-1";
              }

              const newBadge = newRow.querySelector('span[style*="background-color: #e0e7ff"]') || newRow.querySelector(".badge");
              if (newBadge && newBadge.textContent.trim() === "NEW") {
                newBadge.remove();
              }

              // 🎯【追加】カレンダーの「選択中（追尾）」スタイルを即時反映する処理
              const dateEl = newRow.querySelector(".text-muted");
              if (dateEl && dateEl.textContent) {
                const dateStr = dateEl.textContent; // 例: "2026/05/20"
                const dateParts = dateStr.split("/");
                if (dateParts.length === 3) {
                  const dayNum = parseInt(dateParts[2], 10);

                  // カレンダー全セルの選択クラスを解除し、対象日のセルだけに追尾クラスを付与
                  document.querySelectorAll(".calendar-day-cell").forEach((cell) => {
                    cell.classList.remove("selected-day", "active-date");
                  });

                  document.querySelectorAll(".calendar-day-cell").forEach((parentCell) => {
                    const dayNumEl = parentCell.querySelector(".day-number");
                    if (dayNumEl && parseInt(dayNumEl.textContent, 10) === dayNum) {
                      parentCell.classList.add("selected-day");
                    }
                  });
                }
              }

              // 🌟【DB永続化】Supabaseの「report_shares」テーブルへ既読情報を上書き保存する処理
              try {
                const {
                  data: { user },
                } = await supabase.auth.getUser();
                if (user) {
                  const nowISO = new Date().toISOString();

                  // 複合一意制約（report_id, user_id）の競合時は既存データを上書き更新（upsert）
                  const { error: readUpdateError } = await supabase.from("report_shares").upsert(
                    {
                      report_id: reportId,
                      user_id: user.id,
                      is_read: true,
                      read_at: nowISO,
                      updated_at: nowISO,
                    },
                    { onConflict: "report_id,user_id" },
                  ); // 複合PKを指定して上書き

                  if (readUpdateError) {
                    console.error("❌ DBへの既読書き込みに失敗しました:", readUpdateError);
                  } else {
                    console.log("✏️ DBへの既読保存が正常に完了しました！");

                    // 🎯【追加】DBへの既読保存が完了した「この瞬間」にカレンダーを再描画！
                    if (typeof renderCalendarInternal === "function") {
                      await renderCalendarInternal();
                    }
                  }
                }
              } catch (dbErr) {
                console.error("既読処理の通信中にエラーが発生しました:", dbErr);
              }

              // 🌟【詳細データの取得】レポート情報と作成者のマスター情報を結合して丸ごと取得する処理
              try {
                const { data: reportData, error } = await supabase
                  .from("report_logs")
                  .select(
                    `
              *,
              user_master (
                id,
                user_name,
                last_name,
                first_name,
                company_id
              )
            `,
                  )
                  .eq("id", reportId)
                  .single();

                if (error) throw error;
                if (!reportData) return;

                // オブジェクト形式・配列形式のどちらでデータが返却されても確実に作成者のフルネームを割り出す
                let detectedAuthorName = "ユーザー";

                if (reportData.user_master) {
                  const master = Array.isArray(reportData.user_master) ? reportData.user_master[0] : reportData.user_master;
                  if (master) {
                    const lName = master.last_name || "";
                    const fName = master.first_name || "";
                    const fullName = `${lName} ${fName}`.trim();
                    detectedAuthorName = fullName || master.user_name || "ユーザー";
                  }
                }

                // 詳細モーダル側と状態を共有するため、各種グローバル変数を同期
                if (typeof currentReportAuthorName !== "undefined") {
                  currentReportAuthorName = detectedAuthorName;
                }
                if (typeof currentReportId !== "undefined") {
                  currentReportId = reportId;
                }
                if (typeof currentDisplayReportData !== "undefined") {
                  currentDisplayReportData = reportData;
                }

                // Step3: 取得した詳細データを引き渡して編集用レポートモーダルを開く
                if (typeof openEditReportModal === "function") {
                  console.log(`【main.js】レポートモーダルを開きます (ID: ${reportId}) 作成者: ${detectedAuthorName}`);
                  openEditReportModal(reportData);
                }
              } catch (err) {
                console.error("モーダルの起動・データ取得中にエラーが発生しました:", err);
              }
            });
          });
        };
      }
    } catch (e) {
      console.error("初期データロード中にエラーが発生しました:", e);
    }

    // ◆ 表示対象ユーザー切り替えプルダウンの連動処理
    // 【目的】管理者やリーダーがプルダウンで対象ユーザーを切り替えた際、カレンダーとレポート一覧をリアルタイムに再描画する
    const targetUserSelect = document.getElementById("target_user_id");
    if (targetUserSelect) {
      targetUserSelect.addEventListener("change", async () => {
        console.log("プルダウンが変更されました。カレンダーと一覧を再描画します:", targetUserSelect.value);

        // カレンダーが現在描画中の場合は重複処理を避けるためスキップ
        if (isCalendarRendering) return;

        try {
          // 切り替え中の待ち時間を明示するため共通グローバルローディングを起動
          if (typeof window.showGlobalLoading === "function") window.showGlobalLoading();

          // Step1: 選択されたユーザー情報に基づいてカレンダー側のマーク・状態を再描画
          await renderCalendarInternal();
          // Step2: 過去のレポート一覧側も選択ユーザーのデータで再描画
          if (typeof updateMainPageReportList === "function") await updateMainPageReportList();
        } catch (e) {
          console.error("プルダウン切り替え時の再描画に失敗しました:", e);
        } finally {
          if (typeof window.hideGlobalLoading === "function") window.hideGlobalLoading();
        }
      });
    }

    // 📱 スマホ・タブレット表示時はデフォルトでアコーディオンを格納する
    adjustAccordionForMobile();

    // --- 3. 経費専用モーダル（modal-expense-entry.html）の連動ロジック ---
    // ◆ 経費登録モーダル連携処理
    // 【目的】本日の経費精算（交通費やその他経費）の明細管理・動的フォーム追加・およびDB保存の一連のフロントロジックを制御する
    const expenseTriggerBtn = document.getElementById("btn_open_expense_modal");

    if (expenseTriggerBtn) {
      let currentAttendanceId = null;
      let hasExistingExpenses = false;

      // 【明細追加ヘルパー】経費入力行の動的HTML生成とリストへの差し込み、イベント付与を行う内部関数
      const addExpenseRow = (data = { id: null, category: "transportation", detail: "", amount: "" }) => {
        const expenseList = document.getElementById("expense_entry_list");
        if (!expenseList) return;

        // DB未保存の新規行に対して一時的に付与するランダムID生成ロジック
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

        // 動的入力コンポーネントのHTMLテンプレート（デザイン統一用）
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

        // 特定ブラウザ等でのBootstrapセレクトボックス表示崩れを防ぐための強制インラインスタイル適用
        const selectEl = div.querySelector(".expense-notebook-select");
        if (selectEl) {
          selectEl.style.setProperty("line-height", "normal", "important");
          selectEl.style.setProperty("padding", "0px 24px 0px 8px", "important");
        }

        // 金額フィールドの数値変更を検知して、合計金額を即座に再計算するイベントを設定
        div.querySelector(".expense-notebook-amount-field").addEventListener("input", calculateTotalExpense);

        // 明細行の削除ボタンイベント（この時点ではDBからは削除されず、登録ボタン押下で確定）
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

      // 【合計金額計算ヘルパー】現在画面上にあるすべての明細行の金額を集計して合計欄に表示する内部関数
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

      // 「経費登録」メインボタンをクリックした際のダイアログ起動・データ読み込みイベント
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

        // メイン画面の日付表示とモーダル内のタイトル用日付表示を同期
        const mainDateDisplay = document.getElementById("current_date_display");
        const modalDateCapsule = document.getElementById("expense_modal_date_display");

        if (mainDateDisplay && modalDateCapsule) {
          modalDateCapsule.textContent = mainDateDisplay.textContent;
        }

        // 開くたびに入力エリアの内容や合計表示、状態管理用のフラグを初期化
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
            // Step1: 本日すでに登録されている有効な（is_active: true）経費レコードがあるかDBから検索
            const { data: existingRecords, error: fetchError } = await supabase
              .from("expense_records")
              .select("*")
              .match({ user_id: user.id, expense_date: todayStr, is_active: true });

            if (fetchError) throw fetchError;

            // 過去の経費データが存在する場合は、全件ループして明細行を画面に復元生成する
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
              // 過去経費がない場合は親となる「当日の勤怠レコード」があるか確認
              const { data: attRecord } = await supabase
                .from("attendance_data")
                .select("id")
                .match({ user_id: user.id, work_date: todayStr, is_active: true })
                .maybeSingle();

              if (attRecord) {
                currentAttendanceId = attRecord.id;
              } else {
                // 勤怠自体が未登録なら、整合性を保つためstatus: "not_started"で親の当日の勤怠データを先行自動作成 (INSERT)
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

              // 初期状態の入力補助として空の明細欄をデフォルトで1行生成しておく
              addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
            }
          }
        } catch (err) {
          console.error("❌ 既存経費の読み込みに失敗しました:", err);
          addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
        }

        // モーダル内の「明細を追加する」ボタンのクリックイベント設定
        addRowBtn.onclick = (e) => {
          e.preventDefault();
          addExpenseRow({ id: null, category: "transportation", detail: "", amount: "" });
          // 追加した項目が隠れてしまわないよう、自動で一番下までスムーズスクロールさせる
          const rows = expenseContainer.querySelectorAll(".expense-notebook-row");
          if (rows.length > 0) {
            rows[rows.length - 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        };

        // モーダル内の「すべてクリア」ボタンのクリックイベント設定
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

        // ◆ 経費フォームの送信（登録する）処理
        // 【目的】画面内の有効な明細を集計し、本日の既存データを一旦すべて論理削除（is_active: false）した上で、最新状態を一括INSERT保存する
        expenseForm.onsubmit = async (e) => {
          e.preventDefault();

          const expenseItems = [];
          expenseContainer.querySelectorAll(".expense-notebook-row").forEach((row) => {
            const category = row.querySelector(".expense-category").value;
            const amount = parseInt(row.querySelector(".expense-amount").value, 10) || 0;
            const memo = row.querySelector(".expense-memo").value.trim();

            // 金額が0より大きい有効な入力データのみをコミット対象として抽出
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

            // Step1: データの重複や残存を防ぐため、今日の経費データを一旦すべて「論理削除 (is_active: false)」に更新する
            const { error: updateError } = await supabase
              .from("expense_records")
              .update({ is_active: false })
              .match({ user_id: user.id, expense_date: todayStr });

            if (updateError) throw updateError;

            // Step2: 有効な入力明細が存在する場合の一括保存処理
            if (expenseItems.length > 0) {
              // なんらかの理由で親の勤怠IDが外れていた場合は、ここで再生成・補正を行う
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

              // 送信用オブジェクト配列のマッピング構築
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

              // 抽出した明細を一括で「新規登録 (INSERT)」
              const { error: insertError } = await supabase.from("expense_records").insert(insertData);
              if (insertError) throw insertError;

              if (typeof addLogCommon === "function") {
                addLogCommon("経費", `合計 ${totalDisplay.textContent} 円の経費を保存しました。`);
              }
              if (window.showToast) window.showToast("経費データを保存しました！", "success");

              // Step3: 既存データがあった状態から、明細がすべて空（削除）にされた場合の処理
            } else {
              if (hasExistingExpenses) {
                if (typeof addLogCommon === "function") {
                  addLogCommon("経費", "本日の経費明細をすべて削除しました。");
                }
                if (window.showToast) window.showToast("経費データをすべて削除しました。", "success");
              }
            }

            // 保存完了後、経費マーク（￥アイコン等）をカレンダーへリアルタイムに同期反映するため再レンダリングを実行
            await renderCalendarInternal();

            // モーダルを閉じ、Bootstrapのインスタンスを正常に破棄・クローズする
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

// ◆ 画面リサイズ・表示デバイス最適化処理
// 【目的】スマートフォンなどの小画面デバイスでアクセスした際、画面を広く使えるようデフォルトでアコーディオンUIを折りたたむ
function adjustAccordionForMobile() {
  const isMobile = window.innerWidth < 768;
  if (isMobile) {
    const accordionContent = document.querySelector(".card-body-content") || document.querySelector(".collapse");
    const toggleButton = document.querySelector(".card-header-toggle") || document.querySelector("[data-bs-toggle='collapse']");

    if (accordionContent) {
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

// グローバル変数・多重実行ガード
window.isCalendarRendering = window.isCalendarRendering ?? false;
window.currentCalendarDate = window.currentCalendarDate ?? new Date();

// ◆ 年月選択プルダウン初期化処理
// 【目的】カレンダー表示用の年月切り替えセレクトボックスを生成し、変更時に連動してカレンダーとリストを再描画するイベントをバインドする
function initCalendarSelector() {
  const selector = document.getElementById("calendar-month-selector");
  if (!selector) return;

  // すでに選択肢（option）が生成されているなら、重複生成やクリアを行わず即終了
  if (selector.options.length > 0) {
    return;
  }

  selector.innerHTML = ""; // 既存のHTML要素をクリア
  const now = new Date();

  // 当月を中心に、前後3ヶ月分（計7ヶ月分）の選択肢を動的に生成
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

  // プルダウンの選択が変更されたときのイベントハンドラ
  selector.onchange = async (e) => {
    const [year, month] = e.target.value.split("-").map(Number);

    // Step1: カレンダーの基準となる対象年月をグローバル変数に格納
    window.currentCalendarDate = new Date(year, month, 1);

    // Step2: 選択された年月データに基づいてカレンダーと右側レポートリストを同期して再描画
    await onFilterChange();
  };
}

// ◆ 年月プルダウンが変更された時の追従処理
const monthSelector = document.getElementById("calendar-month-selector");

if (monthSelector) {
  monthSelector.addEventListener("change", async (e) => {
    const val = e.target.value; // 例: "2026-10" や "2026/10" 等
    if (!val) return;

    // 数値（年・月）を抽出
    const matches = val.match(/\d+/g);
    if (!matches || matches.length < 2) return;

    const year = parseInt(matches[0], 10);
    const month = parseInt(matches[1], 10);

    // 1. グローバル基準日をユーザーが選択した年月に更新
    if (typeof currentCalendarDate !== "undefined") {
      currentCalendarDate = new Date(year, month - 1, 1);
    }
    if (window.currentCalendarDate) {
      window.currentCalendarDate = new Date(year, month - 1, 1);
    }

    // 2. カレンダーと過去レポート一覧の両方を再描画して追従させる
    if (typeof onFilterChange === "function") {
      await onFilterChange();
    } else if (typeof renderCalendarInternal === "function") {
      await renderCalendarInternal();
      if (typeof updateMainPageReportList === "function") {
        await updateMainPageReportList();
      }
    }
  });
}

// 祝日の多重同期を防ぐための実行済みフラグ
let isHolidaySyncDone = false;

// ◆ 外部API祝日データ同期処理
// 【目的】日本の祝日データを外部APIから非同期で取得し、データベースの「holiday_master」テーブルへ最新情報をUpsert保存する
async function syncHolidaysFromExternalAPI(year) {
  if (isHolidaySyncDone) return;

  try {
    // Step1: 外部の日本の祝日一覧APIから指定年のデータを取得
    const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
    if (!response.ok) throw new Error("外部祝日APIの取得に失敗しました");

    const holidayData = await response.json();
    const nowIso = new Date().toISOString();

    // Step2: APIで得られたオブジェクト配列をDBのスキーマ構造に合わせてマッピング
    const upsertRows = Object.entries(holidayData).map(([dateStr, name]) => ({
      holiday_date: dateStr,
      name: name,
      updated_at: nowIso,
    }));

    if (upsertRows.length === 0) return;

    // Step3: 複合一意制約（holiday_date）の競合時は上書きする設定で一括Upsert実行
    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    const { error } = await supabaseClient.from("holiday_master").upsert(upsertRows, { onConflict: "holiday_date" });
    if (error) throw error;

    // 同期成功後にフラグを立てて多重実行を防止
    isHolidaySyncDone = true;

    // 成功ログはデバッグレベルへ変更
    console.debug(`✨ ${year}年の祝日データを外部APIからDBへ同期しました`);
  } catch (err) {
    console.error("❌ 祝日の自動同期に失敗しました:", err);
  }
}

/// ◆ カレンダーメイン描画処理
// 【目的】指定された対象年月のカレンダーグリッドを動的にDOM生成し、Supabaseから取得した「打刻データ」「レポートの提出状況」「未読ドット」を統合してセル上に描画する
async function renderCalendarInternal() {
  const calendarDays = document.getElementById("calendar-days");
  if (!calendarDays) return;

  // カレンダーの多重描画によるチラつきやバグを防ぐため、レンダリング中は処理を即座にブロック
  if (window.isCalendarRendering) return;
  window.isCalendarRendering = true;

  const today = new Date();
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  // カレンダー構築用の各種日付パラメータの算出
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  // クエリの検索効率を高めるため、当月の開始日と終了日をYYYY-MM-DD形式で定義
  const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDate).padStart(2, "0")}`;

  let holidays = {};
  const attendanceMap = new Map();

  const myReportMap = new Map();
  const otherUserReportMap = new Map();
  const unreadDotsMap = new Map();

  // 表示対象 of ユーザー絞り込みプルダウンの値を取得・クレンジング
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
      const {
        data: { user: currentUser },
      } = await supabaseClient.auth.getUser();
      if (!currentUser) {
        window.isCalendarRendering = false;
        return;
      }

      // データの取得条件を設定（report_logsのクエリ構築）
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

      // プルダウンの選択状態に応じてDBへのクエリ検索条件を動的に分岐
      if (filterUserVal === "mine") {
        reportQuery = reportQuery.eq("user_id", currentUser.id);
      } else if (filterUserVal !== "all") {
        reportQuery = reportQuery.eq("user_id", filterUserVal);
      }

      // Step1: 「レポート状況」「祝日マスター」「ログインユーザーの勤怠データ」を非同期で同時に一括取得
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

      // Step2: 取得した祝日データをカレンダーの日付と紐付けマッピング
      if (holidaysResult.data) {
        holidaysResult.data.forEach((h) => {
          const dayNum = new Date(h.holiday_date).getDate();
          holidays[dayNum] = h.name;
        });
      }

      // Step3: 取得した自身の勤怠データを日付キーでマップ化
      if (attendanceResult.data && isLookingAtMe) {
        attendanceResult.data.forEach((record) => {
          const dayNum = new Date(record.work_date).getDate();
          attendanceMap.set(dayNum, record);
        });
      }

      // Step4: レポートデータの仕分けと未読状態の判定ロジック
      if (reportsResult.data) {
        for (const r of reportsResult.data) {
          const isMyReport = String(r.user_id) === String(currentUser.id);
          const currentStatus = String(r.status || "").toLowerCase();

          // --- 1. 除外判定（表示しないものを弾く） ---
          // 他人の下書きレポートはカレンダーに一切表示しない
          if (!isMyReport && currentStatus === "draft") continue;

          // 論理削除（is_active: false）状態のレポートは、自分の下書きを除き表示スキップ
          if (r.is_active === false) {
            if (!(isMyReport && currentStatus === "draft")) continue;
          }

          // 日付データの妥当性チェック
          if (!r.report_date) continue;
          const dateParts = r.report_date.split("-");
          if (dateParts.length < 3) continue;
          const dayNum = parseInt(dateParts[2], 10);
          if (isNaN(dayNum)) continue;

          // --- 2. 自分のレポートの場合 ---
          if (isMyReport) {
            if (!myReportMap.has(dayNum)) {
              myReportMap.set(dayNum, []);
            }
            myReportMap.get(dayNum).push({ id: r.id, status: currentStatus, type: r.report_type });

            // 自分のレポートはここで仕分け完了（未読判定などは不要なため、次のデータへ）
            continue;
          }

          // --- 3. 他人のレポートの場合（共有と未読のチェック） ---
          const shares = Array.isArray(r.report_shares) ? r.report_shares : r.report_shares ? [r.report_shares] : [];
          const myShare = shares.find((s) => s && String(s.user_id) === String(currentUser.id));

          // 自分宛てに共有されていない他人のレポートは、カレンダーに出さない
          if (!myShare) continue;

          const isRead = myShare.is_read;

          // 【修正ポイント】戻していただいたコードにあったトラップを修正
          // 以前のコードでは、filterUserVal === "all" の時に「既読ならスキップ」していました。
          // もし「未読のみ表示」という専用のフィルター機能がある場合のみ、スキップさせます。
          if (filterUserVal === "unread") {
            // ※もし未読フィルターの value が "unread" の場合
            if (isRead) continue;
          }

          // 他人のレポート（自分宛て共有あり）をマップに登録
          if (!otherUserReportMap.has(dayNum)) {
            otherUserReportMap.set(dayNum, []);
          }
          otherUserReportMap.get(dayNum).push({ id: r.id, type: r.report_type });

          // 未読ドットの判定（未読の場合のみ点灯）
          if (!isRead) {
            unreadDotsMap.set(dayNum, true);
          }
        }
      }

      // 当月あるいは未来の祝日データが存在しない、または不足している場合は外部APIからバックグラウンドで自動同期を試みる
      const currentYear = new Date().getFullYear();
      if (year >= currentYear || !holidaysResult.data || holidaysResult.data.length === 0) {
        if (typeof syncHolidaysFromExternalAPI === "function") {
          syncHolidaysFromExternalAPI(year);
        }
      }
    }
  } catch (err) {
    console.error("メインカレンダーデータのロードに失敗しました:", err);
  }

  // 【内部ヘルパー関数】日付単体セルのベースDOM要素を生成する
  function createDayCell(dayNum, isOtherMonth = false, otherMonthOffset = 0) {
    const div = document.createElement("div");
    div.className = "calendar-day-cell";
    div.style.cursor = "default"; // 閲覧専用のためデフォルトカーソルに変更
    div.innerHTML = `
      <div class="calendar-day-header">
        <span class="day-number">${dayNum}</span>
        <div class="calendar-day-badge-area"></div>
      </div>
      <div class="calendar-day-bottom-flex" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: auto;">
        <div class="calendar-attendance-group"></div>
        <div class="calendar-report-group" style="display: flex; align-items: center; gap: 4px;"></div>
      </div>
    `;

    const checkDate = new Date(year, month + otherMonthOffset, dayNum);
    const dayOfWeek = checkDate.getDay();

    // 曜日・祝日・当日の状態に応じたCSSクラスの出し分け
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

  // カレンダー表示領域のリセット
  calendarDays.innerHTML = "";

  // 1. グリッドの余白埋め：前月分の末尾日付を描画
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    calendarDays.appendChild(createDayCell(prevLastDate - i, true, -1));
  }

  // 2. メイン領域：当月分の日付セルの詳細描画とインジケーター反映
  for (let d = 1; d <= lastDate; d++) {
    const div = createDayCell(d, false, 0);
    calendarDays.appendChild(div);

    const badgeArea = div.querySelector(".calendar-day-badge-area");
    const attendanceGroup = div.querySelector(".calendar-attendance-group");
    const reportGroup = div.querySelector(".calendar-report-group");

    let targetReportId = null;

    // 自身の「有給」「欠勤」または「勤務中インジケーター」「退勤チェックマーク」のUI反映
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
        } else if (!attendanceRecord.clock_out && attendanceRecord.clock_in) {
          const workingIndicator = document.createElement("span");
          workingIndicator.className = "cal-working-indicator";
          attendanceGroup.appendChild(workingIndicator);
        } else if (attendanceRecord.clock_out) {
          const completedIcon = document.createElement("i");
          completedIcon.className = "bi bi-check-circle-fill cal-completed-indicator";
          attendanceGroup.appendChild(completedIcon);
        }
      }
    }

    // 自分のレポートマークの出し分け（下書き：鉛筆アイコン / 提出済：チェック付き書類アイコン）
    if (isLookingAtMe && myReportMap.has(d)) {
      const reports = myReportMap.get(d);
      if (reports.length > 0) {
        targetReportId = reports[0].id; // 代表のIDを保持
      }

      const mySubmittedReps = reports.filter((r) => r.status !== "draft");
      const myDraftReps = reports.filter((r) => r.status === "draft");

      // ① 提出済みレポートの描画（2件以上の場合は数字バッジ）
      if (mySubmittedReps.length > 0) {
        const wrapper = document.createElement("span");
        wrapper.className = "icon-wrapper";
        wrapper.title = `提出済み ${mySubmittedReps.length}件`;

        const countBadge = mySubmittedReps.length > 1 ? `<span class="icon-count-badge">${mySubmittedReps.length}</span>` : "";
        wrapper.innerHTML = `<i class="bi bi-file-earmark-check report-icon is-submitted"></i>${countBadge}`;
        reportGroup.appendChild(wrapper);
      }

      // ② 下書きレポートの描画（2件以上の場合は数字バッジ）
      if (myDraftReps.length > 0) {
        const wrapper = document.createElement("span");
        wrapper.className = "icon-wrapper";
        wrapper.title = `下書き ${myDraftReps.length}件`;

        const countBadge = myDraftReps.length > 1 ? `<span class="icon-count-badge">${myDraftReps.length}</span>` : "";
        wrapper.innerHTML = `<i class="bi bi-pencil report-icon is-draft"></i>${countBadge}`;
        reportGroup.appendChild(wrapper);
      }
    }

    // 他人の共有レポートマークの生成エリア（書類アイコンを半透明で薄く表示）
    if (!isLookingAtMe && otherUserReportMap.has(d)) {
      const reports = otherUserReportMap.get(d);
      if (reports.length > 0) {
        targetReportId = reports[0].id;

        const wrapper = document.createElement("span");
        wrapper.className = "icon-wrapper";
        wrapper.title = `共有レポート ${reports.length}件`;

        const countBadge = reports.length > 1 ? `<span class="icon-count-badge">${reports.length}</span>` : "";
        wrapper.innerHTML = `<i class="bi bi-file-earmark report-icon is-submitted" style="opacity: 0.7;"></i>${countBadge}`;
        reportGroup.appendChild(wrapper);
      }
    }

    // 未読ドット（通知ドット）の表示制御
    if (unreadDotsMap.has(d)) {
      const reportIconUnread = document.createElement("span");
      reportIconUnread.className = "cal-unread-dot-fixed";
      badgeArea.appendChild(reportIconUnread);
    }

    // 💡 カレンダーセルは閲覧専用とするためタップイベントは未登録に設定
    if (targetReportId) {
      div.setAttribute("data-report-id", targetReportId);
    }
  }

  // 3. グリッドの余白埋め：カレンダー行末尾の翌月分の日付を綺麗に埋める処理
  const totalRenderedSlots = firstDayOfWeek + lastDate;
  const remainder = totalRenderedSlots % 7;
  const nextMonthNeedSlots = remainder === 0 ? 0 : 7 - remainder;

  for (let n = 1; n <= nextMonthNeedSlots; n++) {
    calendarDays.appendChild(createDayCell(n, true, 1));
  }

  // カレンダーの描画ロックを安全に解除
  window.isCalendarRendering = false;
}

// 案内テキストを完全に1行に収めたスマートなプレースホルダーHTMLテンプレート
const EMPTY_REPORT_PLACEHOLDER_HTML = `
  <div class="d-flex flex-column align-items-center justify-content-center text-center mx-auto" 
       style="min-height: 200px; padding: 2rem 1rem;">
    <div class="mb-2" style="opacity: 0.5;">
      <i class="bi bi-file-earmark-text" style="font-size: 2rem; color: #64748b;"></i>
    </div>
    <div class="fw-semibold text-secondary mb-1" style="font-size: 0.85rem;">
      提出されたレポートはありません
    </div>
    <p class="text-muted mb-0" style="font-size: 0.78rem; white-space: nowrap; opacity: 0.8;">
      新規作成ボタンから、レポートを作成して提出してください。
    </p>
  </div>
`;

// ◆ メイン画面過去レポート一覧描画処理
//  【目的】現在選択されている年月・ユーザーフィルターに基づき、該当する提出済および自身の下書きレポート一覧をSupabaseから取得し、未読優先度と日付順でソートしてDOMを描画する
async function updateMainPageReportList() {
  const pastReportListEl = document.getElementById("past_report_list");
  if (!pastReportListEl) return;

  try {
    const supabaseClient = window.supabase || supabase;
    if (!supabaseClient) return;

    // Step1: ログイン中のユーザー情報を取得し、user_masterと突合してセッション用の基本オブジェクトを構築
    const {
      data: { user: authUser },
    } = await supabaseClient.auth.getUser();
    if (!authUser) return;

    const { data: userMasterRow } = await supabaseClient.from("user_master").select("last_name, first_name").eq("id", authUser.id).single();

    const loginUser = {
      id: authUser.id,
      last_name: userMasterRow ? userMasterRow.last_name : "ユーザー",
      first_name: userMasterRow ? userMasterRow.first_name : "",
    };

    // Step2: クエリ効率化のため、user_masterから全ユーザーの基本情報を事前に一括ロードしてMap化
    const { data: allUsers, error: userError } = await supabaseClient.from("user_master").select("id, last_name, first_name, user_name");
    if (userError) throw userError;

    const userMap = new Map();
    if (allUsers) {
      allUsers.forEach((u) => userMap.set(String(u.id), u));
    }

    // Step3: 対象ユーザー選択プルダウン（target_user_id）の初期選択肢（全体・自分）を安全に動生成
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

      // 前回の動的追加分（インデックス2以降）を一旦クリア
      while (userSelect.options.length > 2) {
        userSelect.remove(2);
      }

      // 存在するレポートの作成者一覧を走査し、自分以外の実在するユーザーをプルダウンに動的追加
      // 【セキュリティ強化】自分が作成したレポート & 自分に共有されたレポートを並行取得して結合
      const [resMy, resShared] = await Promise.all([
        // 1. 自分が作成したレポート
        supabaseClient
          .from("report_logs")
          .select("id, report_type, report_date, is_active, status, user_id")
          .eq("is_active", true)
          .eq("user_id", loginUser.id),

        // 2. 自分に共有されたレポート（INNER JOIN で自分宛てに限定）
        supabaseClient
          .from("report_logs")
          .select(
            `
            id, report_type, report_date, is_active, status, user_id,
            report_shares!inner ( user_id )
          `,
          )
          .eq("is_active", true)
          .eq("report_shares.user_id", loginUser.id),
      ]);

      // 重複を除外して 1 つの配列（allReports）に合体
      const allReportsMap = new Map();
      (resMy.data || []).forEach((r) => allReportsMap.set(r.id, r));
      (resShared.data || []).forEach((r) => allReportsMap.set(r.id, r));
      const allReports = Array.from(allReportsMap.values());

      if (allReports.length > 0) {
        const seenUserIds = new Set();
        allReports.forEach((r) => {
          const authorId = r.user_id; // 作成者はuser_id
          const isMyReport = String(authorId) === String(loginUser.id);
          const currentStatus = String(r.status || "")
            .trim()
            .toLowerCase();

          // 他人の下書きレポート（status: draft）は、プルダウン構築の対象からも完全に除外
          if (!isMyReport && currentStatus === "draft") {
            return;
          }

          if (authorId != loginUser.id && !seenUserIds.has(authorId) && r.is_active !== false) {
            seenUserIds.add(authorId);

            let fullName = "他ユーザー";
            const master = userMap.get(String(authorId));
            if (master) {
              fullName = `${master.last_name || ""} ${master.first_name || ""}`.trim() || master.user_name || "他ユーザー";
            }

            const exists = Array.from(userSelect.options).some((opt) => opt.value == authorId);
            if (!exists) {
              const opt = document.createElement("option");
              opt.value = authorId;
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

    // Step4: グローバル基準日から選択月の「開始日（1日）」と「終了日（末日）」を算出し、クエリの検索範囲を定義
    const calendarDate = window.currentCalendarDate || (typeof currentCalendarDate !== "undefined" ? currentCalendarDate : new Date());
    const baseYear = calendarDate.getFullYear();
    const baseMonth = calendarDate.getMonth();

    const startStr = `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}-01`;
    const endDateObj = new Date(baseYear, baseMonth + 1, 0);
    const endStr = `${baseYear}-${String(baseMonth + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;

    // Step5: 指定された日付範囲から、自分が作成したレポートと自分に共有されたレポートを並行取得して結合
    const [resMy, resShared] = await Promise.all([
      // 1. 自分が作成したレポート
      supabaseClient
        .from("report_logs")
        .select(
          `
          id, report_date, report_type, status, user_id, is_active,
          report_shares(report_id, user_id, is_read)
        `,
        )
        .gte("report_date", startStr)
        .lte("report_date", endStr)
        .eq("user_id", loginUser.id),

      // 2. 自分に共有されたレポート（!inner で自分宛てに限定）
      supabaseClient
        .from("report_logs")
        .select(
          `
          id, report_date, report_type, status, user_id, is_active,
          report_shares!inner(report_id, user_id, is_read)
        `,
        )
        .eq("is_active", true)
        .gte("report_date", startStr)
        .lte("report_date", endStr)
        .eq("report_shares.user_id", loginUser.id),
    ]);

    if (resMy.error) throw resMy.error;
    if (resShared.error) throw resShared.error;

    // 重複（自身が作成して自身に共有設定されているようなケース）を除外して1つの配列に合体
    const reportMap = new Map();
    (resMy.data || []).forEach((r) => reportMap.set(r.id, r));
    (resShared.data || []).forEach((r) => reportMap.set(r.id, r));

    const rawReports = Array.from(reportMap.values());

    // Step6: フロント側でのセキュリティおよび閲覧権限フィルタリング（他人の下書きは除外）
    let displayReports = [];
    if (rawReports) {
      displayReports = rawReports.filter((r) => {
        const authorId = r.user_id;
        const isMyReport = String(authorId) === String(loginUser.id);
        const currentStatus = String(r.status || "").toLowerCase();

        // 自分のレポートであれば、下書き(draft)でも表示する
        if (isMyReport) {
          return true;
        }
        // 他人のレポートの場合、下書き(draft)は絶対に非表示
        if (currentStatus === "draft") {
          return false;
        }
        return true;
      });
    }

    // プルダウンによるユーザー絞り込みを適用
    if (filterValue === "mine") {
      displayReports = displayReports.filter((r) => r.user_id == loginUser.id);
    } else if (filterValue !== "all") {
      displayReports = displayReports.filter((r) => r.user_id == filterValue);
    }

    // Step7: ビジネスルールに基づいた並び替え（1:自分の下書き > 2:他人の未読 > 3:既読・通常提出、同スコア内は日付降順）
    if (displayReports.length > 0) {
      displayReports.sort((a, b) => {
        const authorA = a.user_id;
        const authorB = b.user_id;

        const isA_MyDraft = authorA == loginUser.id && (a.status === "draft" || a.is_active === false);
        const isB_MyDraft = authorB == loginUser.id && (b.status === "draft" || b.is_active === false);

        const sharesA = Array.isArray(a.report_shares) ? a.report_shares : a.report_shares ? [a.report_shares] : [];
        const myShareA = sharesA.find((s) => s && s.user_id == loginUser.id);
        const isA_OtherUnread = authorA != loginUser.id && !(myShareA ? myShareA.is_read : false);

        const sharesB = Array.isArray(b.report_shares) ? b.report_shares : b.report_shares ? [b.report_shares] : [];
        const myShareB = sharesB.find((s) => s && s.user_id == loginUser.id);
        const isB_OtherUnread = authorB != loginUser.id && !(myShareB ? myShareB.is_read : false);

        const scoreA = isA_MyDraft ? 1 : isA_OtherUnread ? 2 : 3;
        const scoreB = isB_MyDraft ? 1 : isB_OtherUnread ? 2 : 3;

        if (scoreA !== scoreB) {
          return scoreA - scoreB;
        }

        const dateA = a.report_date || "";
        const dateB = b.report_date || "";
        return dateB.localeCompare(dateA);
      });
    }

    // データが0件なら共通のプレースホルダー表示用HTMLを流し込んで即終了
    if (displayReports.length === 0) {
      pastReportListEl.innerHTML = EMPTY_REPORT_PLACEHOLDER_HTML;
      return;
    }

    // Step8: ソート済み配列を元に、各レポートアイテムのHTML構造を生成して文字列結合
    let htmlContent = "";
    displayReports.forEach((report) => {
      const authorId = report.user_id;
      const isMyReport = authorId && loginUser.id && String(authorId) === String(loginUser.id);

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
      } else {
        const master = userMap.get(String(authorId));
        if (master) {
          const lName = master.last_name || "";
          const fName = master.first_name || "";
          reporterName = `${lName} ${fName}`.trim() || master.user_name;
        }
      }

      if (!reporterName) reporterName = "ユーザー";

      const formattedDate = report.report_date ? report.report_date.replace(/-/g, "/") : "ー/ー/ー";

      let leftBorderHtml = "";
      let iconHtml = "";
      let textClass = "";
      let badgeHtml = "";

      // ステータス（自分/他人・未読/既読・下書き）に応じた装飾パターンの分岐切り替え
      // 💡位置ズレ防止のため、アイコンラッパー幅・余白位置を統一
      if (isMyReport) {
        if (report.status === "draft" || report.is_active === false) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #eab308; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<div style="width: 16px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-pencil" style="color: #ca8a04; font-size: 0.85rem;"></i></div>`;
          textClass = "fw-medium";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #fef9c3; color: #713f12; padding: 0.1rem 0.4rem; border-radius: 4px;">下書き</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #475569; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<div style="width: 16px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-clipboard-check" style="color: #475569; font-size: 0.85rem;"></i></div>`;
          textClass = "text-dark fw-medium";
        }
      } else {
        if (!isRead) {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #6366f1; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<div style="width: 16px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-circle-fill" style="color: #6366f1; font-size: 0.5rem;"></i></div>`;
          textClass = "text-dark fw-bold";
          badgeHtml = `<span class="ms-2" style="font-size: 0.65rem; background-color: #e0e7ff; color: #4338ca; padding: 0.1rem 0.4rem; border-radius: 4px; font-weight: 600;">NEW</span>`;
        } else {
          leftBorderHtml = `<div style="width: 3px; height: 16px; background-color: #c7d2fe; border-radius: 2px; margin-right: 8px;"></div>`;
          iconHtml = `<div style="width: 16px; display: inline-flex; justify-content: center; align-items: center;"><i class="bi bi-file-earmark" style="color: #c7d2fe; font-size: 0.85rem;"></i></div>`;
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

    // Step9: 生成したリスト内の各アイテム行に対し、イベントをバインド
    pastReportListEl.querySelectorAll(".past-report-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.preventDefault();
        const currentItem = e.currentTarget;
        const reportId = currentItem.getAttribute("data-id");

        console.log("🔥【メイン画面イベント発火】タップされました。ID:", reportId);

        // 選択ハイライトの切り替え
        pastReportListEl.querySelectorAll(".past-report-item").forEach((el) => {
          el.classList.remove("bg-secondary-subtle", "active-report", "active");
        });
        currentItem.classList.add("active-border");

        // 1. 右側リスト項目の見た目を即座に既読表示へ更新（チラつき防止）
        const leftBar =
          currentItem.querySelector('div[style*="background-color: #6366f1"]') || currentItem.querySelector('div[style*="background-color:#6366f1"]');
        if (leftBar) leftBar.style.backgroundColor = "#c7d2fe";

        const icon = currentItem.querySelector(".bi-circle-fill");
        if (icon) {
          icon.classList.remove("bi-circle-fill");
          icon.classList.add("bi-file-earmark");
          icon.style.color = "#c7d2fe";
          icon.style.fontSize = "0.85rem";
        }

        const textSpan = currentItem.querySelector(".text-truncate");
        if (textSpan) {
          textSpan.classList.remove("fw-bold", "text-dark");
          textSpan.classList.add("fw-normal", "text-body");
        }

        const newBadge = currentItem.querySelector('span[style*="background-color: #e0e7ff"]') || currentItem.querySelector(".badge");
        if (newBadge && newBadge.textContent.trim() === "NEW") {
          newBadge.remove();
        }

        // 2. モーダル表示＆DB既読処理実行
        if (typeof fetchAndDisplaySingleReport === "function") {
          await fetchAndDisplaySingleReport(reportId);

          // 3. 🎯【最重要】DB既読化完了後、カレンダーの最新状態を再計算して再描画
          if (typeof renderCalendarInternal === "function") {
            await renderCalendarInternal();
          }
        } else {
          console.error("❌ fetchAndDisplaySingleReport 関数が見つかりません。");
        }
      });
    });
  } catch (err) {
    console.error("❌ レポート一覧取得失敗:", err);
  }
}

// =========================================================================
// 共通基盤（SPA）用にのみ公開
// =========================================================================
// ◆ カレンダー・画面全体の統括レンダリング関数（公開用）
//  【目的】画面遷移時やリロード時に呼び出され、カレンダーの基準日を「今日」にリセットした上でUIパーツ一式を初期起動する
window.renderCalendar = async () => {
  // Step1: ページが切り替わって戻ってきた際の状態ズレを防ぐため、基準カレンダー日付を「本日の日時」へ強制リセット
  if (typeof currentCalendarDate !== "undefined") {
    currentCalendarDate = new Date();
  }
  if (window.currentCalendarDate) {
    window.currentCalendarDate = new Date();
  }

  // Step2: 年月セレクトボックスのDOM選択肢を生成・構築
  initCalendarSelector();

  // Step3: ユーザー絞り込みフィルター変更時のイベントを再バインド
  const userSelect = document.getElementById("target_user_id");
  if (userSelect) {
    userSelect.onchange = onFilterChange;
  }

  // Step4: 統合データ取得・レンダリング更新関数を呼び出し初期描画をキック
  await onFilterChange();
};

// ◆ フィルター条件変更・再描画ハブ処理
//  【目的】年月やユーザーの条件が変更された際に、多重実行ロックをかけつつ「リスト」と「カレンダーグリッド」の双方を最新の状態で再ビルドする
async function onFilterChange() {
  // カレンダー側で現在進行中のレンダリング処理がある場合は重複処理を防止
  if (isCalendarRendering) return;

  // 左右のUIコンポーネント（過去リスト、カレンダーセル）のデータを最新化して再描画
  await updateMainPageReportList();
  await renderCalendarInternal();
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("main.js: 初期化は共通基盤からの呼び出しを待ちます。");
});
