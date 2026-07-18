import {
  MAX_DATE_SPAN_DAYS,
  addUsageDays,
  getEndDateFromUsageDays,
  getInclusiveDays,
  getNaturalWeekRange,
  getTodayDateString,
  getUsageDays,
  isAllowedDateString,
} from "./date-utils.js";

const state = {
  items: [],
  view: "active",
  editingItemId: "",
  dialogTrigger: null,
  isSubmitting: false,
  isEditing: false,
  pendingItemIds: new Set(),
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
  submitButton: document.querySelector("#submitButton"),
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
  editSubmitButton: document.querySelector("#editSubmitButton"),
  editError: document.querySelector("#editError"),
};

function isArchived(item, today = getTodayDateString()) {
  return item.endDate < today;
}

function getDailyCost(item) {
  if (item.costMode === "daily") {
    return Number(item.dailyCost);
  }

  return Number(item.price) / getUsageDays(item.startDate, item.endDate, item.excludeWeekends);
}

function getRemainingUsageDays(item, today = getTodayDateString()) {
  if (isArchived(item, today)) {
    return 0;
  }

  const remainingStartDate = item.startDate > today ? item.startDate : today;
  return getUsageDays(remainingStartDate, item.endDate, item.excludeWeekends);
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
  const canCalculateDuration = isAllowedDateString(startDate)
    && Number.isInteger(plannedDays)
    && plannedDays > 0
    && plannedDays <= MAX_DATE_SPAN_DAYS;
  const weekRange = costMode === "daily" && isAllowedDateString(startDate)
    ? getNaturalWeekRange(startDate, excludeWeekends)
    : null;
  const endDate = weekRange
    ? weekRange.endDate
    : endMode === "duration" && canCalculateDuration
      ? getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends)
      : formData.get("endDate");
  startDate = weekRange ? weekRange.startDate : startDate;
  const usageDays = isAllowedDateString(startDate) && isAllowedDateString(endDate)
    ? getUsageDays(startDate, endDate, excludeWeekends)
    : 0;
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

  if (item.name.length > 100) {
    return "商品名称不能超过 100 个字符";
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

  if (!isAllowedDateString(item.startDate)) {
    return "请选择有效使用日期";
  }

  if (
    item.endMode === "duration" &&
    (!Number.isInteger(item.plannedDays) || item.plannedDays <= 0 || item.plannedDays > MAX_DATE_SPAN_DAYS)
  ) {
    return "请输入有效预计使用天数";
  }

  if (!isAllowedDateString(item.endDate)) {
    return "请选择有效结束日期";
  }

  if (item.endDate < item.startDate) {
    return "结束日期不能早于使用日期";
  }

  if (getInclusiveDays(item.startDate, item.endDate) > MAX_DATE_SPAN_DAYS) {
    return `使用日期跨度不能超过 ${MAX_DATE_SPAN_DAYS} 天`;
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
  const isActiveView = view === "active";
  elements.activeTab.classList.toggle("is-active", isActiveView);
  elements.archivedTab.classList.toggle("is-active", !isActiveView);
  elements.activeTab.setAttribute("aria-selected", String(isActiveView));
  elements.archivedTab.setAttribute("aria-selected", String(!isActiveView));
  elements.activeTab.tabIndex = isActiveView ? 0 : -1;
  elements.archivedTab.tabIndex = isActiveView ? -1 : 0;
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

async function deleteItem(item) {
  if (state.pendingItemIds.has(item.id)) {
    return;
  }

  const confirmed = window.confirm(`确定永久删除“${item.name}”吗？此操作无法恢复。`);
  if (!confirmed) {
    return;
  }

  state.pendingItemIds.add(item.id);
  elements.formError.textContent = "";
  render();

  try {
    await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    state.items = state.items.filter((currentItem) => currentItem.id !== item.id);
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    state.pendingItemIds.delete(item.id);
    render();
  }
}

async function updateEndDate(item, dayDelta) {
  if (state.pendingItemIds.has(item.id)) {
    return;
  }

  const nextEndDate = addUsageDays(item.endDate, dayDelta, item.excludeWeekends);

  if (nextEndDate < item.startDate) {
    elements.formError.textContent = "结束日期不能早于使用日期";
    return;
  }

  state.pendingItemIds.add(item.id);
  elements.formError.textContent = "";
  render();

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
  } catch (error) {
    elements.formError.textContent = error.message;
  } finally {
    state.pendingItemIds.delete(item.id);
    render();
  }
}

function openEditDialog(item) {
  if (state.pendingItemIds.has(item.id)) {
    return;
  }

  state.editingItemId = item.id;
  state.dialogTrigger = document.activeElement;
  elements.editItemName.textContent = item.name;
  elements.editAutoRenewInput.checked = item.autoRenew;
  elements.editError.textContent = "";
  elements.editDialog.hidden = false;
  elements.editAutoRenewInput.focus();
}

function closeEditDialog() {
  if (state.isEditing) {
    return;
  }

  const trigger = state.dialogTrigger;
  const editingItemId = state.editingItemId;
  state.editingItemId = "";
  state.dialogTrigger = null;
  elements.editForm.reset();
  elements.editDialog.hidden = true;
  requestAnimationFrame(() => {
    const nextTrigger = document.querySelector(`[data-edit-item-id="${CSS.escape(editingItemId)}"]`);
    if (trigger instanceof HTMLElement && trigger.isConnected) {
      trigger.focus();
    } else if (nextTrigger instanceof HTMLElement) {
      nextTrigger.focus();
    }
  });
}

function handleDialogKeydown(event) {
  if (elements.editDialog.hidden) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeEditDialog();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = [...elements.editDialog.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements.at(-1);
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function handleTabKeydown(event) {
  const tabs = [elements.activeTab, elements.archivedTab];
  const currentIndex = tabs.indexOf(event.currentTarget);
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % tabs.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = tabs.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  tabs[nextIndex].click();
  tabs[nextIndex].focus();
}

async function handleEditSubmit(event) {
  event.preventDefault();
  if (state.isEditing) {
    return;
  }

  const item = state.items.find((currentItem) => currentItem.id === state.editingItemId);

  if (!item) {
    closeEditDialog();
    return;
  }

  state.isEditing = true;
  elements.editForm.setAttribute("aria-busy", "true");
  elements.editAutoRenewInput.disabled = true;
  elements.editCancelButton.disabled = true;
  elements.editSubmitButton.disabled = true;

  try {
    const data = await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ autoRenew: elements.editAutoRenewInput.checked }),
    });

    state.items = state.items.map((currentItem) => (currentItem.id === item.id ? data.item : currentItem));
    state.isEditing = false;
    closeEditDialog();
  } catch (error) {
    elements.editError.textContent = error.message;
  } finally {
    state.isEditing = false;
    elements.editForm.removeAttribute("aria-busy");
    elements.editAutoRenewInput.disabled = false;
    elements.editCancelButton.disabled = false;
    elements.editSubmitButton.disabled = false;
    render();
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
    const isPending = state.pendingItemIds.has(item.id);
    const row = document.createElement("tr");
    row.className = archived ? "archived-row" : "";
    row.setAttribute("aria-busy", String(isPending));

    row.innerHTML = `
      <td class="name-cell"></td>
      <td></td>
      <td class="muted"></td>
      <td></td>
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

    row.children[4].textContent = archived ? "-" : `${getRemainingUsageDays(item, today)} 天`;

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
    editButton.disabled = isPending;
    editButton.dataset.editItemId = item.id;
    editButton.addEventListener("click", () => openEditDialog(item));
    actions.append(editButton);

    if (!archived) {
      const subtractButton = document.createElement("button");
      subtractButton.className = "day-button";
      subtractButton.type = "button";
      subtractButton.textContent = "-1天";
      subtractButton.disabled = isPending || addUsageDays(item.endDate, -1, item.excludeWeekends) < item.startDate;
      subtractButton.title = "结束日期减少 1 天";
      subtractButton.addEventListener("click", () => updateEndDate(item, -1));
      actions.append(subtractButton);

      const addButton = document.createElement("button");
      addButton.className = "day-button";
      addButton.type = "button";
      addButton.textContent = "+1天";
      addButton.title = "结束日期增加 1 天";
      addButton.disabled = isPending;
      addButton.addEventListener("click", () => updateEndDate(item, 1));
      actions.append(addButton);
    }

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button";
    deleteButton.type = "button";
    deleteButton.title = "删除";
    deleteButton.setAttribute("aria-label", "删除");
    deleteButton.textContent = "×";
    deleteButton.disabled = isPending;
    deleteButton.addEventListener("click", () => deleteItem(item));
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
  if (state.isSubmitting) {
    return;
  }

  const item = createItem(new FormData(elements.form));
  const error = validateItem(item);

  if (error) {
    elements.formError.textContent = error;
    return;
  }

  elements.formError.textContent = "";
  state.isSubmitting = true;
  elements.form.setAttribute("aria-busy", "true");
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "添加中…";

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
  } finally {
    state.isSubmitting = false;
    elements.form.removeAttribute("aria-busy");
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "添加商品";
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.editForm.addEventListener("submit", handleEditSubmit);
elements.editCancelButton.addEventListener("click", closeEditDialog);
elements.editDialog.addEventListener("click", (event) => {
  if (event.target === elements.editDialog && !state.isEditing) {
    closeEditDialog();
  }
});
document.addEventListener("keydown", handleDialogKeydown);
elements.endModeInputs.forEach((input) => input.addEventListener("change", syncEndModeFields));
elements.costModeInputs.forEach((input) => input.addEventListener("change", syncCostModeFields));
elements.activeTab.addEventListener("click", () => setView("active"));
elements.archivedTab.addEventListener("click", () => setView("archived"));
elements.activeTab.addEventListener("keydown", handleTabKeydown);
elements.archivedTab.addEventListener("keydown", handleTabKeydown);
elements.startDateInput.value = getTodayDateString();
setView("active");
syncCostModeFields();
syncEndModeFields();
loadItems();
