import type { CloudAsset } from "@nuvo/shared";
import { describe, expect, it } from "vitest";
import type { LocalItem } from "./local/db";
import { buildRows, mergeItems } from "./timeline";

const day = (d: number, h = 12) => new Date(2026, 9, d, h).getTime();
const cloud = (id: string, sha: string, t: number) => ({ id, sha256: sha, takenAt: t, width: 10, height: 10 }) as CloudAsset;
const local = (key: string, sha: string, t: number) => ({ key, sha256: sha, takenAt: t, width: 10, height: 10 }) as LocalItem;

describe("mergeItems", () => {
  const c = [cloud("1", "aa", day(3)), cloud("2", "bb", day(2))];
  const l = [local("f:x.jpg", "aa", day(3)), local("f:y.jpg", "cc", day(1))];

  it("같은 sha256은 한 칸으로 합치고 최신순 정렬", () => {
    const m = mergeItems(c, l);
    expect(m.map((t) => t.sha256)).toEqual(["aa", "bb", "cc"]);
    expect(m[0]!.cloud && m[0]!.local).toBeTruthy();
  });

  it("'이 PC' 필터에서도 nuvo에 있는 사진은 합쳐진 상태로 (백업 여부 판단용)", () => {
    const m = mergeItems(c, l, "local");
    expect(m.map((t) => t.sha256)).toEqual(["aa", "cc"]);
    expect(m[0]!.cloud).toBeDefined();
    expect(m[1]!.cloud).toBeUndefined();
  });

  it("'nuvo' 필터는 클라우드 사진만", () => {
    expect(mergeItems(c, l, "cloud").map((t) => t.sha256)).toEqual(["aa", "bb"]);
  });
});

describe("buildRows", () => {
  it("날짜마다 헤더, 열 수만큼 행을 나눈다", () => {
    const items = mergeItems(
      [cloud("1", "a", day(5, 9)), cloud("2", "b", day(5, 10)), cloud("3", "c", day(5, 11)), cloud("4", "d", day(4))],
      [],
    );
    const rows = buildRows(items, 2);
    expect(rows.map((r) => r.type)).toEqual(["header", "row", "row", "header", "row"]);
    const second = rows[2]!;
    expect(second.type === "row" && second.items.length).toBe(1);
    expect(second.type === "row" && second.startIndex).toBe(2);
  });
});
