// Better Auth CLI 전용 설정 — 인증 테이블 Drizzle 스키마를 생성할 때만 쓴다.
// 실제 런타임 설정은 src/lib/auth.ts. 테이블에 영향을 주는 옵션(플러그인·추가 필드)은 둘을 같게 유지한다.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: 'sqlite' }),
  user: {
    additionalFields: {
      isBlocked: { type: 'boolean', defaultValue: false, input: false },
    },
  },
  plugins: [magicLink({ sendMagicLink: async () => {} })],
});
