import type { APIRoute } from 'astro';
import { isLocale } from '../../../../i18n';
import { adminGuard } from '../../../../lib/server/admin';
import { retrieve } from '../../../../lib/server/rag';

export const prerender = false;

/** 검색 전용(관리자) — 질문 파이프라인 3~7단계 결과와 단계별 점수. 튜닝용. `?q=질문&locale=ko` */
export const GET: APIRoute = async (context) => {
  const denied = adminGuard(context);
  if (denied) return denied;
  const q = context.url.searchParams.get('q')?.trim();
  const locale = context.url.searchParams.get('locale');
  if (!q) return Response.json({ error: 'invalid' }, { status: 400 });
  const { trace } = await retrieve(q, isLocale(locale) ? locale : 'ko');
  return Response.json(trace);
};
