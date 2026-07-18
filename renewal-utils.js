import {
  MAX_DATE_SPAN_DAYS,
  addUsageDays,
  getEndDateFromUsageDays,
  getUsageDays,
  isAllowedDateString,
} from "./date-utils.js";

export function createRenewalItem(sourceItem, id, createdAt) {
  const usageDays = sourceItem.plannedDays || getUsageDays(
    sourceItem.startDate,
    sourceItem.endDate,
    sourceItem.excludeWeekends,
  );

  if (!Number.isInteger(usageDays) || usageDays <= 0 || usageDays > MAX_DATE_SPAN_DAYS) {
    throw new RangeError("续期天数超出允许范围");
  }

  const startDate = addUsageDays(sourceItem.endDate, 1, sourceItem.excludeWeekends);
  const endDate = getEndDateFromUsageDays(startDate, usageDays, sourceItem.excludeWeekends);

  if (!isAllowedDateString(startDate) || !isAllowedDateString(endDate)) {
    throw new RangeError("续期日期超出允许范围");
  }

  const price = sourceItem.costMode === "daily"
    ? Number(sourceItem.dailyCost) * usageDays
    : Number(sourceItem.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new RangeError("续期价格无效");
  }

  return {
    id,
    name: sourceItem.name,
    price,
    costMode: sourceItem.costMode,
    dailyCost: sourceItem.dailyCost,
    startDate,
    endDate,
    endMode: sourceItem.endMode,
    plannedDays: usageDays,
    excludeWeekends: sourceItem.excludeWeekends,
    autoRenew: sourceItem.autoRenew,
    renewedFromId: sourceItem.id,
    createdAt,
  };
}
