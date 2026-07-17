const state = {
  items: [],
  view: "active",
  editingItemId: "",
};

const elements = {
  form: document.querySelector("#itemForm"),
  nameInput: document.querySelector("#nameInput"),
  costModeInputs: document.querySelectorAll("input[name='costMode']"),
  priceField: document.querySelector("#priceField"),
  priceInput: document.querySelector("#priceInput"),
  dailyCostField: document.querySelector("#dailyCostField"),
  dailyCostInput: document.querySelector("#dailyCostInput"),
  startDateInput: document.querySelector("#startDateInput"),
  endDateField: document.querySelector("#endDateField"),
  endDateInput: document.querySelector("#endDateInput"),
  endModeField: document.querySelector("#endModeField"),
  endModeInputs: document.querySelectorAll("input[name='endMode']"),
  plannedDaysField: document.querySelector("#plannedDaysField"),
  plannedDaysInput: document.querySelector("#plannedDaysInput"),
  excludeWeekendsInput: document.querySelector("#excludeWeekendsInput"),
  autoRenewInput: document.querySelector("#autoRenewInput"),
  formError: document.querySelector("#formError"),
  todayText: document.querySelector("#todayText"),
  activeDailyCost: document.querySelector("#activeDailyCost"),
  activeCount: document.querySelector("#activeCount"),
  archivedCount: document.querySelector("#archivedCount"),
  activeTab: document.querySelector("#activeTab"),
  archivedTab: document.querySelector("#archivedTab"),
  itemRows: document.querySelector("#itemRows"),
  emptyState: document.querySelector("#emptyState"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editItemName: document.querySelector("#editItemName"),
  editAutoRenewInput: document.querySelector("#editAutoRenewInput"),
  editCancelButton: document.querySelector("#editCancelButton"),
  editError: document.querySelector("#editError"),
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

function getNaturalWeekRange(dateString, excludeWeekends) {
  const date = parseLocalDate(dateString);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const startDate = formatLocalDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset));
  const endDate = addDays(startDate, excludeWeekends ? 4 : 6);

  return { startDate, endDate };
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isIncludedDate(dateString, excludeWeekends) {
  return !excludeWeekends || !isWeekend(parseLocalDate(dateString));
}

function addUsageDays(dateString, dayDelta, excludeWeekends) {
  let nextDate = dateString;
  let remainingDays = Math.abs(dayDelta);
  const step = dayDelta >= 0 ? 1 : -1;

  while (remainingDays > 0) {
    nextDate = addDays(nextDate, step);

    if (isIncludedDate(nextDate, excludeWeekends)) {
      remainingDays -= 1;
    }
  }

  return nextDate;
}

function getUsageDays(startDate, endDate, excludeWeekends = false) {
  if (!excludeWeekends) {
    return getInclusiveDays(startDate, endDate);
  }

  let days = 0;
  let currentDate = startDate;

  while (currentDate <= endDate) {
    if (isIncludedDate(currentDate, true)) {
      days += 1;
    }

    currentDate = addDays(currentDate, 1);
  }

  return days;
}

function getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends) {
  let endDate = startDate;
  let countedDays = isIncludedDate(startDate, excludeWeekends) ? 1 : 0;

  while (countedDays < plannedDays) {
    endDate = addDays(endDate, 1);

    if (isIncludedDate(endDate, excludeWeekends)) {
      countedDays += 1;
    }
  }

  return endDate;
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
  if (item.costMode === "daily") {
    return Number(item.dailyCost);
  }

  return Number(item.price) / getUsageDays(item.startDate, item.endDate, item.excludeWeekends);
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

function getEndMode() {
  return document.querySelector("input[name='endMode']:checked").value;
}

function getCostMode() {
  return document.querySelector("input[name='costMode']:checked").value;
}

function createItem(formData) {
  const costMode = formData.get("costMode");
  const endMode = formData.get("endMode");
  const excludeWeekends = formData.get("excludeWeekends") === "on";
  const plannedDays = Number(formData.get("plannedDays"));
  let startDate = formData.get("startDate");
  const weekRange = costMode === "daily" ? getNaturalWeekRange(startDate, excludeWeekends) : null;
  const endDate =
    weekRange
      ? weekRange.endDate
      : endMode === "duration"
        ? getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends)
        : formData.get("endDate");
  startDate = weekRange ? weekRange.startDate : startDate;
  const usageDays = startDate && endDate ? getUsageDays(startDate, endDate, excludeWeekends) : 0;
  const dailyCost = Number(formData.get("dailyCost"));

  return {
    name: formData.get("name").trim(),
    price: costMode === "daily" ? dailyCost * usageDays : Number(formData.get("price")),
    dailyCost: costMode === "daily" ? dailyCost : null,
    costMode,
    startDate,
    endDate,
    endMode: costMode === "daily" ? "duration" : endMode,
    plannedDays: costMode === "daily" ? usageDays : endMode === "duration" ? plannedDays : null,
    excludeWeekends,
    autoRenew: formData.get("autoRenew") === "on",
  };
}

