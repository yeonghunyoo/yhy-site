/**
 * 업로드 원본의 앞부분 바이트(매직 넘버)로 실제 형식을 확인한다 (docs/media-security.md 1.2).
 * Content-Type 헤더만 믿으면 이미지가 아닌 내용을 이미지로 올릴 수 있다 — 미디어 응답의 CSP sandbox·nosniff가 실행은 막지만,
 * 저장소에 이미지가 아닌 것이 쌓이지 않게 입구에서도 막는다.
 */

/** 판별에 필요한 앞부분 길이 */
export const SNIFF_BYTES = 12;

type Family = "jpeg" | "png" | "gif" | "webp" | "isobmff";

/** ISO BMFF(HEIC·HEIF·AVIF)의 ftyp 주 브랜드 */
const BMFF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"]);

const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, end));

export function sniffFamily(b: Uint8Array): Family | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 6 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) return "gif";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp" && BMFF_BRANDS.has(ascii(b, 8, 12))) return "isobmff";
  return null;
}

const FAMILY_OF_MIME: Record<string, Family> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "isobmff",
  "image/heif": "isobmff",
  "image/avif": "isobmff",
};

/** 선언한 형식과 실제 바이트가 같은 계열인지. HEIC·HEIF·AVIF는 같은 컨테이너라 서로 바꿔 써도 통과 */
export function matchesMime(head: Uint8Array, mime: string): boolean {
  const want = FAMILY_OF_MIME[mime.toLowerCase()];
  return !!want && sniffFamily(head) === want;
}

/**
 * 스트림 앞부분을 읽어 형식을 확인하고, 읽은 부분을 다시 붙인 **길이가 정해진** 스트림을 돌려준다(R2 put은 길이를 알아야 한다).
 * 형식이 다르면 null (스트림은 취소). 본문 길이가 len과 다르면 돌려준 스트림이 오류를 낸다 → put 실패.
 */
export async function sniffAndRewrap(
  body: ReadableStream<Uint8Array>,
  len: number,
  mime: string,
): Promise<{ stream: ReadableStream<Uint8Array>; done: Promise<void> } | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < SNIFF_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  const head = new Uint8Array(Math.min(got, SNIFF_BYTES));
  let off = 0;
  for (const c of chunks) {
    if (off >= head.length) break;
    const part = c.subarray(0, head.length - off);
    head.set(part, off);
    off += part.length;
  }
  if (!matchesMime(head, mime)) {
    await reader.cancel().catch(() => {});
    return null;
  }
  const { readable, writable } = new FixedLengthStream(len);
  const writer = writable.getWriter();
  const done = (async () => {
    try {
      for (const c of chunks) await writer.write(c);
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => {});
      throw e;
    }
  })();
  // put이 먼저 실패해도 처리되지 않은 거부로 남지 않게
  done.catch(() => {});
  return { stream: readable, done };
}
