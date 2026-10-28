import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n';
import { getDb } from './db';
import { user } from '../../db/schema';
import { sendMail } from './mail';
import { magicLinkEmail } from './templates';
import { clientIp, hit } from './ratelimit';
import { kstDate } from './dates';

/** 매직링크 URL의 callbackURL(`/en/...`)에서 메일 언어를 고른다. */
function localeFromMagicLink(url: string): Locale {
  const callback = new URL(url).searchParams.get('callbackURL') ?? '';
  const first = callback.split('/')[1];
  return isLocale(first) ? first : 'ko';
}

function createAuth() {
  const db = getDb();
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: 'select_account' as const } }
      : {};

  return betterAuth({
    appName: env.SITE_NAME,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    // 만료 30일, 하루 지나면 활동 시 갱신
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // 테이블에 영향을 주는 옵션은 scripts/auth-schema.config.ts와 같게 유지한다.
    user: {
      additionalFields: {
        isBlocked: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    socialProviders: google,
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    databaseHooks: {
      session: {
        create: {
          // 차단된 사용자는 새 세션을 만들 수 없다.
          before: async (session) => {
            const row = await db.select({ isBlocked: user.isBlocked }).from(user).where(eq(user.id, session.userId)).get();
            if (row?.isBlocked) return false;
          },
          // 어드민 지표용 일별 로그인 수(KST). 세션은 로그아웃·만료로 지워지므로 따로 센다.
          after: async () => {
            const key = `stats:login:${kstDate(new Date())}`;
            const n = Number((await env.KV.get(key)) ?? 0);
            await env.KV.put(key, String(n + 1), { expirationTtl: 60 * 60 * 24 * 31 });
          },
        },
      },
    },
    hooks: {
      // 매직링크 요청: IP당 10분 3회, 같은 이메일 10분 1회
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/magic-link' || !ctx.request) return;
        const email = String(ctx.body?.email ?? '').trim().toLowerCase();
        const allowed =
          (await hit(`ml:ip:${clientIp(ctx.request)}`, 3, 600)) && (await hit(`ml:email:${email}`, 1, 600));
        if (!allowed) throw new APIError('TOO_MANY_REQUESTS', { message: 'rate_limited' });
      }),
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        sendMagicLink: async ({ email, url }) => {
          const result = await sendMail({ to: email, ...magicLinkEmail(localeFromMagicLink(url), url) });
          if (!result.ok) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'mail_failed' });
        },
      }),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return (instance ??= createAuth());
}

export type SessionUser = ReturnType<typeof createAuth>['$Infer']['Session']['user'];

export function isAdmin(u: { email: string; emailVerified: boolean } | null | undefined): boolean {
  if (!u?.emailVerified) return false;
  const admins = (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(u.email.toLowerCase());
}
