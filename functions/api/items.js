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

function validateItem(item) {
  if (!item || typeof item !== "object") {
    return "请求数据格式不正确";
  }

  if (typeof item.name !== "string" || item.name.trim() === "") {
    return "请输入商品名称";
  }

  if (!Number.isFinite(Number(item.price)) || Number(item.price) <= 0) {
    return "请输入有效价格";
  }

  if (!isDateString(item.startDate) || !isDateString(item.endDate)) {
    return "请选择使用日期和结束日期";
  }

  if (item.endDate < item.startDate) {
    return "结束日期不能早于使用日期";
  }

  return "";
}

export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    `SELECT
      id,
      name,
      price,
      start_date AS startDate,
      end_date AS endDate,
      created_at AS createdAt
    FROM items
    ORDER BY created_at DESC`,
  ).all();

  return json({ items: results });
}

export async function onRequestPost(context) {
  let payload;

  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "请求数据格式不正确" }, 400);
  }

  const error = validateItem(payload);
  if (error) {
    return json({ error }, 400);
  }

  const item = {
    id: crypto.randomUUID(),
    name: payload.name.trim(),
    price: Number(payload.price),
    startDate: payload.startDate,
    endDate: payload.endDate,
    createdAt: new Date().toISOString(),
  };

  await context.env.DB.prepare(
    `INSERT INTO items (id, name, price, start_date, end_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(item.id, item.name, item.price, item.startDate, item.endDate, item.createdAt)
    .run();

  return json({ item }, 201);
}
