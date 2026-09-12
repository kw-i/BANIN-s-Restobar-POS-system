let session = null;
let staffList = [];

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return; }
  session = data.session;
  const ok = await requireApproved(session);
  if (!ok) return;
  const isAdmin = await requireAdmin(session);
  if (!isAdmin) return;
  applyNavVisibility(session);
  initProfileMenu(session);
  startHeartbeat(session);
  await loadStaff();
})();

document.getElementById("refreshBtn").addEventListener("click", loadStaff);

async function loadStaff() {
  const { data, error } = await supabaseClient.rpc("admin_list_staff");
  if (error) { console.error(error); return; }
  staffList = data;
  renderPending();
  renderStaff();
}

function renderPending() {
  const body = document.getElementById("pendingTableBody");
  const pending = staffList.filter(s => !s.approved);
  body.innerHTML = "";
  if (pending.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No accounts waiting for approval.</td></tr>`;
    return;
  }
  for (const s of pending) {
    const row = document.createElement("tr");
    const nameTd = document.createElement("td"); nameTd.textContent = s.full_name || "—";
    const phoneTd = document.createElement("td"); phoneTd.textContent = s.phone || "—";
    const emailTd = document.createElement("td"); emailTd.textContent = s.email || "—";
    const dateTd = document.createElement("td"); dateTd.textContent = new Date(s.created_at).toLocaleString();
    const actionTd = document.createElement("td");
    const approveBtn = document.createElement("button");
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "Approve this account?",
        message: `${s.full_name || s.email} will be able to sign in and use the tabbing system.`,
        confirmText: "Approve",
      });
      if (!ok) return;
      await supabaseClient.from("staff").update({ approved: true }).eq("id", s.id);
      await loadStaff();
    });
    actionTd.appendChild(approveBtn);
    row.append(nameTd, phoneTd, emailTd, dateTd, actionTd);
    body.appendChild(row);
  }
}

function renderStaff() {
  const body = document.getElementById("staffTableBody");
  const approved = staffList.filter(s => s.approved);
  body.innerHTML = "";
  for (const s of approved) {
    const row = document.createElement("tr");

    const nameTd = document.createElement("td");
    nameTd.textContent = s.full_name || "—";

    const phoneTd = document.createElement("td");
    phoneTd.textContent = s.phone || "—";

    const roleTd = document.createElement("td");
    const roleSelect = document.createElement("select");
    roleSelect.style.marginBottom = "0";
    roleSelect.innerHTML = `<option value="staff">Employee</option><option value="admin">Admin</option>`;
    roleSelect.value = s.role;
    roleSelect.addEventListener("change", async () => {
      await supabaseClient.from("staff").update({ role: roleSelect.value }).eq("id", s.id);
    });
    roleTd.appendChild(roleSelect);

    const lastLoginTd = document.createElement("td");
    lastLoginTd.textContent = s.last_sign_in_at ? new Date(s.last_sign_in_at).toLocaleString() : "Never";

    const actionTd = document.createElement("td");
    actionTd.style.display = "flex";
    actionTd.style.gap = "8px";

    const activityBtn = document.createElement("button");
    activityBtn.className = "secondary";
    activityBtn.textContent = "View Activity";
    activityBtn.addEventListener("click", () => showActivity(s));

    const revokeBtn = document.createElement("button");
    revokeBtn.className = "danger";
    revokeBtn.textContent = "Revoke";
    revokeBtn.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "Revoke access?",
        message: `${s.full_name || s.email} won't be able to log in until re-approved.`,
        confirmText: "Revoke", danger: true,
      });
      if (!ok) return;
      await supabaseClient.from("staff").update({ approved: false }).eq("id", s.id);
      await loadStaff();
    });

    actionTd.append(activityBtn, revokeBtn);
    row.append(nameTd, phoneTd, roleTd, lastLoginTd, actionTd);
    body.appendChild(row);
  }
}

async function showActivity(s) {
  const modal = document.getElementById("activityModal");
  const body = document.getElementById("activityBody");
  document.getElementById("activityTitle").textContent = `Activity — ${s.full_name || s.email}`;
  body.innerHTML = `<div class="empty">Loading…</div>`;
  modal.style.display = "flex";

  const { data: tabs } = await supabaseClient
    .from("tabs")
    .select("*")
    .or(`opened_by.eq.${s.id},closed_by.eq.${s.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  body.innerHTML = "";
  if (!tabs || tabs.length === 0) {
    body.innerHTML = `<div class="empty">No tab activity yet.</div>`;
    return;
  }
  for (const t of tabs) {
    const row = document.createElement("div");
    row.className = "order-row";
    const left = document.createElement("div");
    left.innerHTML = `<div class="name"></div><div class="sub"></div>`;
    left.querySelector(".name").textContent = t.label;
    const parts = [];
    if (t.opened_by === s.id) parts.push(`Opened ${new Date(t.created_at).toLocaleString()}`);
    if (t.closed_by === s.id && t.closed_at) parts.push(`Closed ${new Date(t.closed_at).toLocaleString()}`);
    left.querySelector(".sub").textContent = parts.join(" · ");
    const right = document.createElement("div");
    right.textContent = `₱${Number(t.total).toFixed(2)}`;
    row.append(left, right);
    body.appendChild(row);
  }
}

document.getElementById("activityClose").addEventListener("click", () => {
  document.getElementById("activityModal").style.display = "none";
});