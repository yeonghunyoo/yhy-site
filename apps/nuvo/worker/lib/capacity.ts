import { activities, blobs, libraries, r2Gc, spaceMembers, type Db } from "@nuvo/db";
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Tx } from "./gc";
import type { LibraryRow } from "./access";
import { notifyHub } from "./assets";
import { requireSubscriber } from "./subscription";

const GB = 1024 ** 3;
/** 썸네일(512·2048 WebP)은 Blob 크기에 없어서 원본의 12%로 어림한다 */
const THUMB_OVERHEAD = 1.12;

/* ───────────── 소유자 단위 용량 (docs/decisions.md D-016) ─────────────
 * 용량은 사람 단위다. Space는 별도 용량이 없고 **Space 소유자의 개인 용량(10GB)**에서 차감한다.
 * 라이브러리별 usedBytes는 그대로 두고(삭제·참조 계산에 쓴다), 한도 검사만 소유자 합계로 한다.
 */

/** 이 라이브러리의 과금 주체: 개인 → 그 사용자, Space → 소유자(role=owner). 소유자가 없으면 null */
export async function billingOwner(db: Db | Tx, lib: LibraryRow): Promise<string | null> {
  if (lib.type === "personal") return lib.userId;
  const [m] = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, lib.spaceId!), eq(spaceMembers.role, "owner")))
    .limit(1);
  return m?.userId ?? null;
}

export type Usage = { usedBytes: number; quotaBytes: number };

/** 소유자의 사용량 = 개인 라이브러리 + 소유한 Space 라이브러리의 usedBytes 합. 한도 = 개인 라이브러리 quotaBytes */
export async function ownerUsage(db: Db | Tx, ownerId: string): Promise<Usage> {
  const owned = db
    .select({ id: spaceMembers.spaceId })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.userId, ownerId), eq(spaceMembers.role, "owner")));
  const [row] = await db
    .select({
      used: sql<number>`coalesce(sum(${libraries.usedBytes}), 0)`.mapWith(Number),
      quota: sql<number>`coalesce(max(case when ${libraries.type} = 'personal' then ${libraries.quotaBytes} end), 0)`.mapWith(Number),
    })
    .from(libraries)
    .where(or(eq(libraries.userId, ownerId), inArray(libraries.spaceId, owned)));
  return { usedBytes: row?.used ?? 0, quotaBytes: row?.quota ?? 0 };
}

function quotaError(usage: Usage, need: number) {
  return new HTTPException(413, {
    message: `저장 공간이 부족해요 (${Math.round((usage.usedBytes + need - usage.quotaBytes) / 1024 / 1024)}MB 초과)`,
  });
}

/**
 * 이 라이브러리에 올릴 수 있는지: 구독 + 소유자 용량.
 * - 개인 라이브러리: 본인이 구독자여야 한다
 * - Space 라이브러리: 멤버 역할은 호출한 쪽(requireLibrary editor)이 보고, 여기서는 **소유자**가 구독자인지와 소유자 용량만 본다.
 *   구독 없는 가족도 소속 Space에는 올릴 수 있다(D-016). 소유자 구독이 끝나면 보기는 되고 올리기만 막힌다
 * 돌려주는 값은 소유자 사용량·한도 (화면 표시용)
 */
export async function assertUploadAllowed(db: Db | Tx, lib: LibraryRow, need: number, pendingBytes = 0): Promise<Usage> {
  const owner = await billingOwner(db, lib);
  if (!owner) throw new HTTPException(409, { message: "Space 소유자가 없어요" });
  await requireSubscriber(db, owner, lib.type === "personal" ? "me" : "owner");
  const usage = await ownerUsage(db, owner);
  if (need > 0 && usage.usedBytes + pendingBytes + need > usage.quotaBytes) {
    throw quotaError({ ...usage, usedBytes: usage.usedBytes + pendingBytes }, need);
  }
  return usage;
}

/**
 * Space 업로드가 소유자 용량 때문에 막혔을 때 Space 피드에 알린다 (docs/work-plan.md A ②, D-016 "차면 소유자에게 알림").
 * 올린 사람은 413 안내를 바로 보지만 소유자는 모르기 때문. 피드는 멤버 모두가 보며, Space 하나에 하루 한 번만 남긴다.
 * 메일은 nuvo Resend 계정이 생긴 뒤에 붙인다. 실패해도 업로드 응답에는 영향 없음
 */
export async function notifyStorageFull(env: Env, db: Db, lib: LibraryRow, actor: { id: string; name: string }) {
  if (lib.type !== "space" || !lib.spaceId) return;
  try {
    const since = new Date(Date.now() - 86400_000);
    const [recent] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.spaceId, lib.spaceId), eq(activities.type, "storage_full"), gte(activities.createdAt, since)))
      .limit(1);
    if (recent) return;
    const owner = await billingOwner(db, lib);
    const usage = owner ? await ownerUsage(db, owner) : null;
    await db.insert(activities).values({
      spaceId: lib.spaceId,
      actorId: actor.id,
      type: "storage_full",
      data: usage ? { usedBytes: usage.usedBytes, quotaBytes: usage.quotaBytes } : {},
    });
    await notifyHub(env, lib.spaceId, { type: "storage_full" });
  } catch (e) {
    console.warn("[capacity] storage_full notify failed", e);
  }
}

/* ───────────── 서비스 전체 상한 (계정을 옮기기 전까지, docs/mvp.md "계정 공용 한도") ───────────── */

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
export async function assertServiceCapacity(db: Db | Tx, env: Env, need: number) {
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
