// 検索窓で使うために、取得した全ユーザーデータを一時保管しておく変数
let allUsers = [];
// すべての関数から共通して参照・操作できるように、ファイルの先頭（グローバル）で宣言
let isFormDirty = false;

/**
 * 管理者専用画面（admin.html）初期化関数
 */
async function initializeAdminPage() {
  console.log("管理者専用画面の初期化を開始します...");

  const modalContainer = document.getElementById("modal_container");

  // ▼ 💡【修正】PC用とスマホ用の両方のボタンを取得
  const newButtonPc = document.getElementById("user_new_button_pc");
  const newButtonSp = document.getElementById("user_new_button_sp");
  const newButtons = [newButtonPc, newButtonSp].filter(Boolean); // 存在するボタンのみ抽出

  if (!modalContainer) return;

  try {
    // 1. モーダルHTMLを非同期で読み込んで合体
    const response = await fetch("./admin-users-modal.html");
    if (!response.ok) throw new Error(`モーダルの読み込みエラー: ${response.status}`);
    modalContainer.innerHTML = await response.text();

    const userModalElement = document.getElementById("userModal");

    let userModal = null;
    if (userModalElement) {
      userModal = bootstrap.Modal.getInstance(userModalElement) || new bootstrap.Modal(userModalElement, { backdrop: "static" });
    }

    // フォーム要素を取得
    const form = document.getElementById("user_form");

    // ==========================================
    // カンパニーマスターから会社名を取得
    // ==========================================
    console.log("Supabaseから会社マスタを取得中...");
    const { data: companies, error: companyLoadError } = await supabase
      .from("company_master")
      .select("id, company_name")
      .order("company_name", { ascending: true });

    if (companyLoadError) throw companyLoadError;

    const companySelect = userModalElement ? userModalElement.querySelector("#company_id") : null;
    if (companySelect) {
      companySelect.innerHTML = '<option value="" selected disabled>選択してください</option>';
      companies.forEach((company) => {
        const option = document.createElement("option");
        option.value = company.id;
        option.textContent = company.company_name;
        companySelect.appendChild(option);
      });
      console.log("会社マスタの連携が完了しました！");
    }

    // ==========================================
    // ▼ 💡【修正】PC用・スマホ用どちらの新規登録ボタンを押してもモーダルを開く
    // ==========================================
    if (userModal) {
      newButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          setupModalForNew(userModalElement);
          userModal.show();

          // モーダルが完全に開ききったタイミングでフォーカスを当てる
          userModalElement.addEventListener(
            "shown.bs.modal",
            () => {
              const lastNameInput = document.getElementById("last_name");
              if (lastNameInput) {
                lastNameInput.focus();
              }
            },
            { once: true }
          );
        });
      });
    }

    // パスワードの表示/非表示切り替え
    const togglePasswordBtn = document.getElementById("toggle_password_btn");
    if (togglePasswordBtn) {
      togglePasswordBtn.addEventListener("click", () => {
        const passwordInput = document.getElementById("password");
        const passwordIcon = document.getElementById("toggle_password_icon");
        if (passwordInput && passwordIcon) {
          if (passwordInput.type === "password") {
            passwordInput.type = "text";
            passwordIcon.classList.remove("bi-eye");
            passwordIcon.classList.add("bi-eye-slash");
          } else {
            passwordInput.type = "password";
            passwordIcon.classList.remove("bi-eye-slash");
            passwordIcon.classList.add("bi-eye");
          }
        }
      });
    }

    // ==========================================
    // メールアドレスのリアルタイム重複チェック
    // ==========================================
    const emailInput = document.getElementById("login_email");
    const emailDuplicateFeedback = document.getElementById("email_duplicate_feedback");
    const emailInvalidFeedback = document.getElementById("email_invalid_feedback");
    const submitButton = document.getElementById("submit_button");

    if (emailInput && form) {
      emailInput.addEventListener("blur", async () => {
        const email = emailInput.value.trim();

        if (!email || !email.includes("@")) {
          if (emailDuplicateFeedback) emailDuplicateFeedback.style.display = "none";
          return;
        }

        const editUserId = form.getAttribute("data-edit-id");

        try {
          console.log("メールアドレスの重複を確認中...", email);

          let query = supabase.from("user_master").select("id").eq("login_email", email);

          if (editUserId) {
            query = query.neq("id", editUserId);
          }

          const { data, error } = await query.maybeSingle();

          if (error) throw error;

          if (data) {
            console.warn("メールアドレスの重複を検知しました。");
            emailInput.classList.add("is-invalid");
            if (emailInvalidFeedback) emailInvalidFeedback.style.display = "none";
            if (emailDuplicateFeedback) emailDuplicateFeedback.style.display = "block";
            if (submitButton) submitButton.disabled = true;
          } else {
            emailInput.classList.remove("is-invalid");
            if (emailDuplicateFeedback) emailDuplicateFeedback.style.display = "none";
            if (submitButton) submitButton.disabled = false;
          }
        } catch (err) {
          console.error("重複チェック中にエラーが発生しました:", err);
        }
      });

      emailInput.addEventListener("input", () => {
        emailInput.classList.remove("is-invalid");
        if (emailDuplicateFeedback) emailDuplicateFeedback.style.display = "none";
        if (submitButton) submitButton.disabled = false;
      });
    }

    // ==========================================
    // フォームの変更検知
    // ==========================================
    if (form) {
      form.addEventListener("input", () => {
        isFormDirty = true;
        console.log("フォームの変更を検知しました: isFormDirty =", isFormDirty);
      });
    }

    // ▼ 💡【修正】新規ボタン押下時にフォーム変更フラグをクリア
    newButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        isFormDirty = false;
      });
    });

    // ==========================================
    // 確認用ミニモーダルの初期化
    // ==========================================
    const confirmDiscardModalElement = document.getElementById("confirmDiscardModal");
    let confirmDiscardModal = null;

    if (confirmDiscardModalElement) {
      confirmDiscardModal =
        bootstrap.Modal.getInstance(confirmDiscardModalElement) ||
        new bootstrap.Modal(confirmDiscardModalElement, {
          backdrop: "static",
          keyboard: false,
        });
    }

    // メインモーダルの右上×ボタンとキャンセルボタン
    if (userModalElement) {
      const mainCloseButtons = userModalElement.querySelectorAll("#cancel_button, .modal-header .btn-close");

      mainCloseButtons.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          if (isFormDirty && confirmDiscardModal) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            confirmDiscardModal.show();
          }
        });
      });
    }

    // 確認モーダルで「いいえ（戻る）」を押した場合
    const discardCancelBtn = document.getElementById("btn_confirm_discard_cancel");
    if (discardCancelBtn) {
      discardCancelBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (confirmDiscardModal) confirmDiscardModal.hide();
        if (userModal) userModal.show();
        console.log("「いいえ」が押されたため、編集状態を維持して戻ります。");
      });
    }

    // 確認モーダルで「はい、閉じます」を押した場合
    const discardYesBtn = document.getElementById("btn_confirm_discard_yes");
    if (discardYesBtn) {
      discardYesBtn.addEventListener("click", (event) => {
        event.preventDefault();

        isFormDirty = false;
        if (confirmDiscardModal) confirmDiscardModal.hide();
        if (userModal) userModal.hide();

        document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
        document.body.style.overflow = "";
        document.body.style.paddingRight = "";
      });
    }

    // 3. フォームの「保存」設定 ＆ Enterキーの防護設定
    if (userModal) setupFormSubmit(userModal);
    window.preventFormEnterSubmit("user_form");

    // 一覧表示
    await fetchAndRenderUserList();
    setupEditButtonEvents();

    // ==========================================
    // 検索窓の入力イベントを監視
    // ==========================================
    const searchInput = document.getElementById("user_search_input");
    if (searchInput) {
      searchInput.addEventListener("input", (event) => {
        const keyword = event.target.value.toLowerCase().trim();

        const filteredUsers = allUsers.filter((user) => {
          const name = (user.user_name || "").toLowerCase();
          const company = (user.company_name || "").toLowerCase();
          return name.includes(keyword) || company.includes(keyword);
        });

        const tbody = document.getElementById("user_list_tbody");
        const mobileContainer = document.getElementById("user_list_mobile");
        renderUserTable(filteredUsers, tbody, mobileContainer);
      });
    }
  } catch (error) {
    console.error("初期化エラー:", error);
    if (typeof showToast === "function") {
      showToast(getFriendlyErrorMessage(error), "error");
    }
  }
}

