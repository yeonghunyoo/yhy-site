import { describe, expect, it } from "vitest";
import { groupSimilar, hamming } from "./dedup";

const flip = (hex: string, bits: number[]) => {
  let n = BigInt(`0x${hex}`);
  for (const b of bits) n ^= 1n << BigInt(b);
  return n.toString(16).padStart(16, "0");
};

describe("hamming", () => {
  it("같은 해시는 0, 비트 수만큼 증가", () => {
    expect(hamming("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0f")).toBe(0);
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming("0000000000000000", flip("0000000000000000", [0, 17, 63]))).toBe(3);
  });
});

describe("groupSimilar", () => {
  const base = "9f3a5c7e1b2d4f60";
  it("거리 3 이내는 묶고, 먼 것은 따로", () => {
    const items = [
      { id: "a", h: base },
      { id: "b", h: flip(base, [1, 20, 40]) }, // 거리 3 → 같은 그룹
      { id: "c", h: flip(base, [2, 3, 4, 5, 6, 7, 8, 9]) }, // 거리 8 → 제외
      { id: "d", h: null },
    ];
    const groups = groupSimilar(items, (x) => x.h);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("비트가 4개 밴드에 하나씩 흩어져도(거리 3) 놓치지 않는다", () => {
    const items = [{ h: base }, { h: flip(base, [5, 21, 37]) }];
    expect(groupSimilar(items, (x) => x.h)).toHaveLength(1);
  });

  it("연쇄적으로 가까운 사진은 한 그룹 (a~b, b~c)", () => {
    const b = flip(base, [0, 1]);
    const c = flip(b, [30, 31]);
    const groups = groupSimilar([{ h: base }, { h: b }, { h: c }], (x) => x.h);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
});
