import { defineConfig } from 'drizzle-kit';

// SQL만 생성한다. 적용은 wrangler: `pnpm db:migrate:local` / `pnpm db:migrate:remote`
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
