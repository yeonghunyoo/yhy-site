import { env } from 'cloudflare:workers';
import { botReason, sameOrigin, WindowLimiter } from '@yhy/cf-kit/guard';
import { allowedMethods, botChecked } from '../usage-math';
import { hashIp } from './chat';
import { notify } from './notify';
import { clientIp } from './ratelimit';

// 비정상 요청 방어 — docs/guides/cost-guard.md "2. 비정상 요청 방어". /api/*, /auth/*, /media/*의 동적 요청에만.
// 막힌 요청은 AI·D1·메일을 쓰지 않는다. KV는 차단 목록 읽기 1회, 차단할 때만 쓰기 1회.

const MINUTE = 60_000;
const BLOCK_SECONDS = 600;
const api = new WindowLimiter(60, MINUTE);
const media = new WindowLimiter(120, MINUTE);
// 같은 isolate가 차단을 이미 기록했으면 다시 쓰지 않는다(KV 쓰기 절약)
const blockedHere = new Map<string, number>();
let lastAlert = 0;
let lastBotAlert = 0;

const MAX_BODY = 16 * 1024;
const MAX_BODY_ADMIN = 64 * 1024;

const json = (status: number, error: string, headers: Record<string, string> = {}) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

export const guarded = (pathname: string) => pathname.startsWith('/api/') || pathname.startsWith('/auth/') || pathname.startsWith('/media/');

/** 통과면 null, 막으면 응답 */
export async function guardRequest(request: Request, url: URL): Promise<Response | null> {
  const { pathname } = url;
  const method = request.method.toUpperCase();
  const ip = await hashIp(clientIp(request), env.BETTER_AUTH_SECRET ?? '');

  // 1. 차단 목록(최근 위반이 반복된 IP)
  const until = blockedHere.get(ip);
  if (until && until > Date.now()) return json(429, 'blocked', { 'Retry-After': String(BLOCK_SECONDS) });
  if (method !== 'GET' || !pathname.startsWith('/media/')) {
    if (await env.KV.get(`block:${ip}`)) return json(429, 'blocked', { 'Retry-After': String(BLOCK_SECONDS) });
  }

  // 2. 순간 제한(IP별 분당 60, 이미지 120). 한 창에서 3번 넘으면 10분 차단 + 알림(시간당 1회)
  const limiter = pathname.startsWith('/media/') ? media : api;
  const { allowed, violations } = limiter.check(ip);
  if (!allowed) {
    if (violations >= 3 && !(blockedHere.get(ip)! > Date.now())) {
      blockedHere.set(ip, Date.now() + BLOCK_SECONDS * 1000);
      await env.KV.put(`block:${ip}`, '1', { expirationTtl: BLOCK_SECONDS });
      if (Date.now() - lastAlert > 60 * MINUTE) {
        lastAlert = Date.now();
        notify(`🚧 요청 폭주 차단: IP ${ip.slice(0, 6)}… ${pathname} (10분)`);
      }
    }
    return json(429, 'rate_limited', { 'Retry-After': '60' });
  }

  // 3. 메서드
  const methods = allowedMethods(pathname);
  if (!methods.includes(method) && !(method === 'HEAD' && methods.includes('GET'))) {
    return json(405, 'method_not_allowed', { Allow: methods.join(', ') });
  }

  const changes = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (!changes) return null;

  // 4. 본문 크기
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > (pathname.startsWith('/api/admin/') ? MAX_BODY_ADMIN : MAX_BODY)) return json(413, 'too_large');

  // 5·6. /api/*: 같은 출처만, JSON API는 JSON만(관리자 폼은 urlencoded). /auth/*는 Better Auth가 확인한다
  if (pathname.startsWith('/api/')) {
    if (!sameOrigin(url.origin, request.headers.get('origin'), request.headers.get('referer'))) return json(403, 'forbidden_origin');
    const type = (request.headers.get('content-type') ?? '').toLowerCase();
    if (!pathname.startsWith('/api/admin/') && length > 0 && !type.startsWith('application/json')) return json(415, 'unsupported_media_type');
  }

  // 7. 봇 신호 — 로그인 없이 열린 레터·챗만(관리자 API·/auth/*는 제외)
  if (botChecked(method, pathname)) {
    const reason = botReason(request.headers);
    if (reason) {
      console.log(`[guard] bot ${reason} ${pathname}`);
      if (Date.now() - lastBotAlert > 60 * MINUTE) {
        lastBotAlert = Date.now();
        notify(`🤖 봇 차단: ${pathname} (${reason}) — 이 isolate에서 시간당 1번만 알림`);
      }
      return json(403, 'bot');
    }
  }
  return null;
}
