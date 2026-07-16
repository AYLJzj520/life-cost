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

async function getItem(db, id) {
  return db
    .prepare(
      `SELECT
        id,
        name,
        price,
        start_date AS startDate,
        end_date AS endDate,
        created_at AS createdAt
      FROM items
      WHERE id = ?`,
    )
    .bind(id)
    .first();
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

  if (!isDateString(payload.endDate)) {
    return json({ error: "请选择有效结束日期" }, 400);
  }

  const item = await getItem(context.env.DB, id);

  if (!item) {
    return json({ error: "商品不存在" }, 404);
  }

  if (payload.endDate < item.startDate) {
    return json({ error: "结束日期不能早于使用日期" }, 400);
  }

  await context.env.DB.prepare("UPDATE items SET end_date = ? WHERE id = ?").bind(payload.endDate, id).run();

  return json({
    item: {
      ...item,
      endDate: payload.endDate,
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
