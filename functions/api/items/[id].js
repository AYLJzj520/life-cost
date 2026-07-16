function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
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
