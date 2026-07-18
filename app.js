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

const MAX_AMOUNT = 1_000_000_000;

const state = {
  items: [],
  summary: {
    activeDailyCost: 0,
    activeCount: 0,
    archivedCount: 0,
  },
  archivePagination: {
    page: 1,
    pageSize: 50,
    totalItems: 0,
    totalPages: 1,
  },
  view: "active",
  editingItemId: "",
  dialogTrigger: null,
  isSubmitting: false,
  isEditing: false,
  isLoadingItems: true,
  loadingMessage: "正在加载商品…",
  listError: "",
  renewalError: "",
  loadRequestId: 0,
  pendingItemIds: new Set(),
  rowErrors: new Map(),
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
  listStatusRow: document.querySelector("#listStatusRow"),
  listStatus: document.querySelector("#listStatus"),
  listRetryButton: document.querySelector("#listRetryButton"),
  itemRows: document.querySelector("#itemRows"),
  emptyState: document.querySelector("#emptyState"),
  archivePagination: document.querySelector("#archivePagination"),
  archivePreviousButton: document.querySelector("#archivePreviousButton"),
  archiveNextButton: document.querySelector("#archiveNextButton"),
  archivePageText: document.querySelector("#archivePageText"),
  editDialog: document.querySelector("#editDialog"),
  editForm: document.querySelector("#editForm"),
  editItemName: document.querySelector("#editItemName"),
  editAmountLabel: document.querySelector("#editAmountLabel"),
  editAmountInput: document.querySelector("#editAmountInput"),
  editEndDateInput: document.querySelector("#editEndDateInput"),
  editDayDecreaseButton: document.querySelector("#editDayDecreaseButton"),
  editDayIncreaseButton: document.querySelector("#editDayIncreaseButton"),
  editUsageDays: document.querySelector("#editUsageDays"),
  editRemainingDays: document.querySelector("#editRemainingDays"),
  editDailyCost: document.querySelector("#editDailyCost"),
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

function setView(view, { load = true } = {}) {
  state.view = view;
  const isActiveView = view === "active";
  elements.activeTab.classList.toggle("is-active", isActiveView);
  elements.archivedTab.classList.toggle("is-active", !isActiveView);
  elements.activeTab.setAttribute("aria-selected", String(isActiveView));
  elements.archivedTab.setAttribute("aria-selected", String(!isActiveView));
  elements.activeTab.tabIndex = isActiveView ? 0 : -1;
  elements.archivedTab.tabIndex = isActiveView ? -1 : 0;
  render();

  if (load) {
    loadItems(view === "archived" ? 1 : undefined);
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "请求失败，请稍后重试");
  }

  return data;
}

async function renewExpiredItems() {
  let hasMore = true;
  let totalRenewals = 0;

  while (hasMore) {
    state.loadingMessage = totalRenewals > 0
      ? `正在补齐自动续期，已生成 ${totalRenewals} 条…`
      : "正在检查自动续期…";
    renderListState();

    const result = await fetchJson("/api/items/renew", { method: "POST" });
    const renewalCount = Number(result.renewalCount || 0);
    totalRenewals += renewalCount;
    hasMore = Boolean(result.hasMore);

    if (hasMore && renewalCount === 0) {
      throw new Error("自动续期暂时无法继续，请稍后重试");
    }
  }

  return totalRenewals;
}

async function loadItems(page = state.archivePagination.page) {
  const requestId = state.loadRequestId + 1;
  state.loadRequestId = requestId;
  state.isLoadingItems = true;
  state.loadingMessage = "正在加载商品…";
  state.listError = "";
  state.items = [];
  render();

  try {
    const query = new URLSearchParams({ view: state.view });
    if (state.view === "archived") {
      query.set("page", String(page));
    }

    const data = await fetchJson(`/api/items?${query}`);
    if (requestId !== state.loadRequestId) {
      return;
    }

    state.items = data.items || [];
    state.summary = {
      activeDailyCost: Number(data.summary?.activeDailyCost || 0),
      activeCount: Number(data.summary?.activeCount || 0),
      archivedCount: Number(data.summary?.archivedCount || 0),
    };
    if (data.pagination) {
      state.archivePagination = data.pagination;
    }
    state.rowErrors.clear();
  } catch (error) {
    if (requestId === state.loadRequestId) {
      state.listError = error.message;
    }
  } finally {
    if (requestId === state.loadRequestId) {
      state.isLoadingItems = false;
      render();
    }
  }
}

async function initializeItems() {
  state.isLoadingItems = true;
  state.listError = "";
  state.renewalError = "";
  render();

  try {
    await renewExpiredItems();
  } catch (error) {
    state.renewalError = `自动续期失败：${error.message}`;
  }

  await loadItems(state.view === "archived" ? 1 : undefined);
}

