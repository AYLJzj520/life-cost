import {
  RequestError,
  getBooleanField,
  handleRequestError,
  json,
  readJsonObject,
} from "../../../api-utils.js";
import {
  MAX_DATE_SPAN_DAYS,
  getInclusiveDays,
  getUsageDays,
  isAllowedDateString,
} from "../../../date-utils.js";

const MAX_AMOUNT = 1_000_000_000;

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

async function getItem(db, id) {
  const item = await db
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
      WHERE id = ?`,
    )
    .bind(id)
    .first();

  return item ? normalizeItem(item) : null;
}

export async function onRequestPatch(context) {
  try {
    const id = context.params.id;
    if (!id) {
      throw new RequestError("缺少商品 ID");
    }

    const payload = await readJsonObject(context.request);
    const allowedFields = new Set(["endDate", "autoRenew", "price", "dailyCost"]);
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
      throw new RequestError("请求包含不支持的更新字段");
    }

    const hasEndDate = "endDate" in payload;
    const hasAutoRenew = "autoRenew" in payload;
    const hasPrice = "price" in payload;
    const hasDailyCost = "dailyCost" in payload;
    if (!hasEndDate && !hasAutoRenew && !hasPrice && !hasDailyCost) {
      throw new RequestError("没有可更新的内容");
    }

    if (hasEndDate && !isAllowedDateString(payload.endDate)) {
      throw new RequestError("请选择 1900-01-01 至 2100-12-31 之间的有效结束日期");
    }

    const autoRenew = getBooleanField(payload, "autoRenew", undefined, "自动续期");
    const item = await getItem(context.env.DB, id);
    if (!item) {
      return json({ error: "商品不存在" }, 404);
    }

    if (hasPrice && item.costMode !== "total") {
      throw new RequestError("每日固定成本商品不能修改总金额");
    }

    if (hasDailyCost && item.costMode !== "daily") {
      throw new RequestError("总价分摊商品不能修改每日成本");
    }

    if (hasPrice && (
      typeof payload.price !== "number"
      || !Number.isFinite(payload.price)
      || payload.price <= 0
      || payload.price > MAX_AMOUNT
    )) {
      throw new RequestError(`价格必须大于 0 且不超过 ${MAX_AMOUNT}`);
    }

    if (hasDailyCost && (
      typeof payload.dailyCost !== "number"
      || !Number.isFinite(payload.dailyCost)
      || payload.dailyCost <= 0
      || payload.dailyCost > MAX_AMOUNT
    )) {
      throw new RequestError(`每日成本必须大于 0 且不超过 ${MAX_AMOUNT}`);
    }

    if (!hasEndDate && !hasPrice && !hasDailyCost) {
      await context.env.DB.prepare("UPDATE items SET auto_renew = ? WHERE id = ?")
        .bind(autoRenew ? 1 : 0, id)
        .run();

      return json({ item: { ...item, autoRenew } });
    }

    const endDate = hasEndDate ? payload.endDate : item.endDate;
    const calendarDays = getInclusiveDays(item.startDate, endDate);
    if (calendarDays <= 0) {
      throw new RequestError("结束日期不能早于使用日期");
    }

    if (calendarDays > MAX_DATE_SPAN_DAYS) {
      throw new RequestError(`使用日期跨度不能超过 ${MAX_DATE_SPAN_DAYS} 天`);
    }

    const plannedDays = getUsageDays(item.startDate, endDate, item.excludeWeekends);
    if (plannedDays <= 0) {
      throw new RequestError("使用区间至少需要包含 1 天");
    }

    let dailyCost = null;
    let price;
    if (item.costMode === "daily") {
      dailyCost = hasDailyCost ? payload.dailyCost : Number(item.dailyCost);
      price = dailyCost * plannedDays;
    } else {
      price = hasPrice ? payload.price : Number(item.price);
    }

    if (item.costMode === "daily" && (!Number.isFinite(dailyCost) || dailyCost <= 0 || dailyCost > MAX_AMOUNT)) {
      throw new RequestError(`每日成本必须大于 0 且不超过 ${MAX_AMOUNT}`);
    }

    if (!Number.isFinite(price) || price <= 0 || price > MAX_AMOUNT) {
      throw new RequestError(`价格必须大于 0 且不超过 ${MAX_AMOUNT}`);
    }

    const nextAutoRenew = hasAutoRenew ? autoRenew : item.autoRenew;
    await context.env.DB.prepare(
      "UPDATE items SET end_date = ?, planned_days = ?, price = ?, daily_cost = ?, auto_renew = ? WHERE id = ?",
    )
      .bind(endDate, plannedDays, price, dailyCost, nextAutoRenew ? 1 : 0, id)
      .run();

    return json({
      item: {
        ...item,
        price,
        dailyCost,
        endDate,
        plannedDays,
        autoRenew: nextAutoRenew,
      },
    });
  } catch (error) {
    return handleRequestError(error);
  }
}

export async function onRequestDelete(context) {
  try {
    const id = context.params.id;
    if (!id) {
      throw new RequestError("缺少商品 ID");
    }

    const result = await context.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
    if (result.meta.changes === 0) {
      return json({ error: "商品不存在" }, 404);
    }

    return json({ ok: true });
  } catch (error) {
    return handleRequestError(error);
  }
}
