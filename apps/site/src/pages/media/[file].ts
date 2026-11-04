import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

// RAG 문서 이미지 — R2 media/{hash}.{ext}를 같은 출처로 내보낸다(CSP img-src 'self' 유지). 설계: docs/06-ingest.md "6. 이미지 서빙".
// 이름이 내용 해시 형식이 아니면 404라 sources/(원본) 같은 다른 키에는 닿지 않는다.
export const prerender = false;

const NAME = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
const TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

interface R2Like {
  get(key: string): Promise<{ body: ReadableStream; httpEtag: string } | null>;
}

const notFound = () => new Response('Not Found', { status: 404 });

export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? '';
  const bucket = (env as unknown as { R2?: R2Like }).R2;
  if (!NAME.test(file) || !bucket) return notFound();
  const object = await bucket.get(`media/${file}`);
  if (!object) return notFound();
  return new Response(object.body, {
    headers: {
      'Content-Type': TYPES[file.split('.')[1]],
      // 이름이 내용 해시라 내용이 바뀌면 이름도 바뀐다 — 영구 캐시
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
