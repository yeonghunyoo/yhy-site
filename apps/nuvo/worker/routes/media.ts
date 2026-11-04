import { Hono } from "hono";
import { mediaCacheKey } from "../lib/gc";
import { r2Key, verifyMediaSig } from "../lib/sign";

/**
 * GET /m/:sha256/:variant?e=&s=[&dl=파일명]
 * 서명(HMAC)과 만료만 검증 — DB 조회 없음. Cloudflare 캐시 → R2 순서로 서빙.
 */
export const media = new Hono<{ Bindings: Env }>().get("/:sha/:variant", async (c) => {
  const { sha, variant } = c.req.param();
  if (!/^[0-9a-f]{64}$/.test(sha) || !["o", "512", "2048"].includes(variant)) return c.notFound();

  const ok = await verifyMediaSig(c.env.MEDIA_SIGNING_KEY, sha, variant, Number(c.req.query("e")), c.req.query("s") ?? "");
  if (!ok) return c.text("링크가 만료되었거나 올바르지 않아요", 403);

  const key = variant === "o" ? r2Key.original(sha) : r2Key.thumb(sha, variant);
  const cache = caches.default;
  const cacheKey = mediaCacheKey(key);

  let res = await cache.match(cacheKey);
  if (!res) {
    const obj = await c.env.MEDIA.get(key);
    if (!obj) return c.notFound();
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    // 내용 주소(sha256) 키라 내용이 바뀌지 않는다. 다만 삭제된 사진이 엣지에 오래 남지 않게 하루만 둔다
    headers.set("cache-control", "public, max-age=86400");
    res = new Response(obj.body, { headers });
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  }

  const out = new Response(res.body, res);
  // 브라우저/중간 프록시에는 private (공용 캐시에 남지 않게)
  out.headers.set("cache-control", "private, max-age=21600");
  out.headers.set("x-content-type-options", "nosniff");
  // 혹시 이미지가 아닌 내용이 섞여도 스크립트가 실행되지 않게
  out.headers.set("content-security-policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  const dl = c.req.query("dl");
  if (dl) out.headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(dl)}`);
  return out;
});
