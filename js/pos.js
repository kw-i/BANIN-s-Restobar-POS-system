// ============================================================
// Local-first state. Every user action updates this object and
// the DOM immediately (zero perceived lag). Supabase writes are
// fired off in the background afterwards ("sync later").
//
// A newly opened tab starts as a "draft" — it only becomes a
// real, saved tab (inserted into Supabase, shown on the grid)
// once the first item is added. Closing an empty draft discards
// it, so no 0-item tabs ever get created.
// ============================================================
const state = {
  session: null,
  menu: [],           // [{id, name, price, category}]
  tabs: {},            // id -> {id, label, status, total, items:[...]}  (already-created tabs)
  draft: null,         // {id, label, items:[], total} — not yet saved
  openTabModal: null,  // 'draft' | tab id | null
  editedSinceOpen: false,
};
 
let pendingSyncCount = 0;
const deviceId = getDeviceId();
 
// ---------- boot ----------
(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return; }
  state.session = data.session;
 
  await Promise.all([loadMenu(), loadOpenTabs()]);
  render();
})();
 
document.getElementById("logoutLink").addEventListener("click", async (e) => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});
 
document.getElementById("refreshBtn").addEventListener("click", async () => {
  await loadOpenTabs();
  render();
});
 
document.getElementById("newTabBtn").addEventListener("click", createTab);
 
// ---------- data loading ----------
async function loadMenu() {
  const { data, error } = await supabaseClient
    .from("menu_items").select("*").eq("active", true).order("category").order("name");
  if (!error) state.menu = data;
}
 
async function loadOpenTabs() {
  const { data: tabs, error } = await supabaseClient
    .from("tabs").select("*").eq("status", "open").order("created_at");
  if (error) { console.error(error); return; }
 
  const ids = tabs.map(t => t.id);
  let items = [];
  if (ids.length) {
    const { data: itemRows } = await supabaseClient
      .from("tab_items").select("*").in("tab_id", ids);
    items = itemRows || [];
  }
 
  const newTabs = {};
  for (const t of tabs) {
    newTabs[t.id] = {
      id: t.id, label: t.label, status: t.status, total: Number(t.total),
      items: items.filter(i => i.tab_id === t.id).map(mapItemRow),
    };
  }
  state.tabs = newTabs;
}
 
function mapItemRow(i) {
  return { id: i.id, name: i.name, price: Number(i.price), qty: i.qty, menu_item_id: i.menu_item_id };
}
 
// ---------- sync indicator ----------
function markSyncing(delta) {
  pendingSyncCount += delta;
  const el = document.getElementById("syncStatus");
  if (pendingSyncCount > 0) {
    el.textContent = "Syncing…";
    el.className = "sync-indicator pending";
  } else {
    el.textContent = "All synced";
    el.className = "sync-indicator";
  }
}
 
async function syncOp(promiseFn) {
  markSyncing(1);
  try {
    const { error } = await promiseFn();
    if (error) throw error;
  } catch (err) {
    console.error("Sync failed:", err);
    const el = document.getElementById("syncStatus");
    el.textContent = "Sync error — will retry on refresh";
    el.className = "sync-indicator error";
  } finally {
    markSyncing(-1);
  }
}
 
// ---------- helper: the tab currently open in the modal, draft or real ----------
function getCurrentTab() {
  if (state.openTabModal === "draft") return state.draft;
  return state.tabs[state.openTabModal];
}
 
// ---------- rendering: tab grid ----------
function render() {
  const grid = document.getElementById("tabsGrid");
  const empty = document.getElementById("emptyState");
  const tabs = Object.values(state.tabs);
 
  grid.innerHTML = "";
  empty.style.display = tabs.length === 0 ? "block" : "none";
 
  for (const t of tabs) {
    const card = document.createElement("div");
    card.className = "tab-card";
    card.innerHTML = `
      <div class="label">${escapeHtml(t.label)}</div>
      <div class="meta">${t.items.reduce((s,i)=>s+i.qty,0)} item(s)</div>
      <div class="amount">₱${t.total.toFixed(2)}</div>
    `;
    card.addEventListener("click", () => openTabModal(t.id));
    grid.appendChild(card);
  }
 
  const newCard = document.createElement("div");
  newCard.className = "tab-card new";
  newCard.textContent = "+";
  newCard.addEventListener("click", createTab);
  grid.appendChild(newCard);
}
 
