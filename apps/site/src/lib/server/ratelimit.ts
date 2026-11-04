import { env } from 'cloudflare:workers';

/**
 * KV 고정 창 카운터. 허용이면 true(그리고 1 증가), 초과면 false.
 * KV는 원자적이지 않아 동시 요청에서 한두 번 더 통과할 수 있다 — 남용 방지 용도로는 충분.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const count = Number((await env.KV.get(key)) ?? 0);
  if (count >= limit) return false;
  await env.KV.put(key, String(count + 1), { expirationTtl: Math.max(60, windowSeconds) });
  return true;
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'local';
}
