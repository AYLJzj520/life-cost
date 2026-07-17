function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeItem(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
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

function isWeekend(dateString) {
  const day = parseLocalDate(dateString).getDay();
  return day === 0 || day === 6;
}

function getUsageDays(startDate, endDate, excludeWeekends) {
  let days = 0;
  let currentDate = startDate;

  while (currentDate <= endDate) {
    if (!excludeWeekends || !isWeekend(currentDate)) {
      days += 1;
    }

    currentDate = addDays(currentDate, 1);
  }

  return days;
}

async function getItem(db, id) {
  const item = await db
    .prepare(
      `SELECT
        id,
        name,
        price,
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
  const id = context.params.id;

  if (!id) {
    return json({ error: "缺少商品 ID" }, 400);
  }

  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "请求数据格式不正确" }, 400);
  }

  const updates = {};

  if ("autoRenew" in payload) {
    updates.autoRenew = Boolean(payload.autoRenew);
  }

  if (!("endDate" in payload) && !("autoRenew" in payload)) {
    return json({ error: "没有可更新的内容" }, 400);
  }

  if ("endDate" in payload && !isDateString(payload.endDate)) {
    return json({ error: "请选择有效结束日期" }, 400);
  }

  const item = await getItem(context.env.DB, id);

  if (!item) {
    return json({ error: "商品不存在" }, 404);
  }

  if (!("endDate" in payload)) {
    await context.env.DB.prepare("UPDATE items SET auto_renew = ? WHERE id = ?")
      .bind(updates.autoRenew ? 1 : 0, id)
      .run();

    return json({
      item: {
        ...item,
        autoRenew: updates.autoRenew,
      },
    });
  }

  if (payload.endDate < item.startDate) {
    return json({ error: "结束日期不能早于使用日期" }, 400);
  }

  const plannedDays = getUsageDays(item.startDate, payload.endDate, item.excludeWeekends);

  if (plannedDays <= 0) {
    return json({ error: "使用区间至少需要包含 1 天" }, 400);
  }

  await context.env.DB.prepare("UPDATE items SET end_date = ?, planned_days = ?, auto_renew = ? WHERE id = ?")
    .bind(payload.endDate, plannedDays, "autoRenew" in updates ? (updates.autoRenew ? 1 : 0) : (item.autoRenew ? 1 : 0), id)
    .run();

  return json({
    item: {
      ...item,
      endDate: payload.endDate,
      plannedDays,
      autoRenew: "autoRenew" in updates ? updates.autoRenew : item.autoRenew,
    },
  });
}

export async function onRequestDelete(context) {
  const id = context.params.id;

  if (!id) {
    return json({ error: "缺少商品 ID" }, 400);
  }

  const result = await context.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();

  if (result.meta.changes === 0) {
    return json({ error: "商品不存在" }, 404);
  }

  return json({ ok: true });
}
