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
