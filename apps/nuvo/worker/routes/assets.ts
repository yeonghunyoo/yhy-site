import { validate } from "../lib/validate";
import { assets, blobs, libraries, spaceMembers, spaces, user as userTable } from "@nuvo/db";
import { BackupStatusInput, CopyAssetsInput, roleAtLeast } from "@nuvo/shared";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { requireUser, type AppEnv } from "../context";
import { accessibleLibraryIds, isUuid, libraryAccess, requireLibrary } from "../lib/access";
import { assertUploadAllowed, ownerUsage } from "../lib/capacity";
import { subscriptionOf } from "../lib/subscription";
import { deleteAccount, planAccountDeletion } from "../lib/account";
import { assetColumns, recordSpaceActivity, removeAssets, toCloudAsset } from "../lib/assets";
import { collectGarbage } from "../lib/gc";
import { signMediaUrl } from "../lib/sign";

/** 타임라인 커서: "<takenAt ms>_<assetId>" */
function parseCursor(cur?: string) {
  if (!cur) return null;
  const [t, id] = cur.split("_");
  const ms = Number(t);
  if (!Number.isFinite(ms) || !id || !isUuid(id)) throw new HTTPException(400, { message: "잘못된 커서" });
  return { takenAt: new Date(ms), id };
}

