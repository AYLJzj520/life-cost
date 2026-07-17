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

function getTodayDateString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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

function isWeekend(dateString) {
  const day = parseLocalDate(dateString).getDay();
  return day === 0 || day === 6;
}

function isIncludedDate(dateString, excludeWeekends) {
  return !excludeWeekends || !isWeekend(dateString);
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

function getUsageDays(startDate, endDate, excludeWeekends) {
  let days = 0;
  let currentDate = startDate;

  while (currentDate <= endDate) {
    if (isIncludedDate(currentDate, excludeWeekends)) {
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

async function ensureDailyCostColumns(db) {
  const { results } = await db.prepare("PRAGMA table_info(items)").all();
  const columnNames = new Set(results.map((column) => column.name));

  if (!columnNames.has("cost_mode")) {
    await db.prepare("ALTER TABLE items ADD COLUMN cost_mode TEXT NOT NULL DEFAULT 'total'").run();
  }

  if (!columnNames.has("daily_cost")) {
    await db.prepare("ALTER TABLE items ADD COLUMN daily_cost REAL").run();
  }
}

function validateItem(item) {
  if (!item || typeof item !== "object") {
    return "请求数据格式不正确";
  }

  if (typeof item.name !== "string" || item.name.trim() === "") {
    return "请输入商品名称";
  }

  if (item.costMode !== "total" && item.costMode !== "daily") {
    return "请选择成本方式";
  }

  if (item.costMode === "total" && (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0)) {
    return "请输入有效价格";
  }

  if (item.costMode === "daily" && (!Number.isFinite(Number(item.dailyCost)) || Number(item.dailyCost) <= 0)) {
    return "请输入有效每日成本";
  }

  if (!isDateString(item.startDate)) {
    return "请选择使用日期";
  }

  if (item.endMode !== "date" && item.endMode !== "duration") {
    return "请选择结束方式";
  }

  if (item.endMode === "date" && !isDateString(item.endDate)) {
    return "请选择结束日期";
  }

  if (item.endMode === "duration" && (!Number.isInteger(Number(item.plannedDays)) || Number(item.plannedDays) <= 0)) {
    return "请输入有效预计使用天数";
  }

  if (item.endDate < item.startDate) {
    return "结束日期不能早于使用日期";
  }

  if (getUsageDays(item.startDate, item.endDate, item.excludeWeekends) <= 0) {
    return "使用区间至少需要包含 1 天";
  }

  return "";
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

async function renewExpiredItems(db, today) {
  const items = await listItems(db);
  const renewableItems = items.filter((item) => item.autoRenew && item.endDate < today);

  for (const item of renewableItems) {
    const existingRenewal = await db
      .prepare("SELECT id FROM items WHERE renewed_from_id = ? LIMIT 1")
      .bind(item.id)
      .first();

    if (existingRenewal) {
      continue;
    }

    const usageDays = item.plannedDays || getUsageDays(item.startDate, item.endDate, item.excludeWeekends);
    const startDate = addUsageDays(item.endDate, 1, item.excludeWeekends);
    const endDate = getEndDateFromUsageDays(startDate, usageDays, item.excludeWeekends);
    const price = item.costMode === "daily" ? Number(item.dailyCost) * usageDays : item.price;

    await db
      .prepare(
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
        crypto.randomUUID(),
        item.name,
        price,
        item.costMode,
        item.dailyCost,
        startDate,
        endDate,
        item.endMode,
        usageDays,
        item.excludeWeekends ? 1 : 0,
        item.autoRenew ? 1 : 0,
        item.id,
        new Date().toISOString(),
      )
      .run();
  }
}

export async function onRequestGet(context) {
  await ensureDailyCostColumns(context.env.DB);
  const today = getTodayDateString();
  await renewExpiredItems(context.env.DB, today);
  const items = await listItems(context.env.DB);

  return json({ items });
}

export async function onRequestPost(context) {
  await ensureDailyCostColumns(context.env.DB);
  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "请求数据格式不正确" }, 400);
  }

  const costMode = payload.costMode || "total";
  const excludeWeekends = Boolean(payload.excludeWeekends);
  const weekRange = costMode === "daily" ? getNaturalWeekRange(payload.startDate, excludeWeekends) : null;
  const startDate = weekRange ? weekRange.startDate : payload.startDate;
  const plannedDays = costMode === "daily" ? (excludeWeekends ? 5 : 7) : payload.endMode === "duration" ? Number(payload.plannedDays) : null;
  const endDate =
    costMode === "daily"
      ? weekRange.endDate
      : payload.endMode === "duration"
        ? getEndDateFromUsageDays(startDate, plannedDays, excludeWeekends)
        : payload.endDate;
  const usageDays = startDate && endDate ? getUsageDays(startDate, endDate, excludeWeekends) : 0;
  const dailyCost = costMode === "daily" ? Number(payload.dailyCost) : null;
  const price = costMode === "daily" ? dailyCost * usageDays : Number(payload.price);
  const normalizedPayload = {
    ...payload,
    costMode,
    price,
    dailyCost,
    startDate,
    endDate,
    endMode: costMode === "daily" ? "duration" : payload.endMode,
    plannedDays: costMode === "daily" ? usageDays : plannedDays,
    excludeWeekends,
    autoRenew: Boolean(payload.autoRenew),
  };

  const error = validateItem(normalizedPayload);
  if (error) {
    return json({ error }, 400);
  }

  const item = {
    id: crypto.randomUUID(),
    name: normalizedPayload.name.trim(),
    price: Number(normalizedPayload.price),
    costMode: normalizedPayload.costMode,
    dailyCost: normalizedPayload.dailyCost,
    startDate: normalizedPayload.startDate,
    endDate: normalizedPayload.endDate,
    endMode: normalizedPayload.endMode,
    plannedDays: normalizedPayload.plannedDays,
    excludeWeekends: normalizedPayload.excludeWeekends,
    autoRenew: normalizedPayload.autoRenew,
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
}