// ---------- create tab (starts as a draft — nothing saved yet) ----------
function createTab() {
  const id = crypto.randomUUID();
  state.draft = {
    id, label: `Tab ${Object.keys(state.tabs).length + 1}`, items: [], total: 0,
  };
  state.openTabModal = "draft";
  state.editedSinceOpen = false;
 
  document.getElementById("tabModal").style.display = "flex";
  document.getElementById("tabLabelInput").value = state.draft.label;
  renderMenuGrid();
  renderOrderList();
}
 
// ---------- open an existing (already-created) tab ----------
function openTabModal(id) {
  state.openTabModal = id;
  state.editedSinceOpen = false;
  const t = state.tabs[id];
  document.getElementById("tabModal").style.display = "flex";
  document.getElementById("tabLabelInput").value = t.label;
  renderMenuGrid();
  renderOrderList();
}
 
document.getElementById("closeModalBtn").addEventListener("click", closeTabModal);
document.getElementById("doneBtn").addEventListener("click", closeTabModal);
document.getElementById("confirmEditBtn").addEventListener("click", closeTabModal);
 
function closeTabModal() {
  document.getElementById("tabModal").style.display = "none";
  if (state.openTabModal === "draft") {
    // Never got past 0 items — discard it, nothing was ever saved.
    state.draft = null;
  }
  state.openTabModal = null;
  state.editedSinceOpen = false;
  render();
}
 
document.getElementById("tabLabelInput").addEventListener("change", (e) => {
  const t = getCurrentTab();
  if (!t) return;
  t.label = e.target.value.trim() || t.label;
  if (state.openTabModal !== "draft") {
    state.editedSinceOpen = true;
    syncOp(() => supabaseClient.from("tabs").update({ label: t.label }).eq("id", t.id));
    updateFooterButtons();
  }
});
 
function renderMenuGrid() {
  const grid = document.getElementById("menuGrid");
  grid.innerHTML = "";
  for (const m of state.menu) {
    const btn = document.createElement("button");
    btn.className = "menu-item-btn";
    btn.innerHTML = `${escapeHtml(m.name)}<span class="price">₱${Number(m.price).toFixed(2)}</span>`;
    btn.addEventListener("click", () => addItemToTab(m));
    grid.appendChild(btn);
  }
}
 
function addItemToTab(menuItem) {
  const wasDraft = state.openTabModal === "draft";
  const t = getCurrentTab();
  if (!t) return;
 
  const existing = t.items.find(i => i.menu_item_id === menuItem.id);
  if (existing) { changeQty(existing.id, 1); return; }
 
  const item = {
    id: crypto.randomUUID(), name: menuItem.name, price: Number(menuItem.price),
    qty: 1, menu_item_id: menuItem.id,
  };
  t.items.push(item);
  recalcTotal(t);
 
  if (wasDraft) {
    // First item added — this draft becomes a real, saved tab now.
    state.tabs[t.id] = t;
    state.draft = null;
    state.openTabModal = t.id;
    syncOp(() => supabaseClient.from("tabs").insert({
      id: t.id, label: t.label, status: "open", total: t.total,
      opened_by: state.session.user.id, device_id: deviceId,
    }));
  } else {
    syncOp(() => supabaseClient.from("tabs").update({ total: t.total }).eq("id", t.id));
  }
 
  syncOp(() => supabaseClient.from("tab_items").insert({
    id: item.id, tab_id: t.id, menu_item_id: item.menu_item_id,
    name: item.name, price: item.price, qty: item.qty,
    created_by: state.session.user.id, device_id: deviceId,
  }));
 
  state.editedSinceOpen = true;
  renderOrderList();
}
 
