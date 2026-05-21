/**
 * 管理者専用画面（admin.html）初期化関数
 */
async function initializeAdminPage() {
  console.log("管理者専用画面の初期化を開始します...");

  const modalContainer = document.getElementById("modal_container");
  const newButton = document.getElementById("user_new_button");

  if (!modalContainer) return;

  try {
    // 1. モーダルHTMLを非同期で読み込んで合体
    const response = await fetch("./admin-users-modal.html");
    if (!response.ok)
      throw new Error(`モーダルの読み込みエラー: ${response.status}`);
    modalContainer.innerHTML = await response.text();

    const userModalElement = document.getElementById("userModal");
    const userModal = new bootstrap.Modal(userModalElement);

    // ==========================================
    // カンパニーマスターから会社名を取得してセレクトボックスに反映
    // ==========================================
    console.log("Supabaseから会社マスタを取得中...");
    const { data: companies, error: companyLoadError } = await supabase
      .from("company_master")
      .select("id, company_name")
      .order("company_name", { ascending: true }); // 会社名順に並び替え

    if (companyLoadError) throw companyLoadError;

    const companySelect = userModalElement.querySelector("#company_id");
    if (companySelect) {
      // 一度既存の選択肢をクリアして、初期選択肢だけにする
      companySelect.innerHTML =
        '<option value="" selected disabled>選択してください</option>';

      // 取得した会社データを1つずつ選択肢（option）として追加
      companies.forEach((company) => {
        const option = document.createElement("option");
        option.value = company.id; // データベースにはIDを保存
        option.textContent = company.company_name; // 画面には会社名を表示
        companySelect.appendChild(option);
      });
      console.log("会社マスタの連携が完了しました！");
    }

    // 2. 新規ユーザー登録ボタンのイベント
    if (newButton) {
      newButton.addEventListener("click", () => {
        setupModalForNew(userModalElement);
        userModal.show();
      });
    }

    // ==========================================
    // パスワードの表示/非表示切り替えイベント
    // ==========================================
    const togglePasswordBtn = document.getElementById("toggle_password_btn");
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", () => {
        const passwordInput = document.getElementById("password");
        const passwordIcon = document.getElementById("toggle_password_icon");

        if (passwordInput && passwordIcon) {
          // 現在がpassword（隠し状態）ならtext（見える状態）に、逆ならpasswordに戻す
          if (passwordInput.type === "password") {
            passwordInput.type = "text";
            passwordIcon.classList.remove("bi-eye");
            passwordIcon.classList.add("bi-eye-slash"); // 斜線付きの目のアイコン
          } else {
            passwordInput.type = "password";
            passwordIcon.classList.remove("bi-eye-slash");
            passwordIcon.classList.add("bi-eye"); // 通常の目のアイコン
          }
        }
      });
    }

    // 3. フォームの「保存（送信）」イベントを設定
    setupFormSubmit(userModal);

    // 画面初期化の最後に、自動でデータを読み込んで一覧を表示する
    await fetchAndRenderUserList();

    // 編集ボタンをクリックした時のイベントを設定
    setupEditButtonEvents();
  } catch (error) {
    console.error("初期設定中にエラーが発生しました:", error);
  }
}

/**
 * 新規登録用にモーダルを初期化
 */
function setupModalForNew(modalEl) {
  const form = modalEl.querySelector("#user_form");
  const title = modalEl.querySelector("#userModalLabel");
  const passwordInput = modalEl.querySelector("#password");
  const passwordLabel = modalEl.querySelector("#password_label");

  if (form) {
    form.reset();
    form.classList.remove("was-validated"); // バリデーションの赤枠を消す
  }
  if (title) title.textContent = "ユーザー情報の登録";
  if (passwordLabel)
    passwordLabel.innerHTML = 'パスワード <span class="text-danger">*</span>';
  if (passwordInput) {
    passwordInput.required = true;
    passwordInput.placeholder = "6〜20文字の半角英数字";
  }
  // 新規登録時はタイムスタンプエリアを非表示にする
  const timestampsArea = modalEl.querySelector("#timestamps_area");
  if (timestampsArea) timestampsArea.style.display = "none";
}

