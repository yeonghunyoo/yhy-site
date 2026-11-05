import { describe, expect, it } from "vitest";
import { matchesMime, sniffFamily } from "./sniff";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((ch) => ch.charCodeAt(0)) : [x])));

describe("sniffFamily", () => {
  it("이미지 형식을 앞부분 바이트로 알아본다", () => {
    expect(sniffFamily(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffFamily(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffFamily(bytes("GIF89a"))).toBe("gif");
    expect(sniffFamily(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("webp");
    expect(sniffFamily(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe("isobmff");
    expect(sniffFamily(bytes(0, 0, 0, 0x18, "ftypavif"))).toBe("isobmff");
  });

  it("이미지가 아니면 null", () => {
    expect(sniffFamily(bytes("<script>alert(1)"))).toBeNull();
    expect(sniffFamily(bytes(0, 0, 0, 0x18, "ftypisom"))).toBeNull(); // mp4 동영상은 아직 허용 안 함
    expect(sniffFamily(bytes(0xff, 0xd8))).toBeNull(); // 너무 짧음
  });
});

describe("matchesMime", () => {
  it("선언한 형식과 실제 바이트가 같은 계열이어야 한다", () => {
    expect(matchesMime(bytes(0xff, 0xd8, 0xff, 0xdb), "image/jpeg")).toBe(true);
    expect(matchesMime(bytes(0xff, 0xd8, 0xff, 0xdb), "image/png")).toBe(false);
    // HEIC·HEIF·AVIF는 같은 컨테이너
    expect(matchesMime(bytes(0, 0, 0, 0x18, "ftypmif1"), "image/heic")).toBe(true);
    expect(matchesMime(bytes(0, 0, 0, 0x18, "ftypheic"), "image/heif")).toBe(true);
    expect(matchesMime(bytes("<html>"), "text/html")).toBe(false);
  });
});