function setRowError(itemId, message = "") {
  if (message) {
    state.rowErrors.set(itemId, message);
  } else {
    state.rowErrors.delete(itemId);
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
  setRowError(item.id);
  render();

  try {
    await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    await loadItems(state.view === "archived" ? state.archivePagination.page : undefined);
  } catch (error) {
    setRowError(item.id, error.message);
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
    setRowError(item.id, "结束日期不能早于使用日期");
    render();
    return;
  }

  state.pendingItemIds.add(item.id);
  setRowError(item.id);
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
    await loadItems();
  } catch (error) {
    setRowError(item.id, error.message);
  } finally {
    state.pendingItemIds.delete(item.id);
    render();
  }
}

function getEditingItem() {
  return state.items.find((item) => item.id === state.editingItemId);
}

function getAdjustedEditEndDate(item, dayDelta) {
  const endDate = elements.editEndDateInput.value;
  if (!isAllowedDateString(endDate)) {
    return null;
  }

  try {
    const nextEndDate = addUsageDays(endDate, dayDelta, item.excludeWeekends);
    if (
      !isAllowedDateString(nextEndDate)
      || nextEndDate < item.startDate
      || getInclusiveDays(item.startDate, nextEndDate) > MAX_DATE_SPAN_DAYS
    ) {
      return null;
    }
    return nextEndDate;
  } catch {
    return null;
  }
}

function syncEditPreview() {
  const item = getEditingItem();
  if (!item) {
    return;
  }

  const amount = Number(elements.editAmountInput.value);
  const endDate = elements.editEndDateInput.value;
  const validAmount = Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;
  const validEndDate = isAllowedDateString(endDate)
    && endDate >= item.startDate
    && getInclusiveDays(item.startDate, endDate) <= MAX_DATE_SPAN_DAYS;
  const usageDays = validEndDate
    ? getUsageDays(item.startDate, endDate, item.excludeWeekends)
    : 0;
  const previewItem = { ...item, endDate };
  const remainingDays = usageDays > 0 ? getRemainingUsageDays(previewItem) : 0;
  const dailyCost = validAmount && usageDays > 0
    ? item.costMode === "daily" ? amount : amount / usageDays
    : NaN;

  elements.editUsageDays.textContent = usageDays > 0 ? `${usageDays} 天` : "-";
  elements.editRemainingDays.textContent = usageDays > 0 ? `${remainingDays} 天` : "-";
  elements.editDailyCost.textContent = Number.isFinite(dailyCost) ? formatCurrency(dailyCost) : "-";

  elements.editDayDecreaseButton.disabled = state.isEditing || !getAdjustedEditEndDate(item, -1);
  elements.editDayIncreaseButton.disabled = state.isEditing || !getAdjustedEditEndDate(item, 1);
}

function adjustEditEndDate(dayDelta) {
  const item = getEditingItem();
  if (!item) {
    return;
  }

  const nextEndDate = getAdjustedEditEndDate(item, dayDelta);
  if (!nextEndDate) {
    return;
  }

  elements.editEndDateInput.value = nextEndDate;
  elements.editError.textContent = "";
  syncEditPreview();
}

function openEditDialog(item) {
  if (state.pendingItemIds.has(item.id)) {
    return;
  }

  state.editingItemId = item.id;
  state.dialogTrigger = document.activeElement;
  elements.editItemName.textContent = item.name;
  elements.editAmountLabel.textContent = item.costMode === "daily" ? "每日成本" : "总金额";
  elements.editAmountInput.value = String(item.costMode === "daily" ? item.dailyCost : item.price);
  elements.editEndDateInput.min = item.startDate;
  elements.editEndDateInput.value = item.endDate;
  elements.editAutoRenewInput.checked = item.autoRenew;
  elements.editError.textContent = "";
  elements.editDialog.hidden = false;
  syncEditPreview();
  elements.editAmountInput.focus();
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

  const amount = Number(elements.editAmountInput.value);
  const endDate = elements.editEndDateInput.value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    elements.editError.textContent = item.costMode === "daily"
      ? `每日成本必须大于 0 且不超过 ${MAX_AMOUNT}`
      : `价格必须大于 0 且不超过 ${MAX_AMOUNT}`;
    return;
  }

  if (!isAllowedDateString(endDate)) {
    elements.editError.textContent = "请选择有效结束日期";
    return;
  }

  const calendarDays = getInclusiveDays(item.startDate, endDate);
  if (calendarDays <= 0) {
    elements.editError.textContent = "结束日期不能早于使用日期";
    return;
  }

  if (calendarDays > MAX_DATE_SPAN_DAYS) {
    elements.editError.textContent = `使用日期跨度不能超过 ${MAX_DATE_SPAN_DAYS} 天`;
    return;
  }

  if (getUsageDays(item.startDate, endDate, item.excludeWeekends) <= 0) {
    elements.editError.textContent = "使用区间至少需要包含 1 天";
    return;
  }

  state.isEditing = true;
  elements.editForm.setAttribute("aria-busy", "true");
  elements.editAmountInput.disabled = true;
  elements.editEndDateInput.disabled = true;
  elements.editAutoRenewInput.disabled = true;
  elements.editCancelButton.disabled = true;
  elements.editSubmitButton.disabled = true;
  syncEditPreview();

  try {
    const payload = {
      endDate,
      autoRenew: elements.editAutoRenewInput.checked,
      [item.costMode === "daily" ? "dailyCost" : "price"]: amount,
    };
    const data = await fetchJson(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    state.items = state.items.map((currentItem) => (currentItem.id === item.id ? data.item : currentItem));
    state.isEditing = false;
    closeEditDialog();
    await loadItems(state.view === "archived" ? state.archivePagination.page : undefined);
  } catch (error) {
    elements.editError.textContent = error.message;
  } finally {
    state.isEditing = false;
    elements.editForm.removeAttribute("aria-busy");
    elements.editAmountInput.disabled = false;
    elements.editEndDateInput.disabled = false;
    elements.editAutoRenewInput.disabled = false;
    elements.editCancelButton.disabled = false;
    elements.editSubmitButton.disabled = false;
    if (!elements.editDialog.hidden) {
      syncEditPreview();
    }
    render();
  }
}

