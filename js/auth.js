const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const errorEl = document.getElementById("error");
const loginBtn = document.getElementById("loginBtn");
const showSignupEl = document.getElementById("showSignup");

let mode = "login"; // 'login' | 'signup'

// If already signed in, skip straight to the POS screen.
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "pos.html";
});

showSignupEl.addEventListener("click", (e) => {
  e.preventDefault();
  mode = mode === "login" ? "signup" : "login";
  loginBtn.textContent = mode === "login" ? "Sign in" : "Create account";
  showSignupEl.textContent = mode === "login"
    ? "Create a staff account"
    : "Already have an account? Sign in";
  errorEl.textContent = "";
});

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Enter both email and password.";
    return;
  }

  loginBtn.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      errorEl.style.color = "var(--ok)";
      errorEl.textContent = "Account created. You can sign in now.";
      loginBtn.disabled = false;
      return;
    }
    window.location.href = "pos.html";
  } catch (err) {
    errorEl.style.color = "var(--danger)";
    errorEl.textContent = err.message || "Something went wrong.";
  } finally {
    loginBtn.disabled = false;
  }
});

passwordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

document.getElementById("forgotPassword").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = emailEl.value.trim();
  if (!email) {
    errorEl.style.color = "var(--danger)";
    errorEl.textContent = "Enter your email above first, then click 'Forgot password?'.";
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname.replace("index.html", "")}reset-password.html`,
  });
  errorEl.style.color = error ? "var(--danger)" : "var(--ok)";
  errorEl.textContent = error ? error.message : "Check your email for a reset link.";
});
