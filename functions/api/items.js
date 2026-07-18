import {
  RequestError,
  getBooleanField,
  handleRequestError,
  json,
  readJsonObject,
} from "../../api-utils.js";
import {
  MAX_DATE_SPAN_DAYS,
  getEndDateFromUsageDays,
  getInclusiveDays,
  getNaturalWeekRange,
  getTodayDateString,
  getUsageDays,
  isAllowedDateString,
} from "../../date-utils.js";
import { createRenewalItem } from "../../renewal-utils.js";

const MAX_NAME_LENGTH = 100;
const MAX_AMOUNT = 1_000_000_000;
const MAX_RENEWALS_PER_REQUEST = 40;

function normalizeItem(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    costMode: row.costMode || "total",
    dailyCost: row.dailyCost,
    startDate: row.startDate,
    endDate: row.endDate,
    endMode: row.endMode || "date",
    plannedDays: row.plannedDays,
    excludeWeekends: Boolean(row.excludeWeekends),
    autoRenew: Boolean(row.autoRenew),
    renewedFromId: row.renewedFromId,
    createdAt: row.createdAt,
  };
}

export function normalizeNewItemPayload(payload) {
  if (typeof payload.name !== "string" || payload.name.trim() === "") {
    throw new RequestError("请输入商品名称");
  }

  const name = payload.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new RequestError(`商品名称不能超过 ${MAX_NAME_LENGTH} 个字符`);
  }

  const costMode = payload.costMode ?? "total";
  if (costMode !== "total" && costMode !== "daily") {
    throw new RequestError("请选择成本方式");
  }

  const excludeWeekends = getBooleanField(payload, "excludeWeekends", false, "不包含周末");
  const autoRenew = getBooleanField(payload, "autoRenew", false, "自动续期");

  if (!isAllowedDateString(payload.startDate)) {
    throw new RequestError("请选择 1900-01-01 至 2100-12-31 之间的有效使用日期");
  }

  let startDate = payload.startDate;
  let endDate;
  let endMode;
  let plannedDays;
  let dailyCost = null;
  let price;

  if (costMode === "daily") {
    if (typeof payload.dailyCost !== "number" || !Number.isFinite(payload.dailyCost) || payload.dailyCost <= 0) {
      throw new RequestError("请输入有效每日成本");
    }

    dailyCost = payload.dailyCost;
    const weekRange = getNaturalWeekRange(startDate, excludeWeekends);
    startDate = weekRange.startDate;
    endDate = weekRange.endDate;
    endMode = "duration";
    plannedDays = getUsageDays(startDate, endDate, excludeWeekends);
    price = dailyCost * plannedDays;
  } else {
    if (typeof payload.price !== "number" || !Number.isFinite(payload.price) || payload.price <= 0) {
      throw new RequestError("请输入有效价格");
    }

    price = payload.price;
    endMode = payload.endMode;
    if (endMode !== "date" && endMode !== "duration") {
      throw new RequestError("请选择结束方式");
    }

    if (endMode === "duration") {
      if (
        !Number.isInteger(payload.plannedDays) ||
        payload.plannedDays <= 0 ||
        payload.plannedDays > MAX_DATE_SPAN_DAYS
      ) {
        throw new RequestError(`预计使用天数必须是 1 至 ${MAX_DATE_SPAN_DAYS} 之间的整数`);
      }

      plannedDays = payload.plannedDays;
      endDate = getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends);
    } else {
      if (!isAllowedDateString(payload.endDate)) {
        throw new RequestError("请选择 1900-01-01 至 2100-12-31 之间的有效结束日期");
      }

      plannedDays = null;
      endDate = payload.endDate;
    }
  }

  if (!isAllowedDateString(startDate) || !isAllowedDateString(endDate)) {
    throw new RequestError("使用日期超出允许范围");
  }

  const calendarDays = getInclusiveDays(startDate, endDate);
  if (calendarDays <= 0) {
    throw new RequestError("结束日期不能早于使用日期");
  }

  if (calendarDays > MAX_DATE_SPAN_DAYS) {
    throw new RequestError(`使用日期跨度不能超过 ${MAX_DATE_SPAN_DAYS} 天`);
  }

  const usageDays = getUsageDays(startDate, endDate, excludeWeekends);
  if (usageDays <= 0) {
    throw new RequestError("使用区间至少需要包含 1 天");
  }

  if (!Number.isFinite(price) || price <= 0 || price > MAX_AMOUNT) {
    throw new RequestError(`价格必须大于 0 且不超过 ${MAX_AMOUNT}`);
  }

  if (dailyCost !== null && dailyCost > MAX_AMOUNT) {
    throw new RequestError(`每日成本不能超过 ${MAX_AMOUNT}`);
  }

  return {
    name,
    price,
    dailyCost,
    costMode,
    startDate,
    endDate,
    endMode,
    plannedDays: costMode === "daily" ? usageDays : plannedDays,
    excludeWeekends,
    autoRenew,
  };
}

