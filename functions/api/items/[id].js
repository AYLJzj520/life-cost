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
    const allowedFields = new Set(["endDate", "autoRenew"]);
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
      throw new RequestError("请求包含不支持的更新字段");
    }

    const hasEndDate = "endDate" in payload;
    const hasAutoRenew = "autoRenew" in payload;
    if (!hasEndDate && !hasAutoRenew) {
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

    if (!hasEndDate) {
      await context.env.DB.prepare("UPDATE items SET auto_renew = ? WHERE id = ?")
        .bind(autoRenew ? 1 : 0, id)
        .run();

      return json({ item: { ...item, autoRenew } });
    }

    const calendarDays = getInclusiveDays(item.startDate, payload.endDate);
    if (calendarDays <= 0) {
      throw new RequestError("结束日期不能早于使用日期");
    }

    if (calendarDays > MAX_DATE_SPAN_DAYS) {
      throw new RequestError(`使用日期跨度不能超过 ${MAX_DATE_SPAN_DAYS} 天`);
    }

    const plannedDays = getUsageDays(item.startDate, payload.endDate, item.excludeWeekends);
    if (plannedDays <= 0) {
      throw new RequestError("使用区间至少需要包含 1 天");
    }

    const price = item.costMode === "daily" ? Number(item.dailyCost) * plannedDays : item.price;
    if (!Number.isFinite(price) || price <= 0 || price > MAX_AMOUNT) {
      throw new RequestError(`价格必须大于 0 且不超过 ${MAX_AMOUNT}`);
    }

    const nextAutoRenew = hasAutoRenew ? autoRenew : item.autoRenew;
    await context.env.DB.prepare(
      "UPDATE items SET end_date = ?, planned_days = ?, price = ?, auto_renew = ? WHERE id = ?",
    )
      .bind(payload.endDate, plannedDays, price, nextAutoRenew ? 1 : 0, id)
      .run();

    return json({
      item: {
        ...item,
        price,
        endDate: payload.endDate,
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
