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
    loginBtn.addEventListener("click", (event) => {
      event.preventDefault();

      // エラー表示のリセット
      errorContainer.style.display = "none";
      errorContainer.innerText = "";

      // 入力された値を取得する
      // .trim() をつけることで、前後の余計なスペースを自動で削除
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
