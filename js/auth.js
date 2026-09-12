const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const errorEl = document.getElementById("error");
const loginBtn = document.getElementById("loginBtn");
const forgotPasswordEl = document.getElementById("forgotPassword");

// If already signed in (and approved), skip straight to the POS screen.
supabaseClient.auth.getSession().then(async ({ data }) => {
  if (data.session) {
    const approved = await isApproved(data.session);
    if (approved) window.location.href = "pos.html";
    else await supabaseClient.auth.signOut();
  }
});

async function isApproved(session) {
  const { data } = await supabaseClient.from("staff").select("approved").eq("id", session.user.id).single();
  return data && data.approved !== false;
}

loginBtn.addEventListener("click", async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  errorEl.style.color = "var(--danger)";
  errorEl.textContent = "";

  if (!email || !password) {
    errorEl.textContent = "Enter both email and password.";
    return;
  }

  loginBtn.disabled = true;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const approved = await isApproved(data.session);
    if (!approved) {
      await supabaseClient.auth.signOut();
      errorEl.textContent = "Your account is still waiting for admin approval.";
      return;
    }

    window.location.href = "pos.html";
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong.";
  } finally {
    loginBtn.disabled = false;
  }
});

passwordEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loginBtn.click();
});

forgotPasswordEl.addEventListener("click", async (e) => {
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
