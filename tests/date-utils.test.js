import test from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  addUsageDays,
  getEndDateFromUsageDays,
  getInclusiveDays,
  getNaturalWeekRange,
  getTodayDateString,
  getUsageDays,
  isValidDateString,
} from "../date-utils.js";
import { createRenewalItem } from "../renewal-utils.js";
import { readJsonObject } from "../api-utils.js";
import { normalizeNewItemPayload, onRequestPost } from "../functions/api/items.js";

test("严格拒绝不存在的日历日期", () => {
  assert.equal(isValidDateString("2026-02-28"), true);
  assert.equal(isValidDateString("2024-02-29"), true);
  assert.equal(isValidDateString("2026-02-29"), false);
  assert.equal(isValidDateString("2026-02-31"), false);
  assert.equal(isValidDateString("2026-13-01"), false);
});

test("日期计算不受夏令时影响并包含首尾", () => {
  assert.equal(getInclusiveDays("2026-03-07", "2026-03-09"), 3);
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-02-29", 1), "2024-03-01");
});

test("工作日计算正确跳过周末", () => {
  assert.equal(getUsageDays("2026-07-13", "2026-07-19", true), 5);
  assert.equal(getUsageDays("2026-07-18", "2026-07-19", true), 0);
  assert.equal(getEndDateFromUsageDays("2026-07-17", 2, true), "2026-07-20");
  assert.equal(getEndDateFromUsageDays("2026-07-18", 1, true), "2026-07-20");
  assert.equal(addUsageDays("2026-07-17", 1, true), "2026-07-20");
  assert.equal(addUsageDays("2026-07-20", -1, true), "2026-07-17");
});

test("每日固定成本按上海时区和自然周计算", () => {
  assert.equal(getTodayDateString("Asia/Shanghai", new Date("2026-07-17T16:30:00Z")), "2026-07-18");
  assert.deepEqual(getNaturalWeekRange("2026-07-19", false), {
    startDate: "2026-07-13",
    endDate: "2026-07-19",
  });
  assert.deepEqual(getNaturalWeekRange("2026-07-19", true), {
    startDate: "2026-07-13",
    endDate: "2026-07-17",
  });
});

test("续期可以连续生成多个无间断周期", () => {
  const source = {
    id: "source",
    name: "工作日成本",
    price: 50,
    costMode: "daily",
    dailyCost: 10,
    startDate: "2026-06-29",
    endDate: "2026-07-03",
    endMode: "duration",
    plannedDays: 5,
    excludeWeekends: true,
    autoRenew: true,
  };

  const first = createRenewalItem(source, "first", "2026-07-04T00:00:00.000Z");
  const second = createRenewalItem(first, "second", "2026-07-11T00:00:00.000Z");
  const third = createRenewalItem(second, "third", "2026-07-18T00:00:00.000Z");

  assert.deepEqual([first.startDate, first.endDate], ["2026-07-06", "2026-07-10"]);
  assert.deepEqual([second.startDate, second.endDate], ["2026-07-13", "2026-07-17"]);
  assert.deepEqual([third.startDate, third.endDate], ["2026-07-20", "2026-07-24"]);
  assert.equal(third.price, 50);
  assert.equal(third.renewedFromId, "second");
});

test("新增 API 规范化每日成本并拒绝异常类型和跨度", () => {
  const dailyItem = normalizeNewItemPayload({
    name: "午餐",
    costMode: "daily",
    dailyCost: 20,
    startDate: "2026-07-18",
    excludeWeekends: true,
    autoRenew: false,
  });

  assert.deepEqual([dailyItem.startDate, dailyItem.endDate], ["2026-07-13", "2026-07-17"]);
  assert.equal(dailyItem.price, 100);
  assert.throws(
    () => normalizeNewItemPayload({ ...dailyItem, startDate: "2026-02-31" }),
    /有效使用日期/,
  );
  assert.throws(
    () => normalizeNewItemPayload({ ...dailyItem, excludeWeekends: "false" }),
    /布尔值/,
  );
  assert.throws(
    () => normalizeNewItemPayload({
      name: "过长周期",
      costMode: "total",
      price: 10,
      startDate: "2026-01-01",
      endMode: "duration",
      plannedDays: 36601,
      excludeWeekends: false,
      autoRenew: false,
    }),
    /预计使用天数/,
  );
});

test("API 请求体只接受受限大小的 JSON 对象", async () => {
  const payload = await readJsonObject(new Request("https://example.test/api/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "测试" }),
  }));

  assert.deepEqual(payload, { name: "测试" });
  await assert.rejects(
    readJsonObject(new Request("https://example.test/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    })),
    /请求数据格式不正确/,
  );
  await assert.rejects(
    readJsonObject(new Request("https://example.test/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(17000) }),
    })),
    /请求数据过大/,
  );
});

test("新增接口把畸形请求稳定转换为 400 响应", async () => {
  const nullResponse = await onRequestPost({
    request: new Request("https://example.test/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "null",
    }),
    env: { DB: null },
  });
  assert.equal(nullResponse.status, 400);
  assert.deepEqual(await nullResponse.json(), { error: "请求数据格式不正确" });

  const booleanResponse = await onRequestPost({
    request: new Request("https://example.test/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "测试",
        costMode: "total",
        price: 10,
        startDate: "2026-07-18",
        endMode: "date",
        endDate: "2026-07-18",
        excludeWeekends: "false",
        autoRenew: false,
      }),
    }),
    env: { DB: null },
  });
  assert.equal(booleanResponse.status, 400);
  assert.match((await booleanResponse.json()).error, /布尔值/);
});
