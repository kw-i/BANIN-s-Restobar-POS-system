// ============================================================
// Local-first state. Every user action updates this object and
// the DOM immediately (zero perceived lag). Supabase writes are
// fired off in the background afterwards ("sync later").
//
// A newly opened tab starts as a "draft" — it only becomes a
// real, saved tab (inserted into Supabase, shown on the grid)
// once the first item is added. Closing an empty draft discards
// it, so no 0-item tabs ever get created.
//
// Open tabs older than 12 hours are auto-deleted whenever the
// app loads or refreshes (see cleanupStaleTabs()).
// ============================================================
const STALE_TAB_HOURS = 12;

const state = {
  session: null,
  menu: [],
  tabs: {},            // id -> {id, label, status, total, createdAt, items:[...]}
  draft: null,          // {id, label, items:[], total} — not yet saved
  openTabModal: null,   // 'draft' | tab id | null
  editedSinceOpen: false,
};

let pendingSyncCount = 0;
const deviceId = getDeviceId();

// ---------- boot ----------
(async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return; }
  state.session = data.session;

  applyNavVisibility(state.session);
  await Promise.all([loadMenu(), loadOpenTabs()]);
  await cleanupStaleTabs();
  render();

  // Passive safety net: re-check for staleness every 5 minutes even
  // if nobody clicks Refresh.
  setInterval(async () => {
    await loadOpenTabs();
    await cleanupStaleTabs();
    render();
  }, 5 * 60 * 1000);
})();

document.getElementById("logoutLink").addEventListener("click", async (e) => {
  e.preventDefault();
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await loadOpenTabs();
  await cleanupStaleTabs();
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
      createdAt: t.created_at,
      items: items.filter(i => i.tab_id === t.id).map(mapItemRow),
    };
  }
  state.tabs = newTabs;
}

function mapItemRow(i) {
  return { id: i.id, name: i.name, price: Number(i.price), qty: i.qty, menu_item_id: i.menu_item_id };
}

