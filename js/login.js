document.addEventListener("DOMContentLoaded", () => {
  console.log("ログイン画面のJSが正常に読み込まれました");

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const errorContainer = document.getElementById("errorMessage");
  const passwordGroup = document.getElementById("password-group");

  // 画面表示時のフォーカス
  if (emailInput) emailInput.focus();

  // ログインボタン押下時のバリデーション処理
  if (loginBtn) {
    loginBtn.addEventListener("click", async (event) => {
      event.preventDefault();

      // エラー表示のリセット
      errorContainer.style.display = "none";
      errorContainer.innerText = "";

      // 入力された値を取得する
      const emailValue = emailInput.value.trim();
      const passwordValue = passwordInput.value;

      // 各種バリデーションチェック
      if (emailValue === "") {
        showError("メールアドレスを入力してください", emailInput);
        return;
      }
      if (!validateEmail(emailValue)) {
        showError("正しいメールアドレス形式で入力してください", emailInput);
        return;
      }
      if (passwordValue === "") {
        showError("パスワードを入力してください", passwordInput);
        return;
      }
      if (passwordValue.length < 6) {
        showError("パスワードは6文字以上で入力してください", passwordInput);
        return;
      }
      if (passwordValue.length > 20) {
        showError("パスワードは20文字以内で入力してください", passwordInput);
        return;
      }

      console.log("入力OK。Supabase認証へ進みます");

      try {
        // 🔄 ログイン実行中にボタンを連打されないように無効化
        loginBtn.disabled = true;
        loginBtn.innerText = "ログイン中...";

        /* ====================================================================
         * ✨ Supabase 認証処理の組み込み
         * ==================================================================== */
        const supabaseClient = window.supabase || supabase;

        if (!supabaseClient) {
          throw new Error("Supabaseクライアントが初期化されていません。");
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: emailValue,
          password: passwordValue,
        });

        // ❌ Supabase側で認証エラーが起きた場合
        if (error) {
          console.error("ログインエラー:", error.message);

          // --- ここを追加して修正 ---
          loginBtn.disabled = false;
          loginBtn.innerText = "ログイン";
          // ------------------------

          // ユーザー向けの優しいメッセージ
          showError("メールアドレスまたはパスワードが正しくありません", emailInput);
          return;
        }

        // 🟢 ログイン成功時
        if (data && data.user) {
          console.log("ログイン成功！ユーザー情報:", data.user);

          try {
            // 💡 ログイン画面（ログイン中...）のままで、ユーザー名と権限を先読みする
            const { data: masterData } = await supabaseClient.from("user_master").select("user_name, role").eq("id", data.user.id).single();

            if (masterData) {
              console.log("ユーザーデータをログイン画面側で先取りしました:", masterData);
              // index.htmlへ引き継ぐためにLocalStorageに一時保存
              localStorage.setItem("cached_user_name", masterData.user_name);
              localStorage.setItem("cached_user_role", masterData.role);
            }
          } catch (e) {
            console.warn("データ先読みに失敗しましたが、遷移を続行します:", e.message);
          }

          // 🚀 すべての裏方準備がログイン画面のままで完了したので、満を持してジャンプ！
          window.location.href = "index.html";
        }
      } catch (err) {
        console.error("予期せぬ例外が発生しました:", err);
        showError("システムエラーが発生しました。時間を置いて再度お試しください。", emailInput);

        if (loginBtn) {
          loginBtn.disabled = false;
          loginBtn.innerText = "ログイン";
        }
      }
    });
  }

  // パスワードの表示・非表示切り替え
  const togglePasswordBtn = document.getElementById("toggle_password");
  if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPassword = passwordInput.getAttribute("type") === "password";
      passwordInput.setAttribute("type", isPassword ? "text" : "password");
      const icon = togglePasswordBtn.querySelector("i");
      if (isPassword) {
        // パスワードが見える状態（斜線あり）
        icon.className = "bi bi-eye-slash text-secondary";
      } else {
        // パスワードが隠れた状態（普通の目）
        icon.className = "bi bi-eye text-secondary";
      }
    });
  }

  // --- エラー表示と枠線制御のコア関数 ---
  function showError(message, inputElement) {
    errorContainer.innerText = message;
    errorContainer.style.display = "block";

    // 一旦全ての状態をリセット
    emailInput.classList.remove("is-invalid-focus", "is-focused");
    passwordGroup.classList.remove("is-invalid-focus", "is-focused");

    // 対象の要素を赤く光らせる
    if (inputElement.id === "password") {
      passwordGroup.classList.add("is-invalid-focus");
    } else {
      inputElement.classList.add("is-invalid-focus");
    }

    inputElement.focus();

    // 入力開始時に赤枠を消し、青枠を復活させる
    inputElement.addEventListener(
      "input",
      () => {
        inputElement.classList.remove("is-invalid-focus");
        passwordGroup.classList.remove("is-invalid-focus");
        errorContainer.style.display = "none";

        // フォーカスが当たっている方を青く光らせる
        if (inputElement.id === "password") {
          passwordGroup.classList.add("is-focused");
        } else {
          inputElement.classList.add("is-focused");
        }
      },
      { once: true },
    );
  }

  // メール形式チェック用
  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
});
