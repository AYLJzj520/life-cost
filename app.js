const state = {
  items: [],
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

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, dayDelta) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + dayDelta);
  return formatLocalDate(date);
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

function createItem(formData) {
  return {
    name: formData.get("name").trim(),
    price: Number(formData.get("price")),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后重试");
  }

  return data;
}

async function loadItems() {
  try {
    const data = await fetchJson("/api/items");
    state.items = data.items || [];
    elements.formError.textContent = "";
    render();
  } catch (error) {
    elements.formError.textContent = error.message;
  }
}

async function deleteItem(id) {
  try {
    await fetchJson(`/api/items/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    state.items = state.items.filter((item) => item.id !== id);
    render();
  } catch (error) {
    elements.formError.textContent = error.message;
  }
}

async function updateEndDate(item, dayDelta) {
  const nextEndDate = addDays(item.endDate, dayDelta);

  if (nextEndDate < item.startDate) {
    elements.formError.textContent = "结束日期不能早于使用日期";
    return;
  }

  try {
    const data = await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ endDate: nextEndDate }),
    });

    state.items = state.items.map((currentItem) => (currentItem.id === item.id ? data.item : currentItem));
    elements.formError.textContent = "";
    render();
  } catch (error) {
    elements.formError.textContent = error.message;
  }
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
    const archived = isArchived(item, today);
    const row = document.createElement("tr");
    row.className = archived ? "archived-row" : "";

    row.innerHTML = `
      <td class="name-cell"></td>
      <td></td>
      <td class="muted"></td>
      <td></td>
      <td><span class="cost-chip"></span></td>
      <td><div class="row-actions"></div></td>
    `;

    row.children[0].textContent = item.name;
    row.children[1].textContent = formatCurrency(item.price);
    row.children[2].textContent = formatDateRange(item);
    row.children[3].textContent = `${getInclusiveDays(item.startDate, item.endDate)} 天`;
    row.querySelector(".cost-chip").textContent = formatCurrency(getDailyCost(item));

    const actions = row.querySelector(".row-actions");

    if (!archived) {
      const subtractButton = document.createElement("button");
      subtractButton.className = "day-button";
      subtractButton.type = "button";
      subtractButton.textContent = "-1天";
      subtractButton.disabled = item.endDate <= item.startDate;
      subtractButton.title = "结束日期减少 1 天";
      subtractButton.addEventListener("click", () => updateEndDate(item, -1));
      actions.append(subtractButton);

      const addButton = document.createElement("button");
      addButton.className = "day-button";
      addButton.type = "button";
      addButton.textContent = "+1天";
      addButton.title = "结束日期增加 1 天";
      addButton.addEventListener("click", () => updateEndDate(item, 1));
      actions.append(addButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button";
    deleteButton.type = "button";
    deleteButton.title = "删除";
    deleteButton.setAttribute("aria-label", "删除");
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteItem(item.id));
    actions.append(deleteButton);

    elements.itemRows.append(row);
  });
}

function render() {
  renderSummary();
  renderRows();
}

async function handleSubmit(event) {
  event.preventDefault();
  const item = createItem(new FormData(elements.form));
  const error = validateItem(item);

  if (error) {
    elements.formError.textContent = error;
    return;
  }

  elements.formError.textContent = "";

  try {
    const data = await fetchJson("/api/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(item),
    });

    state.items.unshift(data.item);
    elements.form.reset();
    elements.startDateInput.value = getTodayDateString();
    render();
  } catch (requestError) {
    elements.formError.textContent = requestError.message;
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.activeTab.addEventListener("click", () => setView("active"));
elements.archivedTab.addEventListener("click", () => setView("archived"));
elements.startDateInput.value = getTodayDateString();
render();
loadItems();
