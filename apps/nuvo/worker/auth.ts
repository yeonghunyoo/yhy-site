import { libraries, schema, type Db } from "@nuvo/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

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
    /** 이메일/비밀번호는 개발·테스트용. 운영에서는 끈다. */
    password: env.ENVIRONMENT !== "production",
  };
}

export function createAuth(env: Env, db: Db, origin: string) {
  const enabled = enabledProviders(env);
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
  if (enabled.google) socialProviders.google = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  if (enabled.kakao) socialProviders.kakao = { clientId: env.KAKAO_CLIENT_ID, clientSecret: env.KAKAO_CLIENT_SECRET };

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || origin,
    basePath: "/api/auth",
    trustedOrigins: [env.BETTER_AUTH_URL || origin],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    emailAndPassword: { enabled: enabled.password, minPasswordLength: 8 },
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
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
