import { blobs, r2Gc, type Db } from "@nuvo/db";
import { sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

const GB = 1024 ** 3;
/** 썸네일(512·2048 WebP)은 Blob 크기에 없어서 원본의 12%로 어림한다 */
const THUMB_OVERHEAD = 1.12;

/**
 * 서비스 전체 저장 상한 (R2 무료 사용량 안에 머물기 위한 안전장치).
 * STORAGE_CAP_GB가 비었거나 0이면 상한 없음.
 */
export function storageCapBytes(env: Env): number {
  const gb = Number(env.STORAGE_CAP_GB || 0);
  return gb > 0 ? gb * GB : 0;
}

/**
 * R2에 새로 쓰는 원본이 서비스 상한을 넘지 않는지 확인한다.
 * 저장량 = 등록된 Blob + 완료 전·삭제 대기 업로드(r2_gc), 썸네일 몫 포함.
 * 동시에 올리면 조금 넘을 수 있으므로 상한은 무료 사용량보다 여유 있게 잡는다.
 */
export async function assertServiceCapacity(db: Db, env: Env, need: number) {
  const cap = storageCapBytes(env);
  if (!cap || need <= 0) return;
  const [[b], [g]] = await Promise.all([
    db.select({ bytes: sql<number>`coalesce(sum(${blobs.size}), 0)`.mapWith(Number) }).from(blobs),
    db.select({ bytes: sql<number>`coalesce(sum(${r2Gc.bytes}), 0)`.mapWith(Number) }).from(r2Gc),
  ]);
  const stored = (b?.bytes ?? 0) + (g?.bytes ?? 0);
  if ((stored + need) * THUMB_OVERHEAD > cap) {
    throw new HTTPException(507, {
      message: "지금은 nuvo 저장 공간이 가득 찼어요. 사진을 정리하거나 나중에 다시 시도해 주세요.",
    });
  }
}