function changeQty(itemId, delta) {
  const t = getCurrentTab();
  if (!t) return;
  const item = t.items.find(i => i.id === itemId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    t.items = t.items.filter(i => i.id !== itemId);
    syncOp(() => supabaseClient.from("tab_items").delete().eq("id", itemId));
  } else {
    syncOp(() => supabaseClient.from("tab_items").update({ qty: item.qty }).eq("id", itemId));
  }
  recalcTotal(t);
  state.editedSinceOpen = true;
  renderOrderList();
 
  if (state.openTabModal !== "draft") {
    syncOp(() => supabaseClient.from("tabs").update({ total: t.total }).eq("id", t.id));
  }
}
 
function recalcTotal(t) {
  t.total = t.items.reduce((sum, i) => sum + i.price * i.qty, 0);
}
 
function renderOrderList() {
  const t = getCurrentTab();
  if (!t) return;
  const list = document.getElementById("orderList");
  list.innerHTML = "";
  if (t.items.length === 0) {
    list.innerHTML = `<div class="empty">No items yet — tap something from the menu above.</div>`;
  }
  for (const i of t.items) {
    const row = document.createElement("div");
    row.className = "order-row";
    row.innerHTML = `
      <div>
        <div class="name">${escapeHtml(i.name)}</div>
        <div class="sub">₱${i.price.toFixed(2)} each</div>
      </div>
      <div class="qty-controls">
        <button class="secondary minus">−</button>
        <span>${i.qty}</span>
        <button class="secondary plus">+</button>
      </div>
    `;
    row.querySelector(".minus").addEventListener("click", () => changeQty(i.id, -1));
    row.querySelector(".plus").addEventListener("click", () => changeQty(i.id, 1));
    list.appendChild(row);
  }
  document.getElementById("tabTotal").textContent = `₱${t.total.toFixed(2)}`;
  updateFooterButtons();
}
 
// ---------- footer button visibility ----------
// Draft (not yet created):  [Done] only. No delete, no close/payout.
// Already-created tab:      [Close/Payout] + [Delete] always available.
//                            [Done] is gone; [Confirm Edit] appears only
//                            once you've actually changed something.
function updateFooterButtons() {
  const isCreated = state.openTabModal !== "draft";
  const t = getCurrentTab();
  const deleteBtn = document.getElementById("deleteTabBtn");
  const closeBtn = document.getElementById("closeTabBtn");
  const doneBtn = document.getElementById("doneBtn");
  const confirmEditBtn = document.getElementById("confirmEditBtn");
 
  deleteBtn.style.display = isCreated ? "inline-block" : "none";
  closeBtn.style.display = (isCreated && t && t.items.length > 0) ? "inline-block" : "none";
 
  if (!isCreated) {
    doneBtn.style.display = "inline-block";
    confirmEditBtn.style.display = "none";
  } else {
    doneBtn.style.display = "none";
    confirmEditBtn.style.display = state.editedSinceOpen ? "inline-block" : "none";
  }
}
 
// ---------- close / delete tab ----------
document.getElementById("closeTabBtn").addEventListener("click", () => {
  const t = getCurrentTab();
  if (!t || state.openTabModal === "draft") return;
  if (t.items.length === 0) { alert("Add at least one item before closing the tab."); return; }
  if (!confirm(`Close "${t.label}" and record ₱${t.total.toFixed(2)} as paid?`)) return;
 
  t.status = "closed";
  const closedAt = new Date().toISOString();
  delete state.tabs[t.id];
  closeTabModal();
 
  syncOp(() => supabaseClient.from("tabs").update({
    status: "closed", closed_at: closedAt, total: t.total,
    closed_by: state.session.user.id,
  }).eq("id", t.id));
});
 
document.getElementById("deleteTabBtn").addEventListener("click", () => {
  const t = getCurrentTab();
  if (!t || state.openTabModal === "draft") return;
  if (!confirm(`Delete "${t.label}"? This cannot be undone.`)) return;
  delete state.tabs[t.id];
  closeTabModal();
  syncOp(() => supabaseClient.from("tabs").delete().eq("id", t.id));
});
 
// ---------- utils ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}