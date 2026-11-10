import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// 블로그 사진 — R2 blog/img/{내용 해시}.webp(docs/08-blog.md "사이트"). 이름이 내용 해시라 영구 캐시.
// src/worker.ts가 엣지(Cache API)에 담아 R2 읽기는 데이터센터마다 처음 한 번
export const prerender = false;

const NAME = /^[0-9a-f]{32}\.webp$/;

interface R2Like {
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null>;
}

export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? '';
  const bucket = (env as unknown as { R2?: R2Like }).R2;
  if (!NAME.test(file) || !bucket) return new Response('Not Found', { status: 404 });
  const object = await bucket.get(`blog/img/${file}`);
  if (!object) return new Response('Not Found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
