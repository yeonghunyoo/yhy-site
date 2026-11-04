import { activities, assets, blobs, libraries, r2Gc, type Db } from "@nuvo/db";
import type { CloudAsset, HubEvent } from "@nuvo/shared";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import type { Tx } from "./gc";
import { signMediaUrl } from "./sign";

export const assetColumns = {
  id: assets.id,
  libraryId: assets.libraryId,
  sha256: blobs.sha256,
  mime: blobs.mime,
  size: blobs.size,
  width: blobs.width,
  height: blobs.height,
  filename: assets.filename,
  takenAt: assets.takenAt,
  lat: assets.lat,
  lng: assets.lng,
  camera: assets.camera,
  dhash: assets.dhash,
  blurhash: assets.blurhash,
  uploadedBy: assets.uploadedBy,
};

export interface AssetRow {
  id: string;
  libraryId: string;
  sha256: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  filename: string | null;
  takenAt: Date;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  dhash: string | null;
  blurhash: string | null;
  uploadedBy: string | null;
}

export async function toCloudAsset(secret: string, r: AssetRow): Promise<CloudAsset> {
  const [thumb, display, original] = await Promise.all([
    signMediaUrl(secret, r.sha256, "512"),
    signMediaUrl(secret, r.sha256, "2048"),
    signMediaUrl(secret, r.sha256, "o"),
  ]);
  return {
    ...r,
    takenAt: r.takenAt.getTime(),
    urls: { thumb, display, original },
  };
}

/**
 * Asset 삭제 (호출한 쪽의 트랜잭션 안에서): 라이브러리 사용량 차감, Blob 참조 수 감소,
 * 참조 0인 Blob 행은 지우고 R2 정리 대기열에 넣는다. 커밋 뒤 collectGarbage(db, bucket, orphanShas)로 바로 정리한다.
 */
export async function removeAssets(tx: Tx, ids: string[]) {
  const orphanShas: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await tx
      .delete(assets)
      .where(inArray(assets.id, ids.slice(i, i + 500)))
      .returning({ libraryId: assets.libraryId, blobId: assets.blobId });
    if (rows.length === 0) continue;

    const blobIds = [...new Set(rows.map((r) => r.blobId))];
    const blobRows = await tx.select({ id: blobs.id, size: blobs.size }).from(blobs).where(inArray(blobs.id, blobIds));
    const sizeOf = new Map(blobRows.map((b) => [b.id, b.size]));

    const usage = new Map<string, number>();
    const refs = new Map<string, number>();
    for (const r of rows) {
      usage.set(r.libraryId, (usage.get(r.libraryId) ?? 0) + (sizeOf.get(r.blobId) ?? 0));
      refs.set(r.blobId, (refs.get(r.blobId) ?? 0) + 1);
    }
    for (const [libId, bytes] of usage) {
      await tx
        .update(libraries)
        .set({ usedBytes: sql`greatest(${libraries.usedBytes} - ${bytes}, 0)` })
        .where(eq(libraries.id, libId));
    }
    for (const [blobId, n] of refs) {
      await tx.update(blobs).set({ refCount: sql`${blobs.refCount} - ${n}` }).where(eq(blobs.id, blobId));
    }
    const orphans = await tx
      .delete(blobs)
      .where(and(inArray(blobs.id, blobIds), lte(blobs.refCount, 0)))
      .returning({ sha256: blobs.sha256 });
    if (orphans.length) {
      await tx
        .insert(r2Gc)
        .values(orphans.map((o) => ({ sha256: o.sha256, owner: "-", dueAt: new Date() })))
        .onConflictDoUpdate({ target: [r2Gc.sha256, r2Gc.owner], set: { dueAt: new Date() } });
      orphanShas.push(...orphans.map((o) => o.sha256));
    }
  }
  return { orphanShas };
}

/** 라이브러리 행을 잠근다: 잠긴 동안 이 라이브러리에 Asset을 새로 넣을 수 없다 (FK 검사가 기다림) */
export async function lockLibraries(tx: Tx, libraryIds: string[]) {
  if (libraryIds.length === 0) return;
  await tx.select({ id: libraries.id }).from(libraries).where(inArray(libraries.id, libraryIds)).for("update");
}

/** Space 라이브러리면 spaceId, 아니면 null */
export async function spaceOfLibrary(db: Db, libraryId: string) {
  const [l] = await db.select({ spaceId: libraries.spaceId }).from(libraries).where(eq(libraries.id, libraryId));
  return l?.spaceId ?? null;
}

/** Space 피드 기록 + 실시간 알림 */
export async function recordSpaceActivity(
  env: Env,
  db: Db,
  spaceId: string,
  actor: { id: string; name: string },
  type: (typeof activities.$inferInsert)["type"],
  data: Record<string, unknown>,
  event?: HubEvent,
) {
  // 같은 사람이 10분 안에 연달아 올리면 피드 한 줄로 합친다 ("사진 1장" × 30 → "사진 30장")
  if (type === "assets_added" || type === "assets_removed") {
    const [last] = await db
      .select()
      .from(activities)
      .where(eq(activities.spaceId, spaceId))
      .orderBy(desc(activities.createdAt))
      .limit(1);
    if (last && last.actorId === actor.id && last.type === type && Date.now() - last.createdAt.getTime() < 10 * 60_000) {
      const prevShas = Array.isArray(last.data.shas) ? (last.data.shas as string[]) : [];
      const newShas = Array.isArray(data.shas) ? (data.shas as string[]) : [];
      await db
        .update(activities)
        .set({
          data: { count: Number(last.data.count ?? 0) + Number(data.count ?? 0), shas: [...newShas, ...prevShas].slice(0, 6) },
          createdAt: new Date(),
        })
        .where(eq(activities.id, last.id));
      if (event) await notifyHub(env, spaceId, event);
      return;
    }
  }
  await db.insert(activities).values({ spaceId, actorId: actor.id, type, data });
  if (event) await notifyHub(env, spaceId, event);
}

export async function notifyHub(env: Env, spaceId: string, event: HubEvent) {
  try {
    const stub = env.SPACE_HUB.get(env.SPACE_HUB.idFromName(spaceId));
    await stub.fetch("https://hub/broadcast", { method: "POST", body: JSON.stringify(event) });
  } catch (e) {
    console.warn("hub notify failed", e);
  }
}

/** 실시간 연결 끊기: userId를 주면 그 사람만, 없으면 Space 전체 (삭제 시) */
export async function kickFromHub(env: Env, spaceId: string, userId?: string) {
  try {
    const stub = env.SPACE_HUB.get(env.SPACE_HUB.idFromName(spaceId));
    await stub.fetch("https://hub/kick", { method: "POST", body: JSON.stringify({ userId: userId ?? null }) });
  } catch (e) {
    console.warn("hub kick failed", e);
  }
}
