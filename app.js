const storageKey = "cost-ledger-items";

const state = {
  items: loadItems(),
  view: "active",
};

const elements = {
  form: document.querySelector("#itemForm"),
  nameInput: document.querySelector("#nameInput"),
  priceInput: document.querySelector("#priceInput"),
  startDateInput: document.querySelector("#startDateInput"),
  endDateInput: document.querySelector("#endDateInput"),
  formError: document.querySelector("#formError"),
  todayText: document.querySelector("#todayText"),
  activeDailyCost: document.querySelector("#activeDailyCost"),
  activeCount: document.querySelector("#activeCount"),
  archivedCount: document.querySelector("#archivedCount"),
  activeTab: document.querySelector("#activeTab"),
  archivedTab: document.querySelector("#archivedTab"),
  itemRows: document.querySelector("#itemRows"),
  emptyState: document.querySelector("#emptyState"),
};

function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getInclusiveDays(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end - start) / dayMs) + 1;
}

function isArchived(item, today = getTodayDateString()) {
  return item.endDate < today;
}

function getDailyCost(item) {
  return Number(item.price) / getInclusiveDays(item.startDate, item.endDate);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateRange(item) {
  return `${item.startDate} 至 ${item.endDate}`;
}

function loadItems() {
  try {
    const rawItems = localStorage.getItem(storageKey);
    return rawItems ? JSON.parse(rawItems) : [];
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(storageKey, JSON.stringify(state.items));
}

function createItem(formData) {
  return {
    id: crypto.randomUUID(),
    name: formData.get("name").trim(),
    price: Number(formData.get("price")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    createdAt: new Date().toISOString(),
  };
}

function validateItem(item) {
  if (!item.name) {
    return "请输入商品名称";
  }

  if (!Number.isFinite(item.price) || item.price <= 0) {
    return "请输入有效价格";
  }

  if (!item.startDate || !item.endDate) {
    return "请选择使用日期和结束日期";
  }

  if (item.endDate < item.startDate) {
    return "结束日期不能早于使用日期";
  }

  return "";
}

function setView(view) {
  state.view = view;
  elements.activeTab.classList.toggle("is-active", view === "active");
  elements.archivedTab.classList.toggle("is-active", view === "archived");
  render();
}

function deleteItem(id) {
  state.items = state.items.filter((item) => item.id !== id);
  saveItems();
  render();
}

function renderSummary() {
  const today = getTodayDateString();
  const activeItems = state.items.filter((item) => !isArchived(item, today));
  const archivedItems = state.items.filter((item) => isArchived(item, today));
  const activeDailyCost = activeItems.reduce((sum, item) => sum + getDailyCost(item), 0);

  elements.todayText.textContent = today;
  elements.activeDailyCost.textContent = formatCurrency(activeDailyCost);
  elements.activeCount.textContent = String(activeItems.length);
  elements.archivedCount.textContent = String(archivedItems.length);
}

function renderRows() {
  const today = getTodayDateString();
  const visibleItems = state.items
    .filter((item) => (state.view === "archived" ? isArchived(item, today) : !isArchived(item, today)))
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  elements.itemRows.innerHTML = "";
  elements.emptyState.classList.toggle("is-visible", visibleItems.length === 0);

  visibleItems.forEach((item) => {
    const row = document.createElement("tr");
    row.className = isArchived(item, today) ? "archived-row" : "";

    row.innerHTML = `
      <td class="name-cell"></td>
      <td></td>
      <td class="muted"></td>
      <td></td>
      <td><span class="cost-chip"></span></td>
      <td><button class="icon-button" type="button" title="删除" aria-label="删除">×</button></td>
    `;

    row.children[0].textContent = item.name;
    row.children[1].textContent = formatCurrency(item.price);
    row.children[2].textContent = formatDateRange(item);
    row.children[3].textContent = `${getInclusiveDays(item.startDate, item.endDate)} 天`;
    row.querySelector(".cost-chip").textContent = formatCurrency(getDailyCost(item));
    row.querySelector("button").addEventListener("click", () => deleteItem(item.id));
    elements.itemRows.append(row);
  });
}

function render() {
  renderSummary();
  renderRows();
}

function handleSubmit(event) {
  event.preventDefault();
  const item = createItem(new FormData(elements.form));
  const error = validateItem(item);

  if (error) {
    elements.formError.textContent = error;
    return;
  }

  elements.formError.textContent = "";
  state.items.push(item);
  saveItems();
  elements.form.reset();
  elements.startDateInput.value = getTodayDateString();
  render();
}

elements.form.addEventListener("submit", handleSubmit);
elements.activeTab.addEventListener("click", () => setView("active"));
elements.archivedTab.addEventListener("click", () => setView("archived"));
elements.startDateInput.value = getTodayDateString();
render();
