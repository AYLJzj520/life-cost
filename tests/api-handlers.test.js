import test from "node:test";
import assert from "node:assert/strict";

import {
  onRequestGet,
  renewExpiredItems,
} from "../functions/api/items.js";
import {
  onRequestDelete,
  onRequestPatch,
} from "../functions/api/items/[id].js";
import { onRequestPost as onRequestRenew } from "../functions/api/items/renew.js";
import {
  addDays,
  getTodayDateString,
} from "../date-utils.js";

function cloneItem(item) {
  return { ...item };
}

function createItem(overrides = {}) {
  return {
    id: "item-1",
    name: "测试商品",
    price: 50,
    costMode: "daily",
    dailyCost: 10,
    startDate: "2026-07-06",
    endDate: "2026-07-10",
    endMode: "duration",
    plannedDays: 5,
    excludeWeekends: true,
    autoRenew: true,
    renewedFromId: null,
    createdAt: "2026-07-06T00:00:00.000Z",
    ...overrides,
  };
}

class FakeD1Database {
  constructor(items = []) {
    this.items = items.map(cloneItem);
  }

  prepare(sql) {
    return new FakeD1Statement(this, sql);
  }
}

class FakeD1Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async all() {
    if (this.sql.includes("FROM items AS source")) {
      const today = this.values[0];
      const results = this.db.items
        .filter((source) => (
          source.autoRenew
          && source.endDate < today
          && !this.db.items.some((child) => child.renewedFromId === source.id)
        ))
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .map(cloneItem);
      return { results };
    }

    if (this.sql.includes("FROM items WHERE end_date >= ?")) {
      const today = this.values[0];
      const results = this.db.items
        .filter((item) => item.endDate >= today)
        .sort((a, b) => (
          a.endDate.localeCompare(b.endDate)
          || b.createdAt.localeCompare(a.createdAt)
          || b.id.localeCompare(a.id)
        ))
        .map(cloneItem);
      return { results };
    }

    if (this.sql.includes("FROM items WHERE end_date < ?") && this.sql.includes("LIMIT ? OFFSET ?")) {
      const [today, limit, offset] = this.values;
      const results = this.db.items
        .filter((item) => item.endDate < today)
        .sort((a, b) => (
          b.endDate.localeCompare(a.endDate)
          || b.createdAt.localeCompare(a.createdAt)
          || b.id.localeCompare(a.id)
        ))
        .slice(offset, offset + limit)
        .map(cloneItem);
      return { results };
    }