export const assetRoutes = new Hono<AppEnv>()
  /** 라이브러리 타임라인 (최신순, 커서 페이지) */
  .get(
    "/libraries/:id/assets",
    validate("query", z.object({ limit: z.string().optional(), cursor: z.string().optional() })),
    async (c) => {
    const user = requireUser(c);
    const libraryId = c.req.param("id");
    await requireLibrary(c.var.db, user.id, libraryId, "viewer");
    const q = c.req.valid("query");
    const limit = Math.min(Number(q.limit ?? 300) || 300, 1000);
    const cur = parseCursor(q.cursor);

    const rows = await c.var.db
      .select(assetColumns)
      .from(assets)
      .innerJoin(blobs, eq(assets.blobId, blobs.id))
      .where(
        and(
          eq(assets.libraryId, libraryId),
          cur
            ? or(lt(assets.takenAt, cur.takenAt), and(eq(assets.takenAt, cur.takenAt), lt(assets.id, cur.id)))
            : undefined,
        ),
      )
      .orderBy(desc(assets.takenAt), desc(assets.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return c.json({
      assets: await Promise.all(page.map((r) => toCloudAsset(c.env.MEDIA_SIGNING_KEY, r))),
      nextCursor: rows.length > limit && last ? `${last.takenAt.getTime()}_${last.id}` : null,
    });
  },
  )

  /** 로컬 파일 중 이미 nuvo에 있는 것 (sha256 기준, 내 접근 범위 안에서만) */
  .post("/backup-status", validate("json", BackupStatusInput), async (c) => {
    const user = requireUser(c);
    const { sha256s } = c.req.valid("json");
    const libs = await accessibleLibraryIds(c.var.db, user.id);
    const rows = await c.var.db
      .selectDistinct({ sha256: blobs.sha256 })
      .from(blobs)
      .innerJoin(assets, eq(assets.blobId, blobs.id))
      .where(and(inArray(blobs.sha256, sha256s), inArray(assets.libraryId, libs)));
    return c.json({ backedUp: rows.map((r) => r.sha256) });
  })

  /** 다른 라이브러리로 보내기 (같은 Blob 참조, 복사 없음). 예: 내 사진 → 가족 Space */
  .post("/assets/copy", validate("json", CopyAssetsInput), async (c) => {
    const user = requireUser(c);
    const { assetIds, targetLibraryId, shareLocation } = c.req.valid("json");
    const db = c.var.db;
    const { lib } = await requireLibrary(db, user.id, targetLibraryId, "editor");
    const libs = await accessibleLibraryIds(db, user.id);

    const src = await db
      .select({
        blobId: assets.blobId,
        size: blobs.size,
        filename: assets.filename,
        takenAt: assets.takenAt,
        lat: assets.lat,
        lng: assets.lng,
        camera: assets.camera,
        dhash: assets.dhash,
        blurhash: assets.blurhash,
        caption: assets.caption,
      })
      .from(assets)
      .innerJoin(blobs, eq(assets.blobId, blobs.id))
      .where(and(inArray(assets.id, assetIds), inArray(assets.libraryId, libs)));
    if (src.length === 0) return c.json({ added: 0, skipped: 0 });

    const inserted = await db.transaction(async (tx) => {
      // 동시에 지워지는 Blob과 엇갈리지 않게 먼저 잠그고, 남아 있는 것만 보낸다
      const live = new Set(
        (
          await tx
            .select({ id: blobs.id })
            .from(blobs)
            .where(inArray(blobs.id, [...new Set(src.map((s) => s.blobId))]))
            .for("update")
        ).map((b) => b.id),
      );
      const rows = src.filter((s) => live.has(s.blobId));
      if (rows.length === 0) return [];
      const ins = await tx
        .insert(assets)
        .values(
          rows.map(({ size: _s, ...s }) => ({
            ...s,
            // Space로 보낼 때 위치는 기본으로 빼고, "위치도 공유"를 고른 경우만 함께 보낸다 (D-016)
            ...(lib.type === "space" && !shareLocation ? { lat: null, lng: null } : {}),
            libraryId: targetLibraryId,
            uploadedBy: user.id,
          })),
        )
        .onConflictDoNothing({ target: [assets.libraryId, assets.blobId] })
        .returning({ id: assets.id, blobId: assets.blobId });
      const sizeOf = new Map(src.map((s) => [s.blobId, s.size]));
      const added = ins.reduce((n, r) => n + (sizeOf.get(r.blobId) ?? 0), 0);
      await tx
        .update(libraries)
        .set({ usedBytes: sql`${libraries.usedBytes} + ${added}` })
        .where(eq(libraries.id, targetLibraryId));
      // 소유자 용량으로 검사 (넘으면 트랜잭션이 되돌린다). 구독 확인도 여기서
      const usage = await assertUploadAllowed(tx, lib, 0);
      if (added > 0 && usage.usedBytes > usage.quotaBytes) throw new HTTPException(413, { message: "저장 공간이 부족해요" });
      for (const r of ins) await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.id, r.blobId));
      return ins;
    });

    if (lib.spaceId && inserted.length) {
      const shas = await db
        .select({ sha256: blobs.sha256 })
        .from(blobs)
        .where(inArray(blobs.id, inserted.slice(0, 6).map((i) => i.blobId)));
      await recordSpaceActivity(
        c.env,
        db,
        lib.spaceId,
        user,
        "assets_added",
        { count: inserted.length, shas: shas.map((s) => s.sha256) },
        { type: "assets_changed", actorId: user.id, actorName: user.name, count: inserted.length, action: "added" },
      );
    }
    return c.json({ added: inserted.length, skipped: src.length - inserted.length });
  })

  /** 삭제: 내가 올린 사진(editor+) 또는 관리자(admin+) */
  .post("/assets/delete", validate("json", CopyAssetsInput.pick({ assetIds: true })), async (c) => {
    const user = requireUser(c);
    const { assetIds } = c.req.valid("json");
    const db = c.var.db;
    const rows = await db
      .select({ id: assets.id, libraryId: assets.libraryId, uploadedBy: assets.uploadedBy })
      .from(assets)
      .where(inArray(assets.id, assetIds));

    const roleCache = new Map<string, Awaited<ReturnType<typeof libraryAccess>>>();
    const allowed: string[] = [];
    for (const r of rows) {
      if (!roleCache.has(r.libraryId)) roleCache.set(r.libraryId, await libraryAccess(db, user.id, r.libraryId));
      const { role } = roleCache.get(r.libraryId)!;
      if (roleAtLeast(role, "admin") || (roleAtLeast(role, "editor") && r.uploadedBy === user.id)) allowed.push(r.id);
    }
    if (allowed.length === 0) throw new HTTPException(403, { message: "삭제할 권한이 없어요" });

    const { orphanShas } = await db.transaction((tx) => removeAssets(tx, allowed));
    await collectGarbage(db, c.env.MEDIA, orphanShas);

    for (const [, { lib }] of roleCache) {
      const n = rows.filter((r) => r.libraryId === lib?.id && allowed.includes(r.id)).length;
      if (lib?.spaceId && n) {
        await recordSpaceActivity(c.env, db, lib.spaceId, user, "assets_removed", { count: n }, {
          type: "assets_changed",
          actorId: user.id,
          actorName: user.name,
          count: n,
          action: "removed",
        });
      }
    }
    return c.json({ removed: allowed.length, denied: rows.length - allowed.length });
  })

  /**
   * 계정 삭제: 개인 라이브러리 사진 삭제 → 혼자인 Space 삭제 → 사용자 삭제(세션·멤버십 연쇄 삭제).
   * 다른 멤버가 있는 Space의 소유자면 먼저 소유권을 넘겨야 한다. Space에 올린 사진은 Space에 남는다.
   */
  .delete("/me", async (c) => {
    const user = requireUser(c);
    const db = c.var.db;
    // 규칙은 운영자 삭제와 같다(worker/lib/account.ts). 본인 탈퇴는 공유 Space 소유권을 자동으로 넘기지 않는다(409)
    const plan = await planAccountDeletion(db, user.id);
    if (plan.sharedSpaces.length) await deleteAccount(c.env, db, plan, { defer: c.var.defer }); // 409를 던진다
    // 먼저 로그아웃해서 세션 쿠키(캐시 포함)를 지운다
    const out = await c.var.auth.api.signOut({ headers: c.req.raw.headers, asResponse: true });
    await deleteAccount(c.env, db, plan, { defer: c.var.defer });
    const res = c.json({ ok: true });
    for (const cookie of out.headers.getSetCookie()) res.headers.append("set-cookie", cookie);
    return res;
  })

  /** 내 정보 + 개인 라이브러리 + 가입한 Space 목록 */
  .get("/me", async (c) => {
    const user = requireUser(c);
    const db = c.var.db;
    const [personal] = await db.select().from(libraries).where(eq(libraries.userId, user.id)).limit(1);

    const mine = await db
      .select({
        id: spaces.id,
        name: spaces.name,
        role: spaceMembers.role,
        libraryId: libraries.id,
        memberCount: sql<number>`(select count(*)::int from ${spaceMembers} m where m.space_id = ${spaces.id})`,
        assetCount: sql<number>`(select count(*)::int from ${assets} a where a.library_id = ${libraries.id})`,
        coverSha: sql<string | null>`(
          select b.sha256 from ${assets} a join ${blobs} b on b.id = a.blob_id
          where a.library_id = ${libraries.id} order by a.taken_at desc limit 1)`,
      })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .innerJoin(libraries, eq(libraries.spaceId, spaces.id))
      .where(eq(spaceMembers.userId, user.id))
      .orderBy(spaces.createdAt);

    const spacesOut = await Promise.all(
      mine.map(async ({ coverSha, ...s }) => ({
        ...s,
        cover: coverSha ? await signMediaUrl(c.env.MEDIA_SIGNING_KEY, coverSha, "512") : null,
      })),
    );
    const [u] = await db.select().from(userTable).where(eq(userTable.id, user.id));
    // 용량은 사람 단위: 개인 + 내가 소유한 Space의 합 (docs/decisions.md D-016)
    const [usage, subscription] = await Promise.all([ownerUsage(db, user.id), subscriptionOf(db, user.id)]);
    return c.json({
      user: { id: user.id, name: u?.name ?? user.name, email: u?.email ?? user.email, image: u?.image ?? null },
      personal: personal ? { id: personal.id, type: "personal" as const, usedBytes: usage.usedBytes, quotaBytes: usage.quotaBytes } : null,
      subscription,
      spaces: spacesOut,
    });
  });
