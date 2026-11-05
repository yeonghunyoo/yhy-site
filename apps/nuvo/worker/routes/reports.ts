import { assets, blobs, libraries, reports, spaceMembers, user as userTable } from "@nuvo/db";
import { REPORT_REASON_LABEL, ReportInput, ReportResolveInput, type SpaceReport } from "@nuvo/shared";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireUser, type AppEnv } from "../context";
import { isUuid, requireSpaceRole } from "../lib/access";
import { sendMail } from "../lib/mail";
import { mailBudget } from "../lib/usage";
import { signMediaUrl } from "../lib/sign";
import { validate } from "../lib/validate";

/** 한 사람이 하루에 넣을 수 있는 신고 수 (메일 상한·운영자 부담을 지킨다) */
const DAILY_REPORT_LIMIT = 20;

/**
 * Space 안 사진·멤버 신고 (docs/work-plan.md ⑤, 스토어 UGC 요건).
 * - 멤버 누구나(viewer+) 신고할 수 있다
 * - Space 관리자(admin+)가 목록을 보고 처리한다. 사진 삭제·내보내기는 기존 기능으로
 * - 운영자에게 메일(SUPPORT_EMAIL). 아동 안전 신고는 제목에 표시해 먼저 보게 한다
 * 신고한 사람의 이름은 관리자에게 보인다 (가족 공간이라 익명 신고는 두지 않음 — docs/decisions.md D-018)
 */
export const reportRoutes = new Hono<AppEnv>()
  .post("/:id/reports", validate("json", ReportInput), async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    const db = c.var.db;
    await requireSpaceRole(db, user.id, spaceId, "viewer");
    const input = c.req.valid("json");

    const since = new Date(Date.now() - 86400_000);
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(reports)
      .where(and(eq(reports.reporterId, user.id), gte(reports.createdAt, since)));
    if (n >= DAILY_REPORT_LIMIT) throw new HTTPException(429, { message: "오늘은 신고를 더 받을 수 없어요. 지원 메일로 알려 주세요." });

    // 사진은 이 Space의 것이어야 한다
    let assetSha: string | null = null;
    let uploader: string | null = null;
    if (input.assetId) {
      const [a] = await db
        .select({ sha: blobs.sha256, uploadedBy: assets.uploadedBy })
        .from(assets)
        .innerJoin(libraries, eq(libraries.id, assets.libraryId))
        .innerJoin(blobs, eq(blobs.id, assets.blobId))
        .where(and(eq(assets.id, input.assetId), eq(libraries.spaceId, spaceId)))
        .limit(1);
      if (!a) throw new HTTPException(404, { message: "사진을 찾을 수 없어요" });
      assetSha = a.sha;
      uploader = a.uploadedBy;
    }
    // 멤버는 지금 이 Space에 있어야 한다 (사진 신고면 올린 사람을 대상으로 함께 적는다)
    let targetUserId = input.userId ?? uploader;
    if (input.userId) {
      const [m] = await db
        .select({ userId: spaceMembers.userId })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, input.userId)))
        .limit(1);
      if (!m) throw new HTTPException(404, { message: "멤버를 찾을 수 없어요" });
    }
    if (targetUserId === user.id) targetUserId = null;

    const [row] = await db
      .insert(reports)
      .values({
        spaceId,
        assetId: input.assetId ?? null,
        assetSha,
        targetUserId,
        reporterId: user.id,
        reason: input.reason,
        note: input.note || null,
      })
      .returning({ id: reports.id });

    const to = c.env.SUPPORT_EMAIL;
    if (to) {
      const urgent = input.reason === "child_safety";
      const text = [
        `신고 id: ${row!.id}`,
        `Space: ${spaceId}`,
        `사유: ${REPORT_REASON_LABEL[input.reason]}`,
        input.assetId ? `사진: ${input.assetId} (sha256 ${assetSha})` : null,
        targetUserId ? `대상 사용자: ${targetUserId}` : null,
        `신고자: ${user.id}`,
        input.note ? `내용: ${input.note}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const html = `<pre style="font:14px/1.6 monospace">${text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)}</pre>`;
      c.executionCtx.waitUntil(
        sendMail(
          c.env,
          { to, subject: `${urgent ? "[긴급] " : ""}nuvo 신고 — ${REPORT_REASON_LABEL[input.reason]}`, text, html },
          mailBudget(c.env, db),
        ).catch((e) => console.warn("[report] mail failed", e)),
      );
    }
    console.log(`[report] ${row!.id} space=${spaceId} reason=${input.reason}`);
    return c.json({ id: row!.id }, 201);
  })

  /** 관리자(admin+): 이 Space의 신고 목록. 열린 것 먼저, 최근 50건 */
  .get("/:id/reports", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    const db = c.var.db;
    await requireSpaceRole(db, user.id, spaceId, "admin");
    const reporter = alias(userTable, "reporter");
    const target = alias(userTable, "target");
    const rows = await db
      .select({
        id: reports.id,
        reason: reports.reason,
        note: reports.note,
        status: reports.status,
        reporterName: reporter.name,
        targetUserId: reports.targetUserId,
        targetName: target.name,
        assetId: reports.assetId,
        assetSha: reports.assetSha,
        assetAlive: assets.id,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .leftJoin(reporter, eq(reporter.id, reports.reporterId))
      .leftJoin(target, eq(target.id, reports.targetUserId))
      .leftJoin(assets, eq(assets.id, reports.assetId))
      .where(eq(reports.spaceId, spaceId))
      .orderBy(sql`${reports.status} = 'open' desc`, desc(reports.createdAt))
      .limit(50);
    const out: SpaceReport[] = await Promise.all(
      rows.map(async ({ assetSha, assetAlive, createdAt, ...r }) => ({
        ...r,
        // 사진이 아직 있을 때만 썸네일을 서명한다 (지운 사진을 되살려 보여주지 않게)
        thumb: assetSha && assetAlive ? await signMediaUrl(c.env.MEDIA_SIGNING_KEY, assetSha, "512") : null,
        createdAt: createdAt.getTime(),
      })),
    );
    return c.json({ reports: out });
  })

  /** 관리자(admin+): 처리 완료 / 문제 없음. 사진 삭제·내보내기는 기존 기능으로 먼저 한다 */
  .post("/:id/reports/:reportId", validate("json", ReportResolveInput), async (c) => {
    const user = requireUser(c);
    const { id: spaceId, reportId } = c.req.param();
    if (!isUuid(reportId)) throw new HTTPException(404, { message: "신고를 찾을 수 없어요" });
    const db = c.var.db;
    await requireSpaceRole(db, user.id, spaceId, "admin");
    const [r] = await db
      .update(reports)
      .set({ status: c.req.valid("json").status, resolvedBy: user.id, resolvedAt: new Date() })
      .where(and(eq(reports.id, reportId), eq(reports.spaceId, spaceId)))
      .returning({ id: reports.id });
    if (!r) throw new HTTPException(404, { message: "신고를 찾을 수 없어요" });
    return c.json({ ok: true });
  });

/** 관리자 화면 표시용: 열린 신고 수 */
export async function openReportCount(db: AppEnv["Variables"]["db"], spaceId: string) {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(and(eq(reports.spaceId, spaceId), eq(reports.status, "open")));
  return n;
}
