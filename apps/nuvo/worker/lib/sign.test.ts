import { describe, expect, it } from "vitest";
import { mediaExpiry, signMediaUrl, signReceipt, verifyMediaSig, verifyReceipt } from "./sign";

const SHA = "a".repeat(64);
const parse = (url: string) => {
  const u = new URL(url, "http://x");
  return { e: Number(u.searchParams.get("e")), s: u.searchParams.get("s")! };
};

describe("미디어 서명 URL", () => {
  it("서명이 맞으면 통과, 변형·키가 다르면 실패", async () => {
    const { e, s } = parse(await signMediaUrl("k1", SHA, "512"));
    expect(await verifyMediaSig("k1", SHA, "512", e, s)).toBe(true);
    expect(await verifyMediaSig("k1", SHA, "o", e, s)).toBe(false);
    expect(await verifyMediaSig("k2", SHA, "512", e, s)).toBe(false);
  });

  it("만료된 서명은 실패", async () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const { s } = parse(await signMediaUrl("k1", SHA, "512", past));
    expect(await verifyMediaSig("k1", SHA, "512", past, s)).toBe(false);
  });

  it("만료 시각은 6시간 단위라 같은 구간에서 URL이 같다 (브라우저 캐시 적중)", () => {
    const base = 6 * 3600 * 1000;
    expect(mediaExpiry(base + 10)).toBe(mediaExpiry(base + 3600));
    expect(mediaExpiry(base + 10) - (base + 10)).toBeGreaterThan(6 * 3600 - 20);
  });
});

describe("업로드 영수증", () => {
  it("올린 사람·해시가 같아야 통과", async () => {
    const r = await signReceipt("k", "user1", SHA);
    expect(await verifyReceipt("k", "user1", SHA, r)).toBe(true);
    expect(await verifyReceipt("k", "user2", SHA, r)).toBe(false);
    expect(await verifyReceipt("k", "user1", "b".repeat(64), r)).toBe(false);
  });
});