    throw new Error(`FakeD1 未实现 all(): ${this.sql}`);
  }

  async first() {
    if (this.sql === "SELECT COUNT(*) AS archivedCount FROM items WHERE end_date < ?") {
      const archivedCount = this.db.items.filter((item) => item.endDate < this.values[0]).length;
      return { archivedCount };
    }

    if (this.sql.includes("WHERE id = ?")) {
      const item = this.db.items.find((candidate) => candidate.id === this.values[0]);
      return item ? cloneItem(item) : null;
    }

    if (this.sql.includes("WHERE renewed_from_id = ?")) {
      const item = this.db.items.find((candidate) => candidate.renewedFromId === this.values[0]);
      return item ? cloneItem(item) : null;
    }

    if (this.sql.startsWith("SELECT 1") && this.sql.includes("FROM items AS source")) {
      const today = this.values[0];
      const item = this.db.items.find((source) => (
        source.autoRenew
        && source.endDate < today
        && !this.db.items.some((child) => child.renewedFromId === source.id)
      ));
      return item ? { value: 1 } : null;
    }

    throw new Error(`FakeD1 未实现 first(): ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith("INSERT OR IGNORE INTO items")) {
      const sourceId = this.values[13];
      const existingChild = this.db.items.find((item) => item.renewedFromId === sourceId);
      if (existingChild) {
        return { meta: { changes: 0 } };
      }

      this.db.items.push(createItem({
        id: this.values[0],
        name: this.values[1],
        price: this.values[2],
        costMode: this.values[3],
        dailyCost: this.values[4],
        startDate: this.values[5],
        endDate: this.values[6],
        endMode: this.values[7],
        plannedDays: this.values[8],
        excludeWeekends: Boolean(this.values[9]),
        autoRenew: Boolean(this.values[10]),
        renewedFromId: this.values[11],
        createdAt: this.values[12],
      }));
      return { meta: { changes: 1 } };
    }

    if (this.sql === "UPDATE items SET auto_renew = ? WHERE id = ?") {
      const item = this.db.items.find((candidate) => candidate.id === this.values[1]);
      if (!item) {
        return { meta: { changes: 0 } };
      }
      item.autoRenew = Boolean(this.values[0]);
      return { meta: { changes: 1 } };
    }

    if (this.sql.startsWith("UPDATE items SET end_date = ?")) {
      const item = this.db.items.find((candidate) => candidate.id === this.values[4]);
      if (!item) {
        return { meta: { changes: 0 } };
      }
      item.endDate = this.values[0];
      item.plannedDays = this.values[1];
      item.price = this.values[2];
      item.autoRenew = Boolean(this.values[3]);
      return { meta: { changes: 1 } };
    }

    if (this.sql === "DELETE FROM items WHERE id = ?") {
      const itemIndex = this.db.items.findIndex((candidate) => candidate.id === this.values[0]);
      if (itemIndex === -1) {
        return { meta: { changes: 0 } };
      }
      this.db.items.splice(itemIndex, 1);
      return { meta: { changes: 1 } };
    }

    throw new Error(`FakeD1 未实现 run(): ${this.sql}`);
  }
}

function getLeafItems(items) {
  return items.filter((item) => !items.some((child) => child.renewedFromId === item.id));
}

test("遗漏超过 40 个周期时会标记待继续，并在后续批次追到当前周期", async () => {
  const db = new FakeD1Database([
    createItem({
      id: "old-source",
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      createdAt: "2025-01-06T00:00:00.000Z",
    }),
  ]);

  let result = await renewExpiredItems(db, "2026-07-18");
  assert.equal(result.renewalCount, 40);
  assert.equal(result.hasMore, true);

  let batchCount = 1;
  while (result.hasMore && batchCount < 10) {
    result = await renewExpiredItems(db, "2026-07-18");
    batchCount += 1;
  }

  const [leaf] = getLeafItems(db.items);
  assert.ok(batchCount > 1);
  assert.equal(result.hasMore, false);
  assert.ok(leaf.endDate >= "2026-07-18");
});

test("单个积压商品不会耗尽额度并阻塞其他商品续期", async () => {
  const db = new FakeD1Database([
    createItem({
      id: "very-old",
      name: "长期积压",
      startDate: "2025-01-06",
      endDate: "2025-01-10",
      createdAt: "2025-01-06T00:00:00.000Z",
    }),
    createItem({
      id: "recent",
      name: "近期到期",
      startDate: "2026-07-06",
      endDate: "2026-07-10",
      createdAt: "2026-07-06T00:00:00.000Z",
    }),
  ]);

  await renewExpiredItems(db, "2026-07-18");

  assert.ok(db.items.some((item) => item.renewedFromId === "very-old"));
  assert.ok(db.items.some((item) => item.renewedFromId === "recent"));
});

test("并发续期不会为同一来源创建重复子记录", async () => {
  const db = new FakeD1Database([
    createItem({
      id: "concurrent-source",
      startDate: "2026-06-29",
      endDate: "2026-07-03",
      createdAt: "2026-06-29T00:00:00.000Z",
    }),
  ]);

  await Promise.all([
    renewExpiredItems(db, "2026-07-18"),
    renewExpiredItems(db, "2026-07-18"),
  ]);

  for (const item of db.items) {
    const directChildren = db.items.filter((candidate) => candidate.renewedFromId === item.id);
    assert.ok(directChildren.length <= 1, `${item.id} 出现重复直接续期记录`);
  }
});

test("续期到达允许日期上限时返回明确错误且不写入异常记录", async () => {
  const db = new FakeD1Database([
    createItem({
      id: "max-date-source",
      startDate: "2100-12-27",
      endDate: "2100-12-31",
      createdAt: "2100-12-27T00:00:00.000Z",
    }),
  ]);

  await assert.rejects(
    renewExpiredItems(db, "2101-01-01"),
    /续期日期超出允许范围/,
  );
  assert.equal(db.items.length, 1);
});

test("GET 只读取商品，不再触发自动续期写入", async () => {
  const db = new FakeD1Database([
    createItem({
      id: "expired-source",
      startDate: "2025-01-06",
      endDate: "2025-01-10",
    }),
  ]);

  const response = await onRequestGet({
    request: new Request("https://example.test/api/items?view=active"),
    env: { DB: db },
  });

  assert.equal(response.status, 200);
  assert.equal(db.items.length, 1);
  assert.equal(db.items.some((item) => item.renewedFromId === "expired-source"), false);
});

test("独立续期接口执行写入并返回批次进度", async () => {
  const today = getTodayDateString();
  const db = new FakeD1Database([
    createItem({
      id: "renew-endpoint-source",
      startDate: addDays(today, -5),
      endDate: addDays(today, -1),
      excludeWeekends: false,
    }),
  ]);

  const response = await onRequestRenew({ env: { DB: db } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.ok(result.renewalCount > 0);
  assert.equal(result.hasMore, false);
  assert.ok(db.items.some((item) => item.renewedFromId === "renew-endpoint-source"));
});

test("已归档列表按 50 条分页并返回完整汇总", async () => {
  const archivedItems = Array.from({ length: 120 }, (_, index) => createItem({
    id: `archived-${String(index).padStart(3, "0")}`,
    name: `归档商品 ${index}`,
    startDate: "2020-01-01",
    endDate: "2020-01-05",
    autoRenew: false,
    createdAt: `2020-01-05T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
  }));
  const activeItem = createItem({
    id: "active-item",
    endDate: "2099-01-01",
    autoRenew: false,
  });
  const db = new FakeD1Database([...archivedItems, activeItem]);

  const response = await onRequestGet({
    request: new Request("https://example.test/api/items?view=archived&page=2"),
    env: { DB: db },
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.items.length, 50);
  assert.deepEqual(data.pagination, {
    page: 2,
    pageSize: 50,
    totalItems: 120,
    totalPages: 3,
  });
  assert.equal(data.summary.activeCount, 1);
  assert.equal(data.summary.archivedCount, 120);

  const overflowPageResponse = await onRequestGet({
    request: new Request("https://example.test/api/items?view=archived&page=99"),
    env: { DB: db },
  });
  const overflowPageData = await overflowPageResponse.json();
  assert.equal(overflowPageData.pagination.page, 3);
  assert.equal(overflowPageData.items.length, 20);
});

