let menu = [];

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
  await loadMenu();
})();

async function loadMenu() {
  const { data, error } = await supabaseClient
    .from("menu_items").select("*").order("category").order("name");
  if (error) { console.error(error); return; }
  menu = data;
  render();
}

function render() {
  const body = document.getElementById("menuTableBody");
  body.innerHTML = "";
  for (const m of menu) {
    const row = document.createElement("tr");

    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = m.name;
    nameInput.style.marginBottom = "0";
    nameInput.addEventListener("change", async () => {
      const val = nameInput.value.trim();
      if (!val) { nameInput.value = m.name; return; }
      await supabaseClient.from("menu_items").update({ name: val }).eq("id", m.id);
      m.name = val;
    });
    nameTd.appendChild(nameInput);

    const catTd = document.createElement("td");
    catTd.textContent = m.category;

    const priceTd = document.createElement("td");
    const priceInput = document.createElement("input");
    priceInput.type = "number";
    priceInput.step = "0.01";
    priceInput.min = "0";
    priceInput.value = Number(m.price).toFixed(2);
    priceInput.style.width = "100px";
    priceInput.style.marginBottom = "0";
    priceInput.addEventListener("change", async () => {
      const val = Math.max(0, parseFloat(priceInput.value) || 0);
      priceInput.value = val.toFixed(2);
      await supabaseClient.from("menu_items").update({ price: val }).eq("id", m.id);
      m.price = val;
    });
    priceTd.appendChild(priceInput);

    const stockTd = document.createElement("td");
    const stockInput = document.createElement("input");
    stockInput.type = "number";
    stockInput.value = m.stock_qty;
    stockInput.style.width = "80px";
    stockInput.style.marginBottom = "0";
    if (m.stock_qty <= m.low_stock_threshold) {
      stockInput.style.borderColor = "var(--danger)";
      stockInput.style.color = "var(--danger)";
    }
    stockInput.addEventListener("change", async () => {
      const val = Math.max(0, parseInt(stockInput.value) || 0);
      stockInput.value = val;
      await supabaseClient.from("menu_items").update({ stock_qty: val }).eq("id", m.id);
      m.stock_qty = val;
      render();
    });
    stockTd.appendChild(stockInput);

    const actionTd = document.createElement("td");
    const toggleBtn = document.createElement("button");
    toggleBtn.className = m.active ? "danger" : "secondary";
    toggleBtn.textContent = m.active ? "Deactivate" : "Activate";
    toggleBtn.addEventListener("click", async () => {
      await supabaseClient.from("menu_items").update({ active: !m.active }).eq("id", m.id);
      m.active = !m.active;
      render();
    });
    actionTd.appendChild(toggleBtn);

    if (!m.active) row.style.opacity = "0.5";
    row.append(nameTd, catTd, priceTd, stockTd, actionTd);
    body.appendChild(row);
  }
}

// ---------- add item modal ----------
const addModal = document.getElementById("addModal");
document.getElementById("addItemBtn").addEventListener("click", () => {
  document.getElementById("newName").value = "";
  document.getElementById("newPrice").value = "";
  document.getElementById("newCategory").value = "";
  document.getElementById("newStock").value = "";
  document.getElementById("addError").textContent = "";
  addModal.style.display = "flex";
});
document.getElementById("addModalClose").addEventListener("click", () => addModal.style.display = "none");
document.getElementById("addCancel").addEventListener("click", () => addModal.style.display = "none");

document.getElementById("addConfirm").addEventListener("click", async () => {
  const name = document.getElementById("newName").value.trim();
  const price = parseFloat(document.getElementById("newPrice").value);
  const category = document.getElementById("newCategory").value.trim() || "General";
  const stock_qty = parseInt(document.getElementById("newStock").value) || 0;
  const errorEl = document.getElementById("addError");

  if (!name || isNaN(price) || price < 0) {
    errorEl.textContent = "Enter a name and a valid price.";
    return;
  }

  const { error } = await supabaseClient.from("menu_items").insert({ name, price, category, stock_qty });
  if (error) { errorEl.textContent = error.message; return; }

  addModal.style.display = "none";
  await loadMenu();
});