/**
 * 新規登録用にモーダルを初期化
 */
function setupModalForNew(modalEl) {
  if (!modalEl) return;
  const form = modalEl.querySelector("#user_form");
  const title = modalEl.querySelector("#userModalLabel");
  const passwordInput = modalEl.querySelector("#password");
  const passwordLabel = modalEl.querySelector("#password_label");

  if (form) {
    form.reset();
    form.classList.remove("was-validated");
    form.removeAttribute("data-edit-id");
  }
  if (title) title.textContent = "ユーザー情報の登録";
  if (passwordLabel) passwordLabel.innerHTML = 'パスワード <span class="text-danger">*</span>';
  if (passwordInput) {
    passwordInput.required = true;
    passwordInput.placeholder = "6〜20文字の半角英数字";
  }
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
    event.preventDefault();
    event.stopPropagation();

    if (!form.checkValidity()) {
      form.classList.add("was-validated");

      const firstInvalidInput = form.querySelector(":invalid");
      if (firstInvalidInput) {
        firstInvalidInput.focus();
        firstInvalidInput.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }

    const editUserId = form.getAttribute("data-edit-id");
    const isEditMode = !!editUserId;

    const submitButton = document.getElementById("submit_button");
    if (!submitButton) return;
    const originalButtonText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = isEditMode
      ? '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 更新中...'
      : '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 登録中...';

    const lastName = document.getElementById("last_name").value.trim();
    const firstName = document.getElementById("first_name").value.trim();
    const userName = `${lastName} ${firstName}`;

    const companyId = document.getElementById("company_id").value;
    const loginEmail = document.getElementById("login_email").value.trim();
    const password = document.getElementById("password").value;
    const role = document.getElementById("role").value;
    const isActive = document.getElementById("is_active").value === "true";
    const avatarUrl = document.getElementById("avatar_url").value;

    if (isEditMode && password.length > 0) {
      const alphanumericRegex = /^[a-zA-Z0-9]+$/;
      if (password.length < 6 || password.length > 20 || !alphanumericRegex.test(password)) {
        showToast("パスワードは6〜20文字の半角英数字で入力してください。", "error");
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonText;
        return;
      }
    }

    try {
      if (!supabase) throw new Error("Supabaseが初期化されていません。");

      if (isEditMode) {
        console.log(`Supabaseのユーザー情報を更新中... ID: ${editUserId}`);

        if (password && password.length > 0) {
          console.log("パスワードの変更を検知。Edge Functions経由で更新します.");
          const { data: funcData, error: funcError } = await supabase.functions.invoke("update-user-password", {
            body: { userId: editUserId, password: password },
          });

          if (funcError || (funcData && funcData.error)) {
            const errorMsg = funcError ? funcError.message : funcData.error;
            throw new Error(`Auth情報の更新に失敗しました: ${errorMsg}`);
          }
          console.log("Edge Functions経由でのパスワード更新に成功！");
        }

        const { error: dbError } = await supabase
          .from("user_master")
          .update({
            last_name: lastName,
            first_name: firstName,
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
        console.log("Supabaseへ新規ユーザー登録をリクエスト中...", loginEmail);

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: loginEmail,
          password: password,
          options: {
            persistSession: false,
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("アカウントの作成に失敗しました。");

        const { error: dbError } = await supabase.from("user_master").insert([
          {
            id: authData.user.id,
            login_email: loginEmail,
            last_name: lastName,
            first_name: firstName,
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

      isFormDirty = false;
      if (userModal) userModal.hide();
      form.reset();
      form.removeAttribute("data-edit-id");
      form.classList.remove("was-validated");

      if (typeof fetchAndRenderUserList === "function") {
        fetchAndRenderUserList();
      }
    } catch (error) {
      console.error("処理中にエラーが発生しました:", error);
      showToast(getFriendlyErrorMessage(error), "error");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = originalButtonText;
    }
  });
}

/**
 * Supabaseから「登録が古い順」で取得して画面に描画する
 */
async function fetchAndRenderUserList() {
  console.log("Supabaseからユーザー一覧を取得中...");

  const tbody = document.getElementById("user_list_tbody");
  const mobileContainer = document.getElementById("user_list_mobile");

  if (!tbody) {
    console.warn("ユーザー一覧テーブル（tbody）が見つからないため、描画をスキップします。");
    return;
  }

  try {
    const { data: users, error: userError } = await supabase.from("user_master").select("*").order("create_at", { ascending: true });
    if (userError) throw userError;

    const { data: companies, error: companyError } = await supabase.from("company_master").select("id, company_name");
    if (companyError) {
      console.warn("会社名の取得に失敗したため、結合をスキップします:", companyError);
    }

    const mergedUsers = users.map((user) => {
      const matchedCompany = companies ? companies.find((c) => c.id === user.company_id) : null;
      return {
        ...user,
        company_name: matchedCompany ? matchedCompany.company_name : "所属なし",
      };
    });

    allUsers = mergedUsers;
    renderUserTable(mergedUsers, tbody, mobileContainer);
  } catch (error) {
    console.error("ユーザー一覧の取得に失敗しました:", error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">データの取得に失敗しました: ${error.message}</td></tr>`;
    if (mobileContainer) {
      mobileContainer.innerHTML = `<div class="text-danger text-center p-3">データの取得に失敗しました: ${error.message}</div>`;
    }
  }
}

/**
 * PC用テーブルとスマホ用カードリストへデータを流し込む
 */
function renderUserTable(users, tbody, mobileContainer) {
  tbody.innerHTML = "";
  if (mobileContainer) mobileContainer.innerHTML = "";

  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr id="no_data_row"><td colspan="7" class="text-center text-muted py-5">登録されているユーザーがいません。</td></tr>';
    if (mobileContainer) {
      mobileContainer.innerHTML = `
        <div id="no_data_mobile" class="text-center py-5 text-muted">
          <div class="mb-2"><i class="bi bi-people text-secondary" style="font-size: 2.5rem; opacity: 0.5"></i></div>
          <p class="mb-1 fw-bold">登録されている従業員がいません</p>
        </div>`;
    }
    return;
  }

  users.forEach((user, index) => {
    const disabledClass = user.is_active === false ? "is-disabled" : "";

    const roleBadge =
      user.role === "admin"
        ? '<span class="badge bg-danger-subtle text-danger">管理者</span>'
        : '<span class="badge bg-primary-subtle text-primary">一般</span>';

    const statusBadge = user.is_active
      ? '<span class="badge bg-success-subtle text-success">有効</span>'
      : '<span class="badge bg-secondary-subtle text-secondary">無効</span>';

    const avatarPath = user.avatar_url && user.avatar_url !== "default-avatar.png" ? user.avatar_url : "assets/default-avatar.png";
    const avatarImg = `<img src="${avatarPath}" class="rounded-circle" width="32" height="32" style="object-fit: cover; background-color: #f1f5f9;">`;

    const tr = document.createElement("tr");
    if (disabledClass) tr.classList.add(disabledClass);

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

    if (mobileContainer) {
      const cardDiv = document.createElement("div");
      cardDiv.className = `card border-0 shadow-sm mb-2 bg-white rounded-3 ${disabledClass}`;

      cardDiv.innerHTML = `
        <div class="card-body p-3 position-relative">
          <div class="mb-2">
            <div class="fw-bold text-dark text-truncate">
              <span class="text-muted small me-2">${index + 1}</span>${user.user_name || "未設定"}
            </div>
            <div class="small text-muted text-truncate ms-3">${user.company_name}</div>
          </div>
          <div class="ms-3" style="padding-right: 45px;"> 
            <div class="small text-muted mb-2 text-truncate">${user.login_email}</div>
            <div class="d-flex gap-2">
              ${roleBadge}
              ${statusBadge}
            </div>
          </div>
          <div class="position-absolute" style="bottom: 15px; right: 15px; z-index: 10;">
            <button class="btn btn-sm btn-light rounded-circle border shadow-sm edit-user-btn d-flex align-items-center justify-content-center" data-id="${user.id}" style="width:36px; height:36px;">
              <i class="bi bi-pencil-square small"></i>
            </button>
          </div>
        </div>
      `;
      mobileContainer.appendChild(cardDiv);
    }
  });
}

/**
 * 従業員一覧の「編集」ボタンクリックイベント
 */
function setupEditButtonEvents() {
  const cardBody = document.querySelector(".card-body.p-0");
  if (!cardBody) return;

  cardBody.addEventListener("click", async (event) => {
    let userId = null;

    if (window.innerWidth < 768) {
      const clickedCard = event.target.closest("#user_list_mobile .card");
      if (clickedCard) {
        const editButton = clickedCard.querySelector(".edit-user-btn");
        if (editButton) userId = editButton.getAttribute("data-id");
      }
    }

    if (!userId) {
      const editButton = event.target.closest(".edit-user-btn");
      if (editButton) userId = editButton.getAttribute("data-id");
    }

    if (userId) {
      console.log("編集アクションがトリガーされました。ユーザーID:", userId);
      isFormDirty = false;

      const userModalElement = document.getElementById("userModal");

      let userModal = null;
      if (userModalElement) {
        userModal = bootstrap.Modal.getInstance(userModalElement) || new bootstrap.Modal(userModalElement, { backdrop: "static" });
      }

      if (userModalElement && userModal) {
        await setupModalForEdit(userModalElement, userId);
        userModal.show();
      }
    }
  });
}

/**
 * 編集用にモーダルを初期化し、Supabaseから最新データを取得してフォームにセットする関数
 */
async function setupModalForEdit(modalEl, userId) {
  if (!modalEl) return;
  const form = modalEl.querySelector("#user_form");
  const title = modalEl.querySelector("#userModalLabel");
  const passwordInput = modalEl.querySelector("#password");
  const passwordLabel = modalEl.querySelector("#password_label");

  if (form) {
    form.reset();
    form.classList.remove("was-validated");
  }

  if (title) title.textContent = "ユーザー情報の編集";

  if (passwordLabel) passwordLabel.innerHTML = 'パスワード <span class="text-muted">(変更する場合のみ入力)</span>';
  if (passwordInput) {
    passwordInput.required = false;
    passwordInput.removeAttribute("minlength");
    passwordInput.setAttribute("maxlength", "20");
    passwordInput.placeholder = "変更しない場合は空欄のまま（変更時は6〜20文字）";
  }

  try {
    console.log(`Supabaseからユーザー(ID: ${userId})の最新情報を取得中...`);

    const { data: user, error } = await supabase.from("user_master").select("*").eq("id", userId).single();

    if (error) throw error;

    if (user && form) {
      form.querySelector("#last_name").value = user.last_name || "";
      form.querySelector("#first_name").value = user.first_name || "";
      form.querySelector("#user_name").value = user.user_name || "";
      form.querySelector("#company_id").value = user.company_id || "";
      form.querySelector("#login_email").value = user.login_email || "";
      form.querySelector("#role").value = user.role || "staff";
      form.querySelector("#is_active").value = user.is_active ? "true" : "false";
      form.querySelector("#avatar_url").value = user.avatar_url || "";

      form.setAttribute("data-edit-id", user.id);

      const timestampsArea = modalEl.querySelector("#timestamps_area");
      const createdAtText = modalEl.querySelector("#created_at_text");
      const updatedAtText = modalEl.querySelector("#updated_at_text");

      if (timestampsArea && createdAtText && updatedAtText) {
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

        createdAtText.textContent = formatDate(user.created_at || user.create_at);
        updatedAtText.textContent = formatDate(user.updated_at);

        timestampsArea.style.display = "block";
      }
    }
  } catch (error) {
    console.error("編集データの取得に失敗しました:", error);
    showToast("データの読み込みに失敗しました。", "error");
  }
}

/**
 * エラー内容を日本語のメッセージに変換する翻訳機
 */
function getFriendlyErrorMessage(error) {
  const errorMsg = (error.message || "").toLowerCase();

  if (errorMsg.includes("already registered") || errorMsg.includes("user_already_exists") || errorMsg.includes("duplicate key")) {
    return "そのメールアドレスはすでに登録されています。別のメールアドレスを使用してください。";
  }
  if (errorMsg.includes("password should be") || errorMsg.includes("weak_password")) {
    return "パスワードは6文字以上の英数字で入力してください。";
  }
  if (errorMsg.includes("network") || errorMsg.includes("failed to fetch")) {
    return "ネットワーク接続に問題があります。インターネット環境を確認してください。";
  }
  return `処理に失敗しました: ${error.message}`;
}