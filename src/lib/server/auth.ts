import { env } from 'cloudflare:workers';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n';
import { getDb } from './db';
import { user } from '../../db/schema';
import { sendMail } from './mail';
import { magicLinkEmail } from './templates';
import { clientIp, hit } from './ratelimit';
import { kstDate } from './dates';
import { killed } from './budget';
import { maskEmail, notify } from './notify';

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
      before: createAuthMiddleware(async (ctx) => {
        // emailOTP 플러그인은 코드 입력(/sign-in/email-otp)만 쓴다. 코드 단독 발송·확인·이메일 변경 등은 막아
        // 코드 메일이 매직링크 요청(레이트리밋 적용) 한 경로로만 나가게 한다(docs/02-auth.md).
        if (ctx.path.includes('email-otp') && ctx.path !== '/sign-in/email-otp') throw new APIError('NOT_FOUND');
        if (!ctx.request) return;
        // 인증 코드 입력: 코드마다 3번(allowedAttempts)과 별개로 IP당 10분 10회 — 6자리 대입 방지
        if (ctx.path === '/sign-in/email-otp') {
          if (!(await hit(`otp:ip:${clientIp(ctx.request)}`, 10, 600))) throw new APIError('TOO_MANY_REQUESTS', { message: 'rate_limited' });
          return;
        }
        // 매직링크 요청: IP당 10분 3회, 같은 이메일 10분 1회
        if (ctx.path !== '/sign-in/magic-link') return;
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
          // 긴급 스위치(KILL_LOGIN_MAIL=1)면 메일을 만들지도 않는다 — 시트에는 "요청이 많아요"(docs/guides/cost-guard.md)
          if (killed('KILL_LOGIN_MAIL')) throw new APIError('TOO_MANY_REQUESTS', { message: 'rate_limited' });
          // 같은 메일에 6자리 코드를 함께 넣는다 — 링크가 인앱 브라우저·다른 기기에서 열려도 요청한 브라우저에서 코드로 로그인
          const otp = await getAuth().api.createVerificationOTP({ body: { email, type: 'sign-in' } });
          const result = await sendMail({ to: email, ...magicLinkEmail(localeFromMagicLink(url), url, otp) });
          // 사이트 전체 메일 상한에 닿았다 — Resend 실패가 아니므로 알림 없이 "요청이 많아요"
          if (!result.ok && result.error === 'mail_budget') throw new APIError('TOO_MANY_REQUESTS', { message: 'rate_limited' });
          if (!result.ok) {
            // 발송 실패(도메인 미인증·키 오류 등)는 Resend 사유를 로그 + Telegram으로 남기고, 같은 이메일 카운터는
            // 돌려줘 바로 다시 시도할 수 있게 한다(IP 카운터는 그대로 — 남용 방지).
            console.error(`[mail] magic link failed: ${result.error}`);
            notify(`⚠️ Resend 실패\n로그인 링크 ${maskEmail(email)}\n${result.error.slice(0, 120)}`);
            await env.KV.delete(`ml:email:${email.trim().toLowerCase()}`);
            throw new APIError('INTERNAL_SERVER_ERROR', { message: 'mail_failed' });
          }
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: 60 * 15,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        // 코드는 sendMagicLink가 링크 메일에 함께 넣는다. 단독 발송 엔드포인트는 hooks.before가 막으므로 여기는 오지 않는다.
        sendVerificationOTP: async () => {
          throw new APIError('NOT_FOUND');
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
