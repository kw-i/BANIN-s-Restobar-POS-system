const fullNameEl = document.getElementById("fullName");
const phoneEl = document.getElementById("phone");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const confirmPasswordEl = document.getElementById("confirmPassword");
const errorEl = document.getElementById("error");
const signupBtn = document.getElementById("signupBtn");

signupBtn.addEventListener("click", async () => {
  const full_name = fullNameEl.value.trim();
  const phone = phoneEl.value.trim();
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  const confirmPassword = confirmPasswordEl.value;
  errorEl.style.color = "var(--danger)";
  errorEl.textContent = "";

  if (!full_name || !phone || !email || !password) {
    errorEl.textContent = "Please fill in every field.";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirmPassword) {
    errorEl.textContent = "Passwords don't match.";
    return;
  }

  signupBtn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signUp({
      email, password,
      options: { data: { full_name, phone } },
    });
    if (error) throw error;

    // The account exists but is unapproved — sign out immediately so
    // nobody gets into the app before an admin has reviewed them.
    await supabaseClient.auth.signOut();

    document.getElementById("formArea").style.display = "none";
    errorEl.textContent = "";
    document.getElementById("hint").style.color = "var(--ok)";
    document.getElementById("hint").textContent =
      "Account created! An admin needs to approve you before you can log in. You'll be able to sign in once that happens.";
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong.";
  } finally {
    signupBtn.disabled = false;
  }
});
