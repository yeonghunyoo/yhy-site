import { blobs, r2Gc, type Db } from "@nuvo/db";
import { and, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { r2Key } from "./sign";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** 업로드만 하고 완료하지 않은 원본을 얼마나 기다릴지 (영수증 유효 1시간 + 여유) */
export const PENDING_UPLOAD_TTL_MS = 2 * 3600_000;

/**
 * 같은 sha256에 대한 "R2 객체 삭제"와 "Blob 등록"이 엇갈리지 않게 하는 트랜잭션 잠금.
 * 정렬해서 잡아 교착을 피한다.
 */
export async function lockShas(tx: Tx, shas: string[]) {
  for (const s of [...new Set(shas)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${s}, 0))`);
  }
}

export const mediaCacheKey = (r2key: string) => new Request(`https://media.nuvo.internal/${r2key}`);

const keysOf = (sha: string) => [r2Key.original(sha), r2Key.thumb(sha, 512), r2Key.thumb(sha, 2048)];

/**
 * 정리 대기열 처리. due_at이 지난 sha마다:
 * Blob 행이 있으면(다시 등록됨) 지우지 않고, 아직 기다리는 업로드가 있어도 지우지 않는다.
 * 그 밖에는 R2 원본·썸네일을 지운다. R2 삭제는 잠금을 잡은 채로 해서 /complete 와 엇갈리지 않는다.
 */
export async function collectGarbage(db: Db, bucket: R2Bucket, only?: string[], limit = 200) {
  if (only && only.length === 0) return { processed: 0, deleted: 0 };
  const now = new Date();
  const due = await db
    .selectDistinct({ sha256: r2Gc.sha256 })
    .from(r2Gc)
    .where(and(lte(r2Gc.dueAt, now), only ? inArray(r2Gc.sha256, only) : undefined))
    .limit(limit);

  let deleted = 0;
  for (const { sha256 } of due) {
    const removed = await db.transaction(async (tx) => {
      await lockShas(tx, [sha256]);
      await tx.delete(r2Gc).where(and(eq(r2Gc.sha256, sha256), lte(r2Gc.dueAt, now)));
      const [blob] = await tx.select({ id: blobs.id }).from(blobs).where(eq(blobs.sha256, sha256)).limit(1);
      const [waiting] = await tx
        .select({ owner: r2Gc.owner })
        .from(r2Gc)
        .where(and(eq(r2Gc.sha256, sha256), gt(r2Gc.dueAt, now)))
        .limit(1);
      if (blob || waiting) return false;
      await bucket.delete(keysOf(sha256));
      return true;
    });
    if (removed) {
      deleted++;
      await purgeEdgeCache(sha256);
    }
  }
  return { processed: due.length, deleted };
}

/** 이 데이터센터의 엣지 캐시에서도 지운다 (다른 곳은 캐시 만료와 서명 만료로 정리됨) */
async function purgeEdgeCache(sha: string) {
  try {
    await Promise.all(keysOf(sha).map((k) => caches.default.delete(mediaCacheKey(k))));
  } catch {
    /* 캐시가 없는 환경 */
  }
}