/**
 * 新規登録とデータ更新（編集）を自動で判別して処理する関数
 */
function setupFormSubmit(userModal) {
  const form = document.getElementById("user_form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // ページが勝手にリロードされるのを防ぐ
    event.stopPropagation();

    // Bootstrapの標準バリデーション（入力チェック）を適用
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    // 現在フォームに「編集対象のID」がセットされているかを確認する
    const editUserId = form.getAttribute("data-edit-id");
    const isEditMode = !!editUserId; // IDがあれば編集モード（true）、無ければ新規登録（false）

    // 保存ボタンを連打できないように無効化
    const submitButton = document.getElementById("submit_button");
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = isEditMode
      ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 更新中...'
      : '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 登録中...';

    // フォームから入力値を取得
    const userName = document.getElementById("user_name").value.trim();
    const companyId = document.getElementById("company_id").value;
    const loginEmail = document.getElementById("login_email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;

    // 💡 修正：文字列の "true" / "false" を本当の boolean型 に変換して取得
    const isActive = document.getElementById("is_active").value === "true";
    const avatarUrl = document.getElementById("avatar_url").value;

    // 編集モード用のパスワード バリデーション（文字数 ＋ 半角英数字チェック）
    if (isEditMode && password.length > 0) {
      // 半角英数字のみにマッチする正規表現
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;

      if (
        password.length < 6 ||
        password.length > 20 ||
        !alphanumericRegex.test(password)
      ) {
        showToast(
          "パスワードは6〜20文字の半角英数字で入力してください。",
          "error",
        );
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
        return; // 条件に合わない場合は処理をストップ
      }
    }

    try {
      if (!supabase) {
        throw new Error("Supabaseが初期化されていません。");
      }

      if (isEditMode) {
        // ==========================================
        // 【編集モード（UPDATE）の処理】
        // ==========================================
        console.log(`Supabaseのユーザー情報を更新中... ID: ${editUserId}`);

        // 💡 【追加】もしパスワード欄に入力があったら、先にAuth（認証）側のパスワードを更新する
        if (password && password.length > 0) {
          console.log(
            "パスワードの変更を検知。Edge Functions経由で更新します。",
          );

          // 先ほどアップロードした 'update-user-password' を呼び出す
          const { data: funcData, error: funcError } =
            await supabase.functions.invoke("update-user-password", {
              body: { userId: editUserId, password: password },
            });

          if (funcError || (funcData && funcData.error)) {
            const errorMsg = funcError ? funcError.message : funcData.error;
            throw new Error(`Auth情報の更新に失敗しました: ${errorMsg}`);
          }

          console.log("Edge Functions経由でのパスワード更新に成功！");
        }

        // 1. user_master テーブルの該当ユーザーだけを狙い撃ちして更新
        const { error: dbError } = await supabase
          .from("user_master")
          .update({
            user_name: userName,
            company_id: companyId,
            login_email: loginEmail,
            role: role,
            is_active: isActive,
            avatar_url: avatarUrl,
          })
          .eq("id", editUserId);

        if (dbError) throw dbError;

        showToast("ユーザー情報を更新しました！");
      } else {
        // ==========================================
        // 【新規登録モード（INSERT）の処理】
        // ==========================================
        console.log("Supabaseへ新規ユーザー登録をリクエスト中...", loginEmail);

        // 1. Supabase Auth にアカウントを作成（認証ユーザーの作成）
        const { data: authData, error: authError } = await supabase.auth.signUp(
          {
            email: loginEmail,
            password: password,
          },
        );

        if (authError) throw authError;
        if (!authData.user) throw new Error("アカウントの作成に失敗しました。");

        // 2. 作成されたAuthの「UID（user.id）」を使って、user_master テーブルに詳細情報を登録
        const { error: dbError } = await supabase.from("user_master").insert([
          {
            id: authData.user.id,
            login_email: loginEmail,
            user_name: userName,
            company_id: companyId,
            role: role,
            has_report_access: true,
            is_active: true,
            avatar_url: avatarUrl,
          },
        ]);

        if (dbError) throw dbError;

        showToast("新規ユーザーを登録しました！");
      }

      // ーーー 登録・更新 成功後の共通後処理 ーーー
      userModal.hide();
      form.reset();
      form.removeAttribute("data-edit-id");
      form.classList.remove("was-validated");

      // 一覧表の再読み込み関数を呼び出し、最新データを画面に反映
      if (typeof fetchAndRenderUserList === "function") {
        fetchAndRenderUserList();
      }
    } catch (error) {
      console.error("処理中にエラーが発生しました:", error);
      showToast(`処理に失敗しました: ${error.message || error}`, "error");
    } finally {
      // ボタンを一瞬で元の状態に戻す
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonText;
    }
  });
}