function validateItem(item) {
  if (!item.name) {
    return "请输入商品名称";
  }

  if (item.costMode !== "total" && item.costMode !== "daily") {
    return "请选择成本方式";
  }

  if (item.costMode === "total" && (!Number.isFinite(item.price) || item.price <= 0)) {
    return "请输入有效价格";
  }

  if (item.costMode === "daily" && (!Number.isFinite(item.dailyCost) || item.dailyCost <= 0)) {
    return "请输入有效每日成本";
  }

  if (!item.startDate) {
    return "请选择使用日期";
  }

  if (item.endMode === "duration" && (!Number.isInteger(item.plannedDays) || item.plannedDays <= 0)) {
    return "请输入有效预计使用天数";
  }

  if (item.endMode === "date" && !item.endDate) {
    return "请选择结束日期";
  }

  if (item.endDate < item.startDate) {
    return "结束日期不能早于使用日期";
  }

  if (getUsageDays(item.startDate, item.endDate, item.excludeWeekends) <= 0) {
    return "使用区间至少需要包含 1 天";
  }

  return "";
}

function syncCostModeFields() {
  const costMode = getCostMode();

  elements.priceField.classList.toggle("is-hidden", costMode !== "total");
  elements.priceInput.required = costMode === "total";
  elements.dailyCostField.classList.toggle("is-visible", costMode === "daily");
  elements.dailyCostInput.required = costMode === "daily";
  elements.endModeField.classList.toggle("is-hidden", costMode === "daily");
  elements.endDateField.classList.toggle("is-hidden", costMode === "daily" || getEndMode() !== "date");
  elements.endDateInput.required = costMode !== "daily" && getEndMode() === "date";
  elements.plannedDaysField.classList.toggle("is-visible", costMode !== "daily" && getEndMode() === "duration");
  elements.plannedDaysInput.required = costMode !== "daily" && getEndMode() === "duration";
}

function syncEndModeFields() {
  const costMode = getCostMode();
  const endMode = getEndMode();

  elements.endModeField.classList.toggle("is-hidden", costMode === "daily");
  elements.endDateField.classList.toggle("is-hidden", costMode === "daily" || endMode !== "date");
  elements.endDateInput.required = costMode !== "daily" && endMode === "date";
  elements.plannedDaysField.classList.toggle("is-visible", costMode !== "daily" && endMode === "duration");
  elements.plannedDaysInput.required = costMode !== "daily" && endMode === "duration";
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
  const nextEndDate = addUsageDays(item.endDate, dayDelta, item.excludeWeekends);

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

function openEditDialog(item) {
  state.editingItemId = item.id;
  elements.editItemName.textContent = item.name;
  elements.editAutoRenewInput.checked = item.autoRenew;
  elements.editError.textContent = "";
  elements.editDialog.hidden = false;
}

function closeEditDialog() {
  state.editingItemId = "";
  elements.editForm.reset();
  elements.editDialog.hidden = true;
}

async function handleEditSubmit(event) {
  event.preventDefault();
  const item = state.items.find((currentItem) => currentItem.id === state.editingItemId);

  if (!item) {
    closeEditDialog();
    return;
  }

  try {
    const data = await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ autoRenew: elements.editAutoRenewInput.checked }),
    });

    state.items = state.items.map((currentItem) => (currentItem.id === item.id ? data.item : currentItem));
    closeEditDialog();
    render();
  } catch (error) {
    elements.editError.textContent = error.message;
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
    row.children[3].innerHTML = "";

    const dayCount = document.createElement("span");
    dayCount.textContent = `${getUsageDays(item.startDate, item.endDate, item.excludeWeekends)} 天`;
    row.children[3].append(dayCount);

    const tags = [];

    if (item.excludeWeekends) {
      tags.push("不含周末");
    }

    if (item.autoRenew) {
      tags.push("续期");
    }

    if (item.costMode === "daily") {
      tags.push("每日固定");
    }

    tags.forEach((tag) => {
      const tagElement = document.createElement("span");
      tagElement.className = "meta-tag";
      tagElement.textContent = tag;
      row.children[3].append(tagElement);
    });

    row.querySelector(".cost-chip").textContent = formatCurrency(getDailyCost(item));

    const actions = row.querySelector(".row-actions");

    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.type = "button";
    editButton.textContent = "编辑";
    editButton.title = "编辑自动续期";
    editButton.addEventListener("click", () => openEditDialog(item));
    actions.append(editButton);

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
    syncCostModeFields();
    syncEndModeFields();
    render();
  } catch (requestError) {
    elements.formError.textContent = requestError.message;
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.editForm.addEventListener("submit", handleEditSubmit);
elements.editCancelButton.addEventListener("click", closeEditDialog);
elements.editDialog.addEventListener("click", (event) => {
  if (event.target === elements.editDialog) {
    closeEditDialog();
  }
});
elements.endModeInputs.forEach((input) => input.addEventListener("change", syncEndModeFields));
elements.costModeInputs.forEach((input) => input.addEventListener("change", syncCostModeFields));
elements.activeTab.addEventListener("click", () => setView("active"));
elements.archivedTab.addEventListener("click", () => setView("archived"));
elements.startDateInput.value = getTodayDateString();
syncCostModeFields();
syncEndModeFields();
render();
loadItems();
