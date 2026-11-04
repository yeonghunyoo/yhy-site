import { libraries, schema, type Db } from "@nuvo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { mailEnabled, resetPasswordMail, sendMail, verifyEmailMail, type Mail } from "./lib/mail";
import { mailBudget } from "./lib/usage";

const GB = 1024 ** 3;

export function quotas(env: Env) {
  return {
    personal: Number(env.PERSONAL_QUOTA_GB || 5) * GB,
    space: Number(env.SPACE_QUOTA_GB || 20) * GB,
  };
}

export function enabledProviders(env: Env) {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    kakao: Boolean(env.KAKAO_CLIENT_ID && env.KAKAO_CLIENT_SECRET),
    /** 이메일/비밀번호: 운영에서는 인증 메일을 보낼 수 있을 때(Resend 설정)만 켠다. 로컬은 메일 보관함으로 항상 켬 */
    password: env.ENVIRONMENT !== "production" || mailEnabled(env),
  };
}

/** 메일 발송은 응답을 기다리게 하지 않는다 (가입 여부를 응답 시간으로 추측하지 못하게). 로컬은 테스트가 바로 읽도록 기다림 */
type Defer = (p: Promise<unknown>) => void;

export function createAuth(env: Env, db: Db, origin: string, defer: Defer) {
  const enabled = enabledProviders(env);
  const prod = env.ENVIRONMENT === "production";
  const socialProviders: Record<string, { clientId: string; clientSecret: string; prompt?: "select_account" }> = {};
  if (enabled.google)
    socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, prompt: "select_account" };
  if (enabled.kakao) socialProviders.kakao = { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET };

  const budget = mailBudget(env, db);
  const deliver = async (to: string, mail: Omit<Mail, "to">, kind: string) => {
    // 상한을 넘으면 cf-kit이 보내지 않고 mail_budget으로 실패한다. 재설정·재발송은 응답을 바꾸지 않는다(가입 여부를 드러내지 않게)
    const job = sendMail(env, { to, ...mail }, budget).then((r) => {
      if (!r.ok) console.error(`[mail] ${kind} 발송 실패: ${r.error}`);
    });
    if (prod) defer(job);
    else await job;
  };

  return betterAuth({
    appName: "nuvo",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || origin,
    basePath: "/api/auth",
    trustedOrigins: [env.BETTER_AUTH_URL || origin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: enabled.password,
      // 인증 메일을 확인해야 로그인된다 (남의 이메일로 먼저 가입해 두는 것 방지)
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => deliver(user.email, resetPasswordMail(user.name, url), "비밀번호 재설정"),
    },
    emailVerification: {
      sendOnSignUp: true,
      // 인증 전에 로그인하려 하면 메일을 다시 보낸다
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => deliver(user.email, verifyEmailMail(user.name, url), "이메일 인증"),
    },
    // 운영: 요청 수 제한을 DB에 저장 (Worker 인스턴스가 여러 개라 메모리 저장은 효과가 없다)
    rateLimit: {
      enabled: prod,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 600, max: 3 },
        "/request-password-reset": { window: 600, max: 3 },
        "/send-verification-email": { window: 600, max: 3 },
      },
    },
    // 메일 상한(worker/lib/usage.ts)에 닿았으면 가입을 미리 막는다 — 인증 메일 없이 계정만 생기지 않게
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || !mailEnabled(env)) return;
        if (!(await budget.allowed())) {
          throw new APIError("TOO_MANY_REQUESTS", { message: "메일 발송 한도에 닿았어요. 잠시 후 다시 시도해 주세요", code: "MAIL_BUDGET" });
        }
      }),
    },
    // Cloudflare가 넣어 주는 실제 접속 IP
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // 쿠키 캐시를 쓰지 않는다: 로그아웃·비밀번호 변경·탈퇴가 즉시 모든 기기에 적용되게 (요청마다 세션을 DB에서 확인)
      cookieCache: { enabled: false },
    },
    databaseHooks: {
      user: {
        create: {
          // 가입하면 개인 라이브러리를 만든다
          after: async (u) => {
            await db
              .insert(libraries)
              .values({ type: "personal", userId: u.id, quotaBytes: quotas(env).personal })
              .onConflictDoNothing();
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
