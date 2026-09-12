let currentRange = "day";

(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return; }
  const ok = await requireApproved(data.session);
  if (!ok) return;
  const isAdmin = await requireAdmin(data.session);
  if (!isAdmin) return;
  applyNavVisibility(data.session);
  initProfileMenu(data.session);
  startHeartbeat(data.session);
  await loadReport(currentRange);
})();

document.getElementById("filterRow").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  document.querySelectorAll("#filterRow button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  currentRange = btn.dataset.range;
  await loadReport(currentRange);
});

function rangeStart(range) {
  const now = new Date();
  const start = new Date(now);
  if (range === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (range === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (range === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function bucketKey(range, date) {
  if (range === "day") return date.getHours() + ":00";
  if (range === "week" || range === "month")
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (range === "year") return date.toLocaleDateString(undefined, { month: "short" });
}

async function loadReport(range) {
  const start = rangeStart(range);
  const { data: tabs, error } = await supabaseClient
    .from("tabs")
    .select("*")
    .eq("status", "closed")
    .gte("closed_at", start.toISOString())
    .order("closed_at", { ascending: false });

  if (error) { console.error(error); return; }

  const ids = tabs.map(t => t.id);
  let items = [];
  if (ids.length) {
    const { data: itemRows } = await supabaseClient
      .from("tab_items").select("tab_id, qty").in("tab_id", ids);
    items = itemRows || [];
  }
  const itemCountByTab = {};
  for (const i of items) itemCountByTab[i.tab_id] = (itemCountByTab[i.tab_id] || 0) + i.qty;

  // Stat cards
  const total = tabs.reduce((s, t) => s + Number(t.total), 0);
  document.getElementById("statTotal").textContent = `₱${total.toFixed(2)}`;
  document.getElementById("statCount").textContent = tabs.length;
  document.getElementById("statAvg").textContent = `₱${(tabs.length ? total / tabs.length : 0).toFixed(2)}`;

  // Period breakdown
  const buckets = {};
  for (const t of tabs) {
    const key = bucketKey(range, new Date(t.closed_at));
    if (!buckets[key]) buckets[key] = { count: 0, sales: 0 };
    buckets[key].count += 1;
    buckets[key].sales += Number(t.total);
  }
  const periodBody = document.getElementById("periodTableBody");
  periodBody.innerHTML = "";
  const keys = Object.keys(buckets);
  if (keys.length === 0) {
    periodBody.innerHTML = `<tr><td colspan="3" class="empty">No closed tabs in this range yet.</td></tr>`;
  }
  for (const key of keys) {
    const b = buckets[key];
    const row = document.createElement("tr");
    row.innerHTML = `<td>${key}</td><td>${b.count}</td><td>₱${b.sales.toFixed(2)}</td>`;
    periodBody.appendChild(row);
  }

  // Tabs list
  const tabsBody = document.getElementById("tabsTableBody");
  tabsBody.innerHTML = "";
  if (tabs.length === 0) {
    tabsBody.innerHTML = `<tr><td colspan="4" class="empty">No closed tabs in this range yet.</td></tr>`;
  }
  for (const t of tabs) {
    const row = document.createElement("tr");
    const closed = new Date(t.closed_at).toLocaleString();
    row.innerHTML = `
      <td>${escapeHtml(t.label)}</td>
      <td>${closed}</td>
      <td>${itemCountByTab[t.id] || 0}</td>
      <td>₱${Number(t.total).toFixed(2)}</td>
    `;
    tabsBody.appendChild(row);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
