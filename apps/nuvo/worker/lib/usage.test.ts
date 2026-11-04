import { createDb } from "@nuvo/db";
import { createCountBudget } from "@yhy/cf-kit/budget";
import { afterAll, describe, expect, it } from "vitest";
import { pgCounterStore } from "./usage";

// 로컬 Postgres가 있을 때만: DATABASE_URL=postgres://nuvo:nuvo@localhost:5432/nuvo pnpm nuvo test
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("pgCounterStore (Postgres)", () => {
  const { db, close } = createDb(url ?? "");
  const store = pgCounterStore(db);
  const key = `test:${crypto.randomUUID()}`;
  afterAll(close);

  it("동시에 올려도 정확히 센다", async () => {
    await Promise.all(Array.from({ length: 10 }, () => store.increment([{ key, ttlSeconds: 60 }])));
    expect(await store.get([key, `${key}:none`])).toEqual([10, 0]);
  });

  it("기한이 지난 행은 0으로 보고, 다시 올리면 1부터", async () => {
    const old = `${key}:old`;
    await store.increment([{ key: old, ttlSeconds: -1 }]);
    expect(await store.get([old])).toEqual([0]);
    await store.increment([{ key: old, ttlSeconds: 60 }]);
    expect(await store.get([old])).toEqual([1]);
  });

  it("createCountBudget과 같이: 일 상한에서 막는다", async () => {
    const b = createCountBudget({ name: `t${Date.now()}`, caps: { day: 2, month: 10 }, store, label: "메일", unit: "통" });
    await b.record();
    expect(await b.allowed()).toBe(true);
    await b.record();
    expect(await b.allowed()).toBe(false);
  });
});
