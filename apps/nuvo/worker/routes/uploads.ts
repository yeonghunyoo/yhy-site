import { validate } from "../lib/validate";
import { assets, blobs, libraries, r2Gc } from "@nuvo/db";
import {
  MAX_THUMB_BYTES,
  MAX_UPLOAD_BYTES,
  SUPPORTED_MIME,
  UploadCompleteRequest,
  UploadPrepareRequest,
  type UploadAction,
} from "@nuvo/shared";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireUser, type AppEnv } from "../context";
import { accessibleLibraryIds, requireLibrary } from "../lib/access";
import { assertServiceCapacity, assertUploadAllowed, billingOwner, ownerUsage } from "../lib/capacity";
import { assetColumns, recordSpaceActivity, toCloudAsset } from "../lib/assets";
import { lockShas, PENDING_UPLOAD_TTL_MS } from "../lib/gc";
import { r2Key, signReceipt, verifyReceipt } from "../lib/sign";

const SHA_RE = /^[0-9a-f]{64}$/;

export const uploads = new Hono<AppEnv>()
  /**
   * 업로드 전 확인: 파일별로 skip / link / upload 를 알려준다.
   * link 판정은 "내가 접근할 수 있는 라이브러리"에 같은 Blob이 있을 때만 → 남의 사진 존재 여부가 새지 않는다.
   */
  .post("/prepare", validate("json", UploadPrepareRequest), async (c) => {
    const user = requireUser(c);
    const { libraryId, files } = c.req.valid("json");
    const db = c.var.db;
    const { lib } = await requireLibrary(db, user.id, libraryId, "editor");
    const shas = [...new Set(files.map((f) => f.sha256))];

    const inLib = await db
      .select({ sha256: blobs.sha256, assetId: assets.id })
      .from(assets)
      .innerJoin(blobs, eq(assets.blobId, blobs.id))
      .where(and(eq(assets.libraryId, libraryId), inArray(blobs.sha256, shas)));
    const skip = new Map(inLib.map((r) => [r.sha256, r.assetId]));

    const libs = await accessibleLibraryIds(db, user.id);
    const linkable = await db
      .selectDistinct({ sha256: blobs.sha256 })
      .from(blobs)
      .innerJoin(assets, eq(assets.blobId, blobs.id))
      .where(and(inArray(blobs.sha256, shas), inArray(assets.libraryId, libs)));
    const link = new Set(linkable.map((r) => r.sha256));

    let need = 0;
    const seen = new Set<string>();
    const results: UploadAction[] = files.map((f) => {
      const assetId = skip.get(f.sha256);
      if (assetId) return { sha256: f.sha256, action: "skip", assetId };
      if (!seen.has(f.sha256)) need += f.size;
      seen.add(f.sha256);
      return link.has(f.sha256) ? { sha256: f.sha256, action: "link" } : { sha256: f.sha256, action: "upload" };
    });
    // 구독 + 소유자 용량 (Space는 소유자의 개인 용량에서 차감, docs/decisions.md D-016)
    const usage = await assertUploadAllowed(db, lib, need);
    // 새로 R2에 쓰는 원본만 서비스 상한에 넣는다 (link는 기존 Blob을 공유하므로 저장량이 늘지 않음)
    const newBytes = files
      .filter((f, i) => results[i]!.action === "upload" && files.findIndex((g) => g.sha256 === f.sha256) === i)
      .reduce((s, f) => s + f.size, 0);
    await assertServiceCapacity(db, c.env, newBytes);

    return c.json({ results, usedBytes: usage.usedBytes, quotaBytes: usage.quotaBytes });
  })

  /**
   * 원본 업로드 (Worker → R2 스트리밍). R2가 sha256을 검증하므로 키와 내용이 항상 일치한다.
   * 완료 전까지는 "대기 중 업로드"로 기록해서, 완료하지 않은 원본은 cron이 지우고 대기 용량도 한도에 넣는다.
   */
  .put("/blob/:sha", async (c) => {
    const user = requireUser(c);
    const sha = c.req.param("sha");
    const db = c.var.db;
    if (!SHA_RE.test(sha)) throw new HTTPException(400, { message: "잘못된 해시" });
    const { lib } = await requireLibrary(db, user.id, c.req.query("libraryId") ?? "", "editor");

    const len = Number(c.req.header("content-length"));
    if (!len || len > MAX_UPLOAD_BYTES) throw new HTTPException(413, { message: "파일이 너무 커요 (최대 100MB)" });
    const body = c.req.raw.body;
    if (!body) throw new HTTPException(400, { message: "본문이 비어 있어요" });
    // 이미지 형식만 허용 (text/html 등을 올려 같은 도메인에서 실행시키는 공격 차단)
    let contentType = (c.req.header("content-type") ?? "").toLowerCase();
    if (!SUPPORTED_MIME.includes(contentType)) throw new HTTPException(415, { message: "지원하지 않는 파일 형식이에요" });
    // 이미 등록된 Blob이면 처음 등록된 형식을 유지한다 (다시 올려서 다른 사람 사진의 형식을 바꾸지 못하게)
    const [existing] = await db.select({ mime: blobs.mime }).from(blobs).where(eq(blobs.sha256, sha)).limit(1);
    if (existing) contentType = existing.mime;

    const now = new Date();
    const [{ pending } = { pending: 0 }] = await db
      .select({ pending: sql<number>`coalesce(sum(${r2Gc.bytes}), 0)::bigint` })
      .from(r2Gc)
      .where(and(eq(r2Gc.owner, user.id), gt(r2Gc.dueAt, now), ne(r2Gc.sha256, sha)));
    await assertUploadAllowed(db, lib, len, Number(pending));
    if (!existing) await assertServiceCapacity(db, c.env, len);
    const row = { sha256: sha, owner: user.id, bytes: len, dueAt: new Date(now.getTime() + PENDING_UPLOAD_TTL_MS) };
    await db
      .insert(r2Gc)
      .values(row)
      .onConflictDoUpdate({ target: [r2Gc.sha256, r2Gc.owner], set: { bytes: row.bytes, dueAt: row.dueAt } });

    try {
      await c.env.MEDIA.put(r2Key.original(sha), body, { sha256: sha, httpMetadata: { contentType } });
    } catch (e) {
      console.warn("r2 put failed", e);
      await db.delete(r2Gc).where(and(eq(r2Gc.sha256, sha), eq(r2Gc.owner, user.id)));
      throw new HTTPException(400, { message: "파일 해시가 일치하지 않아요" });
    }
    return c.json({ receipt: await signReceipt(c.env.MEDIA_SIGNING_KEY, user.id, sha) });
  })

  /**
   * 썸네일 업로드. 원본을 방금 올린 사람만 (영수증 필요) 올릴 수 있다.
   * 이미 등록된 Blob이면 덮어쓰지 않고 성공으로 답한다 → 남의 썸네일 변조와 "이 사진이 있는지" 조회를 모두 막는다.
   */
  .put("/blob/:sha/thumb/:size", async (c) => {
    const user = requireUser(c);
    const { sha, size } = c.req.param();
    if (!SHA_RE.test(sha) || !["512", "2048"].includes(size)) throw new HTTPException(400, { message: "잘못된 요청" });
    const receipt = c.req.query("receipt") ?? "";
    if (!(await verifyReceipt(c.env.MEDIA_SIGNING_KEY, user.id, sha, receipt))) {
      throw new HTTPException(403, { message: "원본을 먼저 올려 주세요" });
    }
    const len = Number(c.req.header("content-length"));
    // 썸네일 크기 초과는 용량 부족(413)과 구분되도록 400
    if (!len || len > MAX_THUMB_BYTES) throw new HTTPException(400, { message: "썸네일이 너무 커요" });
    const type = c.req.header("content-type") ?? "";
    if (!/^image\/(webp|jpeg)$/.test(type)) throw new HTTPException(415, { message: "썸네일 형식 오류" });

    const [existing] = await c.var.db.select({ id: blobs.id }).from(blobs).where(eq(blobs.sha256, sha)).limit(1);
    if (existing) return c.json({ ok: true });
    await c.env.MEDIA.put(r2Key.thumb(sha, size), c.req.raw.body!, { httpMetadata: { contentType: type } });
    return c.json({ ok: true });
  })

  /** 업로드 완료: Blob 등록(없으면), Asset 생성, 사용량 반영, Space 피드/알림 */
  .post("/complete", validate("json", UploadCompleteRequest), async (c) => {
    const user = requireUser(c);
    const { libraryId, items, shareLocation } = c.req.valid("json");
    const db = c.var.db;
    const env = c.env;
    const { lib } = await requireLibrary(db, user.id, libraryId, "editor");
    // 구독 확인만 (용량은 prepare·blob에서 봤다. 여기서 막으면 R2에 올린 원본이 대기열에 남아 cron이 지운다)
    await assertUploadAllowed(db, lib, 0);

    const shas = [...new Set(items.map((i) => i.sha256))];
    const libs = await accessibleLibraryIds(db, user.id);
    const linkable = new Set(
      (
        await db
          .selectDistinct({ sha256: blobs.sha256 })
          .from(blobs)
          .innerJoin(assets, eq(assets.blobId, blobs.id))
          .where(and(inArray(blobs.sha256, shas), inArray(assets.libraryId, libs)))
      ).map((r) => r.sha256),
    );

    // 권한 검증: 연결 가능한 Blob이거나, 이 사용자가 방금 원본을 올렸다는 영수증이 있어야 한다
    const uploaded = new Map<string, (typeof items)[number]>();
    for (const it of items) {
      if (linkable.has(it.sha256)) continue;
      if (!it.receipt || !(await verifyReceipt(env.MEDIA_SIGNING_KEY, user.id, it.sha256, it.receipt))) {
        throw new HTTPException(403, { message: "업로드 확인에 실패했어요. 다시 시도해 주세요." });
      }
      uploaded.set(it.sha256, it);
    }
    const retry = () => new HTTPException(409, { message: "사진이 방금 바뀌었어요. 다시 시도해 주세요." });

    const created = await db.transaction(async (tx) => {
      // R2 정리(collectGarbage)와 엇갈리지 않도록 같은 sha 잠금을 잡은 뒤 R2를 확인한다
      await lockShas(tx, [...uploaded.keys()]);
      for (const it of uploaded.values()) {
        const [head, thumb] = await Promise.all([
          env.MEDIA.head(r2Key.original(it.sha256)),
          env.MEDIA.head(r2Key.thumb(it.sha256, 512)),
        ]);
        if (!head || head.size !== it.size) throw new HTTPException(400, { message: "원본 파일이 아직 없어요" });
        if (!thumb) {
          const [b] = await tx.select({ id: blobs.id }).from(blobs).where(eq(blobs.sha256, it.sha256));
          if (!b) throw new HTTPException(400, { message: "썸네일이 아직 없어요" });
        }
      }
      // 새 Blob은 직접 올린 것만 등록한다 (크기는 R2에서 확인한 값). 연결(link)은 기존 Blob만 쓴다.
      if (uploaded.size) {
        await tx
          .insert(blobs)
          .values(
            [...uploaded.values()].map((i) => ({
              sha256: i.sha256,
              size: i.size,
              mime: i.mime,
              width: i.width,
              height: i.height,
            })),
          )
          .onConflictDoNothing({ target: blobs.sha256 });
        await tx.delete(r2Gc).where(and(eq(r2Gc.owner, user.id), inArray(r2Gc.sha256, [...uploaded.keys()])));
      }
      // 잠가서 읽는다: 동시에 진행 중인 삭제가 이 Blob을 지웠다면 여기서 없음을 알게 된다
      const blobRows = await tx
        .select({ id: blobs.id, sha256: blobs.sha256, size: blobs.size })
        .from(blobs)
        .where(inArray(blobs.sha256, shas))
        .for("update");
      const bySha = new Map(blobRows.map((b) => [b.sha256, b]));
      if (shas.some((s) => !bySha.has(s))) throw retry();

      const inserted = await tx
        .insert(assets)
        .values(
          items.map((i) => ({
            libraryId,
            blobId: bySha.get(i.sha256)!.id,
            uploadedBy: user.id,
            filename: i.filename,
            takenAt: new Date(i.takenAt),
            // Space에는 위치를 기본으로 남기지 않는다 — 집·학교 위치가 가족 밖으로 퍼지지 않게 (D-016)
            lat: lib.type === "space" && !shareLocation ? null : i.lat,
            lng: lib.type === "space" && !shareLocation ? null : i.lng,
            camera: i.camera,
            dhash: i.dhash,
            blurhash: i.blurhash,
          })),
        )
        .onConflictDoNothing({ target: [assets.libraryId, assets.blobId] })
        .returning({ id: assets.id, blobId: assets.blobId });

      const sizeById = new Map(blobRows.map((b) => [b.id, b.size]));
      const added = inserted.reduce((s, r) => s + (sizeById.get(r.blobId) ?? 0), 0);
      const [updated] = await tx
        .update(libraries)
        .set({ usedBytes: sql`${libraries.usedBytes} + ${added}` })
        .where(eq(libraries.id, libraryId))
        .returning({ usedBytes: libraries.usedBytes });
      if (!updated) throw new HTTPException(404, { message: "라이브러리를 찾을 수 없어요" });
      // 동시 업로드로 소유자 용량을 넘겼으면 되돌린다 (413이면 트랜잭션 롤백)
      if (added > 0) {
        const usage = await ownerUsage(tx, (await billingOwner(tx, lib)) ?? user.id);
        if (usage.usedBytes > usage.quotaBytes) {
          throw new HTTPException(413, { message: `저장 공간이 부족해요 (${Math.round((usage.usedBytes - usage.quotaBytes) / 1024 / 1024)}MB 초과)` });
        }
      }

      for (const r of inserted) {
        await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.id, r.blobId));
      }
      return inserted;
    });

    const rows = created.length
      ? await db
          .select(assetColumns)
          .from(assets)
          .innerJoin(blobs, eq(assets.blobId, blobs.id))
          .where(inArray(assets.id, created.map((r) => r.id)))
      : [];
    const out = await Promise.all(rows.map((r) => toCloudAsset(env.MEDIA_SIGNING_KEY, r)));

    if (lib.spaceId && out.length) {
      await recordSpaceActivity(
        env,
        db,
        lib.spaceId,
        user,
        "assets_added",
        { count: out.length, shas: out.slice(0, 6).map((a) => a.sha256) },
        { type: "assets_changed", actorId: user.id, actorName: user.name, count: out.length, action: "added" },
      );
    }
    return c.json({ assets: out });
  });
