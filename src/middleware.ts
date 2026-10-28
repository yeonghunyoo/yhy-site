import { defineMiddleware } from 'astro:middleware';
import { getAuth, isAdmin } from './lib/server/auth';
import { report5xx } from './lib/server/errors';

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/') || p.startsWith('/api/admin/');

export const onRequest = defineMiddleware(async (context, next) => {
  // 정적 페이지는 빌드 때 렌더된다 — 세션·가드는 동적 요청에서만.
  if (context.isPrerendered) return next();

  const { pathname } = context.url;
  context.locals.user = null;
  context.locals.session = null;

  try {
    if (isAdminPath(pathname) || pathname.startsWith('/api/')) {
      const result = await getAuth().api.getSession({ headers: context.request.headers });
      context.locals.user = result?.user ?? null;
      context.locals.session = result?.session ?? null;
    }

    // 비관리자에게는 어드민의 존재 자체를 숨긴다(401/403이 아니라 404).
    if (isAdminPath(pathname) && !isAdmin(context.locals.user)) {
      return pathname.startsWith('/api/')
        ? Response.json({ error: 'not_found' }, { status: 404 })
        : context.rewrite('/404');
    }

    const response = await next();
    if (response.status >= 500) report5xx(pathname, `HTTP ${response.status}`);
    return response;
  } catch (error) {
    report5xx(pathname, error instanceof Error ? error.message : String(error));
    return pathname.startsWith('/api/')
      ? Response.json({ error: 'internal' }, { status: 500 })
      : new Response('Internal Server Error', { status: 500 });
  }
});