function renderSummary() {
  const today = getTodayDateString();

  elements.todayText.textContent = today;
  elements.activeDailyCost.textContent = formatCurrency(state.summary.activeDailyCost);
  elements.activeCount.textContent = String(state.summary.activeCount);
  elements.archivedCount.textContent = String(state.summary.archivedCount);
}

function renderListState() {
  const errorMessage = state.listError || state.renewalError;
  const statusMessage = state.isLoadingItems ? state.loadingMessage : errorMessage;
  elements.listStatusRow.hidden = !statusMessage;
  elements.listStatus.textContent = statusMessage;
  elements.listStatus.classList.toggle("is-error", Boolean(!state.isLoadingItems && errorMessage));
  elements.listRetryButton.hidden = state.isLoadingItems || !errorMessage;

  const showPagination = state.view === "archived"
    && !state.isLoadingItems
    && !state.listError
    && state.archivePagination.totalItems > 0;
  elements.archivePagination.hidden = !showPagination;
  elements.archivePreviousButton.disabled = state.archivePagination.page <= 1 || state.isLoadingItems;
  elements.archiveNextButton.disabled = (
    state.archivePagination.page >= state.archivePagination.totalPages || state.isLoadingItems
  );
  elements.archivePageText.textContent = `第 ${state.archivePagination.page} / ${state.archivePagination.totalPages} 页`;
}

function renderRows() {
  const today = getTodayDateString();
  const visibleItems = state.items
    .filter((item) => (state.view === "archived" ? isArchived(item, today) : !isArchived(item, today)))
    .sort((a, b) => {
      if (state.view === "active") {
        const remainingDaysDifference = getRemainingUsageDays(a, today) - getRemainingUsageDays(b, today);
        if (remainingDaysDifference !== 0) {
          return remainingDaysDifference;
        }

        return a.endDate.localeCompare(b.endDate);
      }

      return 0;
    });

  elements.itemRows.innerHTML = "";
  elements.emptyState.classList.toggle(
    "is-visible",
    !state.isLoadingItems && !state.listError && visibleItems.length === 0,
  );

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
      <td>
        <div class="row-action-stack">
          <div class="row-actions"></div>
          <p class="row-error" role="alert"></p>
        </div>
      </td>
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
    row.querySelector(".row-error").textContent = state.rowErrors.get(item.id) || "";

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
  renderListState();
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
    await fetchJson("/api/items", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(item),
    });

    elements.form.reset();
    elements.startDateInput.value = getTodayDateString();
    syncCostModeFields();
    syncEndModeFields();
    await loadItems(state.view === "archived" ? 1 : undefined);
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
elements.editDayDecreaseButton.addEventListener("click", () => adjustEditEndDate(-1));
elements.editDayIncreaseButton.addEventListener("click", () => adjustEditEndDate(1));
elements.editAmountInput.addEventListener("input", () => {
  elements.editError.textContent = "";
  syncEditPreview();
});
elements.editEndDateInput.addEventListener("input", () => {
  elements.editError.textContent = "";
  syncEditPreview();
});
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
elements.archivePreviousButton.addEventListener("click", () => {
  if (state.archivePagination.page > 1) {
    loadItems(state.archivePagination.page - 1);
  }
});
elements.archiveNextButton.addEventListener("click", () => {
  if (state.archivePagination.page < state.archivePagination.totalPages) {
    loadItems(state.archivePagination.page + 1);
  }
});
elements.listRetryButton.addEventListener("click", () => {
  if (state.renewalError) {
    initializeItems();
  } else {
    loadItems();
  }
});
elements.activeTab.addEventListener("keydown", handleTabKeydown);
elements.archivedTab.addEventListener("keydown", handleTabKeydown);
elements.startDateInput.value = getTodayDateString();
setView("active", { load: false });
syncCostModeFields();
syncEndModeFields();
initializeItems();
