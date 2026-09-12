// A styled, in-app confirmation popup — used instead of the browser's
// plain confirm() dialog. Returns a Promise<boolean> (true = confirmed).
function showConfirmModal({ title = "Are you sure?", message = "", confirmText = "Confirm", cancelText = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "420px";
    modal.innerHTML = `
      <div class="modal-header"><div style="font-weight:700" id="cmTitle"></div></div>
      <div class="modal-body"><p id="cmMessage" style="margin:0; color:var(--muted)"></p></div>
      <div class="modal-footer" style="justify-content:flex-end">
        <button class="secondary" id="cmCancel"></button>
        <button id="cmConfirm"></button>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    modal.querySelector("#cmTitle").textContent = title;
    modal.querySelector("#cmMessage").textContent = message;
    const cancelBtn = modal.querySelector("#cmCancel");
    const confirmBtn = modal.querySelector("#cmConfirm");
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;
    if (danger) confirmBtn.classList.add("danger");

    function cleanup(result) { backdrop.remove(); resolve(result); }
    cancelBtn.addEventListener("click", () => cleanup(false));
    confirmBtn.addEventListener("click", () => cleanup(true));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(false); });
  });
}

// Checks whether the signed-in user is an admin (reads public.staff.role).
// Redirects non-admins away from admin-only pages.
async function requireAdmin(session) {
  const { data } = await supabaseClient.from("staff").select("role").eq("id", session.user.id).single();
  if (!data || data.role !== "admin") {
    alert("This page is for admins only.");
    window.location.href = "pos.html";
    return false;
  }
  return true;
}

// Shows/hides the admin-only nav links based on role. Call on every page.
async function applyNavVisibility(session) {
  const { data } = await supabaseClient.from("staff").select("role").eq("id", session.user.id).single();
  const isAdmin = data && data.role === "admin";
  document.querySelectorAll("[data-admin-only]").forEach(el => {
    el.style.display = isAdmin ? "" : "none";
  });
  return isAdmin;
}

// Defense in depth: if an admin revokes someone's approval mid-session,
// kick them out the next time any page checks in.
async function requireApproved(session) {
  const { data } = await supabaseClient.from("staff").select("approved").eq("id", session.user.id).single();
  if (!data || data.approved === false) {
    await supabaseClient.auth.signOut();
    alert("Your account's access has been revoked. Contact an admin.");
    window.location.href = "index.html";
    return false;
  }
  return true;
}

// Presence: updates staff.last_seen_at right away, then every 60s while
// the tab stays open, so the Employees dashboard can show who's active.
function startHeartbeat(session) {
  const beat = () => supabaseClient.from("staff").update({ last_seen_at: new Date().toISOString() }).eq("id", session.user.id);
  beat();
  setInterval(beat, 60 * 1000);
}

// ---------- theme (light/dark) ----------
function initTheme() {
  const saved = localStorage.getItem("banin_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeLabel();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("banin_theme", next);
  updateThemeLabel();
}

function updateThemeLabel() {
  const el = document.getElementById("themeToggleLink");
  if (!el) return;
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  el.textContent = current === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
}

initTheme();

// ---------- change password ----------
function showChangePasswordModal() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "380px";
    modal.innerHTML = `
      <div class="modal-header"><div style="font-weight:700">Change password</div><button class="ghost" id="cpX">✕</button></div>
      <div class="modal-body">
        <input id="cpNew" type="password" placeholder="New password" autocomplete="new-password" />
        <input id="cpConfirm" type="password" placeholder="Confirm new password" autocomplete="new-password" />
        <div class="error" id="cpError"></div>
      </div>
      <div class="modal-footer" style="justify-content:flex-end">
        <button class="secondary" id="cpCancel">Cancel</button>
        <button id="cpSave">Save</button>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function cleanup(result) { backdrop.remove(); resolve(result); }
    modal.querySelector("#cpX").addEventListener("click", () => cleanup(false));
    modal.querySelector("#cpCancel").addEventListener("click", () => cleanup(false));
    modal.querySelector("#cpSave").addEventListener("click", async () => {
      const p1 = modal.querySelector("#cpNew").value;
      const p2 = modal.querySelector("#cpConfirm").value;
      const errorEl = modal.querySelector("#cpError");
      if (!p1 || p1.length < 6) { errorEl.textContent = "Password must be at least 6 characters."; return; }
      if (p1 !== p2) { errorEl.textContent = "Passwords don't match."; return; }
      const { error } = await supabaseClient.auth.updateUser({ password: p1 });
      if (error) { errorEl.textContent = error.message; return; }
      cleanup(true);
    });
  });
}

// ---------- profile dropdown (name, change password, theme, sign out) ----------
async function initProfileMenu(session) {
  const { data } = await supabaseClient.from("staff").select("full_name, email").eq("id", session.user.id).single();
  const nameEl = document.getElementById("profileName");
  const dropdownNameEl = document.getElementById("dropdownName");
  const dropdownEmailEl = document.getElementById("dropdownEmail");
  if (nameEl) nameEl.textContent = (data && data.full_name) || session.user.email;
  if (dropdownNameEl) dropdownNameEl.textContent = (data && data.full_name) || "";
  if (dropdownEmailEl) dropdownEmailEl.textContent = (data && data.email) || session.user.email;

  const btn = document.getElementById("profileBtn");
  const menu = document.getElementById("profileDropdown");
  if (btn && menu) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });
    document.addEventListener("click", () => { menu.style.display = "none"; });
  }

  const changePwLink = document.getElementById("changePasswordLink");
  if (changePwLink) {
    changePwLink.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await showChangePasswordModal();
      if (ok) alert("Password updated.");
    });
  }

  const themeLink = document.getElementById("themeToggleLink");
  if (themeLink) themeLink.addEventListener("click", (e) => { e.preventDefault(); toggleTheme(); });

  const signOutLink = document.getElementById("signOutLink");
  if (signOutLink) {
    signOutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }
}
