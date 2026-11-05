import { createDb } from "@nuvo/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { enabledProviders } from "./auth";
import { collectGarbage } from "./lib/gc";
import { devOutbox } from "./lib/mail";
import { requireUser, withContext, withSession, type AppEnv } from "./context";
import { setManualSubscription } from "./lib/subscription";
import { assetRoutes } from "./routes/assets";
import { media } from "./routes/media";
import { deletionRequestRoutes } from "./routes/deletion-requests";
import { reportRoutes } from "./routes/reports";
import { inviteRoutes, spaceRoutes } from "./routes/spaces";
import { uploads } from "./routes/uploads";

export { SpaceHub } from "./hub";

const api = new Hono<AppEnv>()
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true, service: "nuvo" }))
  .get("/auth-config", (c) => c.json(enabledProviders(c.env)))
  /** 공개 설정: 지원 연락처 (스토어 UGC 요건 — 화면 어디서나 보이게) */
  .get("/config", (c) =>
    c.json({
      supportEmail: c.env.SUPPORT_EMAIL || null,
      // 웹은 결제 대신 앱 설치를 안내한다 (docs/decisions.md D-010)
      appStoreUrl: c.env.APP_STORE_URL || null,
      playStoreUrl: c.env.PLAY_STORE_URL || null,
    }),
  )
  /** 로컬 개발 전용: 보낸 메일 보관함 (인증·재설정 링크 확인용). 운영에서는 404 */
  .get("/dev/outbox", (c) => {
    if (c.env.ENVIRONMENT === "production") return c.json({ error: "not found" }, 404);
    return c.json({ mails: devOutbox(c.req.query("to")) });
  })
  .use(withContext)
  .on(["GET", "POST"], "/auth/*", (c) => c.var.auth.handler(c.req.raw))
  /** 로그인 없이: 계정 삭제 요청 (Google Play 요건, docs/work-plan.md ⑦) */
  .route("/account-deletion-requests", deletionRequestRoutes)
  .use(withSession)
  /** 로컬 개발 전용: 내 계정의 수동 구독 켜기/끄기 (스모크·E2E용). 운영에서는 404 */
  .post("/dev/subscribe", async (c) => {
    if (c.env.ENVIRONMENT === "production") return c.json({ error: "not found" }, 404);
    const user = requireUser(c);
    const on = c.req.query("off") == null;
    await setManualSubscription(c.var.db, user.id, on, "dev");
    return c.json({ ok: true, active: on });
  })
  .get("/health/db", async (c) => {
    const [row] = await c.var.db.execute<{ now: string }>(sql`select now() as now`);
    return c.json({ ok: true, now: row?.now });
  })
  .route("/uploads", uploads)
  .route("/spaces", spaceRoutes)
  .route("/spaces", reportRoutes)
  .route("/invites", inviteRoutes)
  .route("/", assetRoutes);

api.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "잠시 후 다시 시도해 주세요" }, 500);
});

const app = new Hono<{ Bindings: Env }>();
// Worker가 직접 답하는 /api·/m 응답은 검색에 내보내지 않는다 (docs/mvp.md "검색 노출"). 정적 화면은 public/_headers
app.use("*", async (c, next) => {
  await next();
  // WebSocket 업그레이드(101)와 헤더를 바꿀 수 없는 응답은 건너뛴다
  if (c.res.status === 101) return;
  try {
    c.res.headers.set("x-robots-tag", "noindex, nofollow");
  } catch {
    /* immutable headers */
  }
});
app.route("/m", media);
app.route("/", api);

/** 프론트에서 hono/client로 사용할 API 타입 */
export type AppType = typeof api;

export default {
  fetch: app.fetch,
  /** cron: R2 정리 대기열 처리 */
  async scheduled(_event, env, ctx) {
    const { db, close } = createDb(env.HYPERDRIVE.connectionString);
    ctx.waitUntil(
      (async () => {
        try {
          let total = 0;
          for (let i = 0; i < 10; i++) {
            const { processed, deleted } = await collectGarbage(db, env.MEDIA, undefined, 200);
            total += deleted;
            if (processed < 200) break;
          }
          if (total) console.log(`gc: R2 객체 ${total}건 정리`);
        } finally {
          await close();
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