test("商品列表拒绝非法视图和页码", async () => {
  const db = new FakeD1Database([]);
  const invalidViewResponse = await onRequestGet({
    request: new Request("https://example.test/api/items?view=all"),
    env: { DB: db },
  });
  assert.equal(invalidViewResponse.status, 400);

  const invalidPageResponse = await onRequestGet({
    request: new Request("https://example.test/api/items?view=archived&page=0"),
    env: { DB: db },
  });
  assert.equal(invalidPageResponse.status, 400);
});

test("PATCH 可更新自动续期并按每日成本重新计算结束日期价格", async () => {
  const db = new FakeD1Database([createItem()]);
  const response = await onRequestPatch({
    params: { id: "item-1" },
    request: new Request("https://example.test/api/items/item-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endDate: "2026-07-13", autoRenew: false }),
    }),
    env: { DB: db },
  });

  assert.equal(response.status, 200);
  const { item } = await response.json();
  assert.equal(item.plannedDays, 6);
  assert.equal(item.price, 60);
  assert.equal(item.autoRenew, false);
});

test("PATCH 只切换自动续期时不会改动其他商品字段", async () => {
  const originalItem = createItem({ autoRenew: true });
  const db = new FakeD1Database([originalItem]);
  const response = await onRequestPatch({
    params: { id: "item-1" },
    request: new Request("https://example.test/api/items/item-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoRenew: false }),
    }),
    env: { DB: db },
  });

  assert.equal(response.status, 200);
  const { item } = await response.json();
  assert.equal(item.autoRenew, false);
  assert.equal(item.endDate, originalItem.endDate);
  assert.equal(item.price, originalItem.price);
});

test("PATCH 拒绝未知字段、越界日期和不存在的商品", async () => {
  const db = new FakeD1Database([createItem()]);

  const unknownFieldResponse = await onRequestPatch({
    params: { id: "item-1" },
    request: new Request("https://example.test/api/items/item-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "不允许修改" }),
    }),
    env: { DB: db },
  });
  assert.equal(unknownFieldResponse.status, 400);

  const invalidDateResponse = await onRequestPatch({
    params: { id: "item-1" },
    request: new Request("https://example.test/api/items/item-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endDate: "2026-07-05" }),
    }),
    env: { DB: db },
  });
  assert.equal(invalidDateResponse.status, 400);

  const missingResponse = await onRequestPatch({
    params: { id: "missing" },
    request: new Request("https://example.test/api/items/missing", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoRenew: false }),
    }),
    env: { DB: db },
  });
  assert.equal(missingResponse.status, 404);
});

test("DELETE 删除存在的商品，并对重复删除返回 404", async () => {
  const db = new FakeD1Database([createItem()]);
  const context = {
    params: { id: "item-1" },
    env: { DB: db },
  };

  const deletedResponse = await onRequestDelete(context);
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), { ok: true });

  const missingResponse = await onRequestDelete(context);
  assert.equal(missingResponse.status, 404);
});