async function listItems(db) {
  const { results } = await db
    .prepare(
      `SELECT
        id,
        name,
        price,
        cost_mode AS costMode,
        daily_cost AS dailyCost,
        start_date AS startDate,
        end_date AS endDate,
        end_mode AS endMode,
        planned_days AS plannedDays,
        exclude_weekends AS excludeWeekends,
        auto_renew AS autoRenew,
        renewed_from_id AS renewedFromId,
        created_at AS createdAt
      FROM items
      ORDER BY created_at DESC`,
    )
    .all();

  return results.map(normalizeItem);
}

async function listRenewableLeaves(db, today) {
  const { results } = await db
    .prepare(
      `SELECT
        source.id,
        source.name,
        source.price,
        source.cost_mode AS costMode,
        source.daily_cost AS dailyCost,
        source.start_date AS startDate,
        source.end_date AS endDate,
        source.end_mode AS endMode,
        source.planned_days AS plannedDays,
        source.exclude_weekends AS excludeWeekends,
        source.auto_renew AS autoRenew,
        source.renewed_from_id AS renewedFromId,
        source.created_at AS createdAt
      FROM items AS source
      WHERE source.auto_renew = 1
        AND source.end_date < ?
        AND NOT EXISTS (
          SELECT 1
          FROM items AS child
          WHERE child.renewed_from_id = source.id
        )
      ORDER BY source.end_date ASC`,
    )
    .bind(today)
    .all();

  return results.map(normalizeItem);
}

async function insertRenewalIfAbsent(db, sourceItem) {
  const renewal = createRenewalItem(sourceItem, crypto.randomUUID(), new Date().toISOString());
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO items (
        id,
        name,
        price,
        cost_mode,
        daily_cost,
        start_date,
        end_date,
        end_mode,
        planned_days,
        exclude_weekends,
        auto_renew,
        renewed_from_id,
        created_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1
        FROM items
        WHERE renewed_from_id = ?
      )`,
    )
    .bind(
      renewal.id,
      renewal.name,
      renewal.price,
      renewal.costMode,
      renewal.dailyCost,
      renewal.startDate,
      renewal.endDate,
      renewal.endMode,
      renewal.plannedDays,
      renewal.excludeWeekends ? 1 : 0,
      renewal.autoRenew ? 1 : 0,
      renewal.renewedFromId,
      renewal.createdAt,
      sourceItem.id,
    )
    .run();

  if (result.meta.changes > 0) {
    return renewal;
  }

  return null;
}

export async function renewExpiredItems(db, today) {
  const renewableLeaves = await listRenewableLeaves(db, today);
  let renewalCount = 0;

  for (const leaf of renewableLeaves) {
    if (renewalCount >= MAX_RENEWALS_PER_REQUEST) {
      break;
    }

    let currentItem = leaf;

    while (currentItem.autoRenew && currentItem.endDate < today && renewalCount < MAX_RENEWALS_PER_REQUEST) {
      const nextItem = await insertRenewalIfAbsent(db, currentItem);
      if (!nextItem) {
        break;
      }

      currentItem = nextItem;
      renewalCount += 1;
    }
  }
}

export async function onRequestGet(context) {
  try {
    const today = getTodayDateString();
    await renewExpiredItems(context.env.DB, today);
    const items = await listItems(context.env.DB);
    return json({ items });
  } catch (error) {
    return handleRequestError(error);
  }
}

export async function onRequestPost(context) {
  try {
    const payload = await readJsonObject(context.request);
    const normalizedPayload = normalizeNewItemPayload(payload);
    const item = {
      id: crypto.randomUUID(),
      ...normalizedPayload,
      renewedFromId: null,
      createdAt: new Date().toISOString(),
    };

    await context.env.DB.prepare(
      `INSERT INTO items (
        id,
        name,
        price,
        cost_mode,
        daily_cost,
        start_date,
        end_date,
        end_mode,
        planned_days,
        exclude_weekends,
        auto_renew,
        renewed_from_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        item.id,
        item.name,
        item.price,
        item.costMode,
        item.dailyCost,
        item.startDate,
        item.endDate,
        item.endMode,
        item.plannedDays,
        item.excludeWeekends ? 1 : 0,
        item.autoRenew ? 1 : 0,
        item.renewedFromId,
        item.createdAt,
      )
      .run();

    return json({ item }, 201);
  } catch (error) {
    return handleRequestError(error);
  }
}
