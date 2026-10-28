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

/** 폼 제출 뒤 원래 화면으로 돌려보낸다(303). */
export function backTo(path: string, flash: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${path}?flash=${encodeURIComponent(flash)}` } });
}