// ---------- 12-hour auto-cleanup ----------
async function cleanupStaleTabs() {
  const cutoff = Date.now() - STALE_TAB_HOURS * 60 * 60 * 1000;
  const staleIds = Object.values(state.tabs)
    .filter(t => new Date(t.createdAt).getTime() < cutoff)
    .map(t => t.id);
  if (staleIds.length === 0) return;

  for (const id of staleIds) delete state.tabs[id];
  syncOp(() => supabaseClient.from("tabs").delete().in("id", staleIds));
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

// ---------- helper ----------
function getCurrentTab() {
  if (state.openTabModal === "draft") return state.draft;
  return state.tabs[state.openTabModal];
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
      <div class="meta">${t.items.reduce((s,i)=>s+i.qty,0)} item(s) · opened ${formatTime(t.createdAt)}</div>
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
  state.draft = { id, label: `Tab ${Object.keys(state.tabs).length + 1}`, items: [], total: 0 };
  state.openTabModal = "draft";
  state.editedSinceOpen = false;

  document.getElementById("tabModal").style.display = "flex";
  document.getElementById("tabLabelInput").value = state.draft.label;
  document.getElementById("tabOpenedAt").textContent = "";
  renderMenuGrid();
  renderOrderList();
}

function openTabModal(id) {
  state.openTabModal = id;
  state.editedSinceOpen = false;
  const t = state.tabs[id];
  document.getElementById("tabModal").style.display = "flex";
  document.getElementById("tabLabelInput").value = t.label;
  document.getElementById("tabOpenedAt").textContent = `Opened ${formatTime(t.createdAt)}`;
  renderMenuGrid();
  renderOrderList();
}

document.getElementById("closeModalBtn").addEventListener("click", closeTabModal);
document.getElementById("confirmEditBtn").addEventListener("click", closeTabModal);

function closeTabModal() {
  document.getElementById("tabModal").style.display = "none";
  if (state.openTabModal === "draft") {
    state.draft = null; // discarded — never had any items, never saved
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
    t.createdAt = new Date().toISOString();
    state.tabs[t.id] = t;
    state.draft = null;
    state.openTabModal = t.id;
    document.getElementById("tabOpenedAt").textContent = `Opened ${formatTime(t.createdAt)}`;
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
  decrementStock(menuItem.id, 1);

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
  if (item.menu_item_id) decrementStock(item.menu_item_id, delta);
  recalcTotal(t);
  state.editedSinceOpen = true;
  renderOrderList();

  if (state.openTabModal !== "draft") {
    syncOp(() => supabaseClient.from("tabs").update({ total: t.total }).eq("id", t.id));
  }
}

// Best-effort stock decrement — inventory is informational, so a
// failed decrement (e.g. offline) doesn't block taking the order.
function decrementStock(menuItemId, qtyDelta) {
  const menuItem = state.menu.find(m => m.id === menuItemId);
  if (!menuItem) return;
  menuItem.stock_qty = Math.max(0, (menuItem.stock_qty || 0) - qtyDelta);
  syncOp(() => supabaseClient
    .from("menu_items")
    .update({ stock_qty: menuItem.stock_qty })
    .eq("id", menuItemId));
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
// Draft, nothing added yet:  no buttons at all — just the ✕ to cancel.
// Already-created tab:       [Close/Payout] + [Delete] always shown.
//                             [Confirm Edit] appears only once you've
//                             actually changed something since opening it.
function updateFooterButtons() {
  const isCreated = state.openTabModal !== "draft";
  const t = getCurrentTab();
  const deleteBtn = document.getElementById("deleteTabBtn");
  const closeBtn = document.getElementById("closeTabBtn");
  const confirmEditBtn = document.getElementById("confirmEditBtn");

  deleteBtn.style.display = isCreated ? "inline-block" : "none";
  closeBtn.style.display = (isCreated && t && t.items.length > 0) ? "inline-block" : "none";
  confirmEditBtn.style.display = (isCreated && state.editedSinceOpen) ? "inline-block" : "none";
}

// ---------- close / delete tab ----------
document.getElementById("closeTabBtn").addEventListener("click", async () => {
  const t = getCurrentTab();
  if (!t || state.openTabModal === "draft") return;
  if (t.items.length === 0) { alert("Add at least one item before closing the tab."); return; }

  const paid = await showPaymentModal(t);
  if (!paid) return;

  t.status = "closed";
  const closedAt = new Date().toISOString();
  delete state.tabs[t.id];
  closeTabModal();

  syncOp(() => supabaseClient.from("tabs").update({
    status: "closed", closed_at: closedAt, total: t.total,
    closed_by: state.session.user.id,
  }).eq("id", t.id));
});

document.getElementById("deleteTabBtn").addEventListener("click", async () => {
  const t = getCurrentTab();
  if (!t || state.openTabModal === "draft") return;
  const ok = await showConfirmModal({
    title: "Delete this tab?",
    message: `"${t.label}" and its ${t.items.length} item(s) will be permanently deleted.`,
    confirmText: "Delete", danger: true,
  });
  if (!ok) return;
  delete state.tabs[t.id];
  closeTabModal();
  syncOp(() => supabaseClient.from("tabs").delete().eq("id", t.id));
});

// ---------- delete ALL tabs (bottom-left button, double confirmation) ----------
document.getElementById("deleteAllBtn").addEventListener("click", async () => {
  const count = Object.keys(state.tabs).length;
  if (count === 0) {
    await showConfirmModal({ title: "No open tabs", message: "There's nothing to delete.", confirmText: "OK" });
    return;
  }

  const first = await showConfirmModal({
    title: "Delete ALL open tabs?",
    message: `This will delete all ${count} open tab(s) and everything on them.`,
    confirmText: "Continue", danger: true,
  });
  if (!first) return;

  const second = await showConfirmModal({
    title: "Are you absolutely sure?",
    message: `This cannot be undone. ${count} tab(s) will be permanently deleted right now.`,
    confirmText: "Yes, delete everything", danger: true,
  });
  if (!second) return;

  state.tabs = {};
  render();
  syncOp(() => supabaseClient.from("tabs").delete().eq("status", "open"));
});

// ---------- payment modal (Close / Pay Out) ----------
function showPaymentModal(tab) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.style.maxWidth = "480px";
    modal.innerHTML = `
      <div class="modal-header">
        <div style="font-weight:700">Pay out — <span id="pmLabel"></span></div>
        <button class="ghost" id="pmX">✕</button>
      </div>
      <div class="modal-body">
        <div id="pmItems"></div>
        <div class="total-line"><span>Total</span><span id="pmTotal"></span></div>
        <label class="hint" style="display:block; margin-top:16px;">Amount received</label>
        <input id="pmAmount" type="number" step="0.01" min="0" placeholder="0.00" />
        <div class="total-line" id="pmChangeLine" style="display:none">
          <span>Change</span><span id="pmChange"></span>
        </div>
        <div class="error" id="pmError"></div>
      </div>
      <div class="modal-footer" style="justify-content:flex-end">
        <button class="secondary" id="pmCancel">Cancel</button>
        <button id="pmConfirm">Confirm Payment</button>
      </div>
    `;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    modal.querySelector("#pmLabel").textContent = tab.label;
    modal.querySelector("#pmTotal").textContent = `₱${tab.total.toFixed(2)}`;

    const itemsEl = modal.querySelector("#pmItems");
    for (const i of tab.items) {
      const row = document.createElement("div");
      row.className = "order-row";
      const nameDiv = document.createElement("div");
      nameDiv.innerHTML = `<div class="name"></div><div class="sub"></div>`;
      nameDiv.querySelector(".name").textContent = `${i.name} × ${i.qty}`;
      nameDiv.querySelector(".sub").textContent = `₱${i.price.toFixed(2)} each`;
      const priceDiv = document.createElement("div");
      priceDiv.textContent = `₱${(i.price * i.qty).toFixed(2)}`;
      row.appendChild(nameDiv);
      row.appendChild(priceDiv);
      itemsEl.appendChild(row);
    }

    const amountEl = modal.querySelector("#pmAmount");
    const changeLine = modal.querySelector("#pmChangeLine");
    const changeEl = modal.querySelector("#pmChange");
    const errorEl = modal.querySelector("#pmError");

    amountEl.addEventListener("input", () => {
      errorEl.textContent = "";
      const amt = parseFloat(amountEl.value);
      if (isNaN(amt)) { changeLine.style.display = "none"; return; }
      const change = amt - tab.total;
      changeLine.style.display = "flex";
      changeEl.textContent = `₱${Math.max(change, 0).toFixed(2)}`;
      changeEl.style.color = change < 0 ? "var(--danger)" : "var(--ok)";
    });

    function cleanup(result) { backdrop.remove(); resolve(result); }
    modal.querySelector("#pmX").addEventListener("click", () => cleanup(false));
    modal.querySelector("#pmCancel").addEventListener("click", () => cleanup(false));
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(false); });
    modal.querySelector("#pmConfirm").addEventListener("click", () => {
      const amt = parseFloat(amountEl.value);
      if (isNaN(amt) || amt < tab.total) {
        errorEl.textContent = "Amount received must cover the total.";
        return;
      }
      cleanup(true);
    });
    amountEl.focus();
  });
}

// ---------- utils ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
