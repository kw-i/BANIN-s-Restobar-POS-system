let currentRange = "day";
let session = null;

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
  await loadAccounting(currentRange);
})();

document.getElementById("filterRow").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  document.querySelectorAll("#filterRow button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentRange = btn.dataset.range;
  await loadAccounting(currentRange);
});

function rangeStart(range) {
  const now = new Date();
  const start = new Date(now);
  if (range === "day") { start.setHours(0, 0, 0, 0); }
  else if (range === "week") { start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); }
  else if (range === "month") { start.setDate(1); start.setHours(0, 0, 0, 0); }
  else if (range === "year") { start.setMonth(0, 1); start.setHours(0, 0, 0, 0); }
  return start;
}

async function loadAccounting(range) {
  const start = rangeStart(range);

  const [{ data: tabs }, { data: expenses }] = await Promise.all([
    supabaseClient.from("tabs").select("total").eq("status", "closed").gte("closed_at", start.toISOString()),
    supabaseClient.from("expenses").select("*").gte("created_at", start.toISOString()).order("created_at", { ascending: false }),
  ]);

  const revenue = (tabs || []).reduce((s, t) => s + Number(t.total), 0);
  const totalExpenses = (expenses || []).reduce((s, e) => s + Number(e.amount), 0);
  const net = revenue - totalExpenses;

  document.getElementById("statRevenue").textContent = `₱${revenue.toFixed(2)}`;
  document.getElementById("statExpenses").textContent = `₱${totalExpenses.toFixed(2)}`;
  const netEl = document.getElementById("statNet");
  netEl.textContent = `₱${net.toFixed(2)}`;
  netEl.style.color = net < 0 ? "var(--danger)" : "var(--ok)";

  const body = document.getElementById("expensesTableBody");
  body.innerHTML = "";
  if (!expenses || expenses.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No expenses logged in this range.</td></tr>`;
  }
  for (const e of (expenses || [])) {
    const row = document.createElement("tr");
    const dateTd = document.createElement("td");
    dateTd.textContent = new Date(e.created_at).toLocaleString();
    const descTd = document.createElement("td");
    descTd.textContent = e.description;
    const catTd = document.createElement("td");
    catTd.textContent = e.category || "—";
    const amtTd = document.createElement("td");
    amtTd.textContent = `₱${Number(e.amount).toFixed(2)}`;
    const actionTd = document.createElement("td");
    const delBtn = document.createElement("button");
    delBtn.className = "danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const ok = await showConfirmModal({
        title: "Delete this expense?", message: e.description,
        confirmText: "Delete", danger: true,
      });
      if (!ok) return;
      await supabaseClient.from("expenses").delete().eq("id", e.id);
      await loadAccounting(currentRange);
    });
    actionTd.appendChild(delBtn);
    row.append(dateTd, descTd, catTd, amtTd, actionTd);
    body.appendChild(row);
  }
}

document.getElementById("addExpenseBtn").addEventListener("click", async () => {
  const descEl = document.getElementById("expDesc");
  const amountEl = document.getElementById("expAmount");
  const categoryEl = document.getElementById("expCategory");
  const errorEl = document.getElementById("expError");
  errorEl.textContent = "";

  const description = descEl.value.trim();
  const amount = parseFloat(amountEl.value);
  const category = categoryEl.value.trim() || "General";

  if (!description || isNaN(amount) || amount < 0) {
    errorEl.textContent = "Enter a description and a valid amount.";
    return;
  }

  const { error } = await supabaseClient.from("expenses").insert({
    description, amount, category, created_by: session.user.id,
  });
  if (error) { errorEl.textContent = error.message; return; }

  descEl.value = ""; amountEl.value = ""; categoryEl.value = "";
  await loadAccounting(currentRange);
});