/**
 * 💡 Supabaseから「登録が古い順（1, 2, 3...）」で取得して画面に描画する
 */
async function fetchAndRenderUserList() {
  console.log("Supabaseからユーザー一覧を取得中...");

  const tbody = document.getElementById("user_list_tbody");
  if (!tbody) {
    console.warn(
      "ユーザー一覧テーブル（tbody）が見つからないため、描画をスキップします。",
    );
    return;
  }

  try {
    // 1. ユーザー一覧を「登録が古い順（ascending: true）」で取得
    const { data: users, error: userError } = await supabase
      .from("user_master")
      .select("*")
      .order("create_at", { ascending: true });

    if (userError) throw userError;

    // 2. 会社マスターから「ID」と「会社名」の一覧を取得
    const { data: companies, error: companyError } = await supabase
      .from("company_master")
      .select("id, company_name");

    if (companyError) {
      console.warn(
        "会社名の取得に失敗したため、結合をスキップします:",
        companyError,
      );
    }

    // 3. ユーザーデータに、対応する会社名をドッキングする
    const mergedUsers = users.map((user) => {
      const matchedCompany = companies
        ? companies.find((c) => c.id === user.company_id)
        : null;

      return {
        ...user,
        company_name: matchedCompany ? matchedCompany.company_name : "所属なし",
      };
    });

    console.log("会社名のドッキングに成功しました:", mergedUsers);

    // 4. 結合済みのデータをテーブルに描画する
    renderUserTable(mergedUsers, tbody);
  } catch (error) {
    console.error("ユーザー一覧の取得に失敗しました:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">データの取得に失敗しました: ${error.message}</td></tr>`;
  }
}

/**
 * 💡 上から順番に1, 2, 3...と素直に流し込む
 */
function renderUserTable(users, tbody) {
  tbody.innerHTML = "";

  if (!users || users.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="text-center text-muted">登録されているユーザーがいません。</td></tr>';
    return;
  }

  users.forEach((user, index) => {
    const tr = document.createElement("tr");

    // もしアカウントが無効（is_active が false）なら、行に消込用のクラスを付与する
    if (user.is_active === false) {
      tr.classList.add("is-disabled");
    }

    // 1. 権限（role）の表示
    const roleBadge =
      user.role === "admin"
        ? '<span class="badge bg-danger-subtle">管理者</span>'
        : '<span class="badge bg-primary-subtle">一般</span>';

    // 2. 状態（is_active）の表示
    const statusBadge = user.is_active
      ? '<span class="badge bg-success-subtle">有効</span>'
      : '<span class="badge bg-secondary-subtle">無効</span>';

    // 3. アイコン画像
    const avatarPath =
      user.avatar_url && user.avatar_url !== "default-avatar.png"
        ? user.avatar_url
        : "assets/default-avatar.png";

    const avatarImg = `<img src="${avatarPath}" class="rounded-circle" width="32" height="32" style="object-fit: cover; background-color: #f1f5f9;">`;

    tr.innerHTML = `
      <td><strong>${index + 1}</strong></td>
      <td>
        <div class="d-flex align-items-center gap-2">
          ${avatarImg}
          <div>
            <div class="fw-bold text-dark">${user.user_name || "未設定"}</div>
            <div class="small text-muted" style="font-size: 0.75rem;">${user.company_name}</div>
          </div>
        </div>
      </td>
      <td>${user.login_email}</td>
      <td>${roleBadge}</td>
      <td>${statusBadge}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-secondary edit-user-btn" data-id="${user.id}">
          <i class="bi bi-pencil-square"></i> 編集
        </button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * 💡 従業員一覧テーブル内の「編集」ボタンのクリックイベントを設定する関数
 */
function setupEditButtonEvents() {
  const tbody = document.getElementById("user_list_tbody");
  if (!tbody) return;

  tbody.addEventListener("click", async (event) => {
    const editButton = event.target.closest(".edit-user-btn");
    if (!editButton) return;

    const userId = editButton.getAttribute("data-id");
    console.log("編集ボタンがクリックされました。ユーザーID:", userId);

    const userModalElement = document.getElementById("userModal");
    const userModal =
      bootstrap.Modal.getInstance(userModalElement) ||
      new bootstrap.Modal(userModalElement);

    if (userModalElement && userModal) {
      await setupModalForEdit(userModalElement, userId);
      userModal.show();
    }
  });
}

/**
 * 💡 編集用にモーダルを初期化し、Supabaseから最新データを取得してフォームにセットする関数
 */
async function setupModalForEdit(modalEl, userId) {
  const form = modalEl.querySelector("#user_form");
  const title = modalEl.querySelector("#userModalLabel");
  const passwordInput = modalEl.querySelector("#password");
  const passwordLabel = modalEl.querySelector("#password_label");

  if (form) {
    form.reset();
    form.classList.remove("was-validated");
  }

  if (title) title.textContent = "ユーザー情報の編集";

  if (passwordLabel)
    passwordLabel.innerHTML =
      'パスワード <span class="text-muted">(変更する場合のみ入力)</span>';
  if (passwordInput) {
    passwordInput.required = false; // 編集時は空欄OKにする
    passwordInput.removeAttribute("minlength"); // 空欄（0文字）を許容するために一度外す
    passwordInput.setAttribute("maxlength", "20");
    passwordInput.placeholder =
      "変更しない場合は空欄のまま（変更時は6〜20文字）";
  }

  try {
    console.log(`Supabaseからユーザー(ID: ${userId})の最新情報を取得中...`);

    const { data: user, error } = await supabase
      .from("user_master")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;

    if (user) {
      form.querySelector("#user_name").value = user.user_name || "";
      form.querySelector("#company_id").value = user.company_id || "";
      form.querySelector("#login_email").value = user.login_email || "";
      form.querySelector("#role").value = user.role || "staff";

      // データベースの状態をドロップダウンに反映
      form.querySelector("#is_active").value = user.is_active
        ? "true"
        : "false";

      form.querySelector("#avatar_url").value = user.avatar_url || "";

      form.setAttribute("data-edit-id", user.id);
      // ==========================================
      // 🛠️ 追加：作成日時・更新日時を綺麗にフォーマットして表示
      // ==========================================
      const timestampsArea = modalEl.querySelector("#timestamps_area");
      const createdAtText = modalEl.querySelector("#created_at_text");
      const updatedAtText = modalEl.querySelector("#updated_at_text");

      if (timestampsArea && createdAtText && updatedAtText) {
        // 日本の表記（2026/05/20 14:30）に変換する関数
        const formatDate = (dateStr) => {
          if (!dateStr) return "なし";
          const d = new Date(dateStr);
          return d.toLocaleString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
        };

        // 💡 実際のテーブルの列名が created_at / updated_at だと仮定しています。
        // もしDBの列名が create_at などの場合は user.create_at に書き換えてください。
        createdAtText.textContent = formatDate(
          user.created_at || user.create_at,
        );
        updatedAtText.textContent = formatDate(user.updated_at);

        // エリアを表示する
        timestampsArea.style.display = "block";
      }
    }
  } catch (error) {
    console.error("編集データの取得に失敗しました:", error);
    showToast("データの読み込みに失敗しました。", "error");
  }
}
