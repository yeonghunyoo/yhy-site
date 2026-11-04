import { env } from 'cloudflare:workers';
import type { APIContext } from 'astro';
import { isAdmin } from './auth';

/**
 * /api/admin/* 핸들러 공통 검사 — 미들웨어에 더해 핸들러에서도 관리자 세션을 확인하고,
 * 폼 POST가 같은 출처에서 왔는지 본다.
 */
export function adminGuard({ locals, request }: APIContext): Response | null {
  if (!isAdmin(locals.user)) return Response.json({ error: 'not_found' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin && origin !== env.BETTER_AUTH_URL) {
    return Response.json({ error: 'bad_origin' }, { status: 403 });
  }
  return null;
}

export const RAG_SYNC_PATH = '/api/admin/rag/reindex';

/**
 * 벡터 갱신 자동화(`pnpm rag:sync:remote`, docs/05-06-chat-rag.md 넣기 7)용 토큰 검사.
 * 이 경로의 POST만, 운영 비밀 RAG_SYNC_TOKEN과 Bearer가 같을 때만 통과한다(비밀이 없거나 32자 미만이면 항상 거절).
 */
export function hasRagSyncToken(request: Request, pathname: string): boolean {
  if (pathname !== RAG_SYNC_PATH || request.method !== 'POST') return false;
  const expected = (env as unknown as Record<string, string | undefined>).RAG_SYNC_TOKEN ?? '';
  const header = request.headers.get('authorization') ?? '';
  if (expected.length < 32 || !header.startsWith('Bearer ')) return false;
  const a = new TextEncoder().encode(header.slice(7));
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** 폼 제출 뒤 원래 화면으로 돌려보낸다(303). */
export function backTo(path: string, flash: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${path}?flash=${encodeURIComponent(flash)}` } });
}
