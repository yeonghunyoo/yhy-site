import { assets, deletionRequests, libraries, spaceMembers, spaces, user as userTable, type Db } from "@nuvo/db";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { kickFromHub, lockLibraries, removeAssets } from "./assets";
import { collectGarbage } from "./gc";

export type DeletionPlan = {
  userId: string;
  /** 내 사진함 사진 수 */
  personalAssets: number;
  /** 함께 지워지는 Space(나 혼자인 Space) */
  deletedSpaces: { id: string; name: string }[];
  /** 다른 멤버가 있어 남는 Space: 소유권을 넘길 사람(transferShared일 때) */
  sharedSpaces: { id: string; name: string; newOwner: { id: string; name: string } | null }[];
  /** 멤버로만 있던 Space (올린 사진은 남음) */
  joinedSpaces: number;
};

const ROLE_ORDER = sql`case ${spaceMembers.role} when 'admin' then 0 when 'editor' then 1 else 2 end`;

/**
 * 계정 삭제 계획 (지우기 전에 보여주기·검사용). 본인 탈퇴와 운영자 삭제가 같은 규칙을 쓴다.
 * - 나 혼자인 Space는 함께 지운다. 다른 멤버가 있는 Space의 소유자면 본인 탈퇴는 막고(소유권 이전 먼저),
 *   운영자 삭제는 transferShared로 가장 오래된 관리자 → 참여자 → 보기만 순서의 멤버에게 넘길 수 있다
 */
export async function planAccountDeletion(db: Db, userId: string): Promise<DeletionPlan> {
  const owned = await db
    .select({
      id: spaceMembers.spaceId,
      name: spaces.name,
      members: sql<number>`(select count(*)::int from ${spaceMembers} m where m.space_id = ${spaceMembers.spaceId})`,
    })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(and(eq(spaceMembers.userId, userId), eq(spaceMembers.role, "owner")));
  const sharedSpaces = await Promise.all(
    owned
      .filter((o) => o.members > 1)
      .map(async (o) => {
        const [next] = await db
          .select({ id: userTable.id, name: userTable.name })
          .from(spaceMembers)
          .innerJoin(userTable, eq(userTable.id, spaceMembers.userId))
          .where(and(eq(spaceMembers.spaceId, o.id), ne(spaceMembers.userId, userId)))
          .orderBy(ROLE_ORDER, asc(spaceMembers.joinedAt))
          .limit(1);
        return { id: o.id, name: o.name, newOwner: next ?? null };
      }),
  );
  const [personal] = await db
    .select({ n: sql<number>`count(${assets.id})::int` })
    .from(libraries)
    .leftJoin(assets, eq(assets.libraryId, libraries.id))
    .where(eq(libraries.userId, userId));
  const [joined] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.userId, userId), ne(spaceMembers.role, "owner")));
  return {
    userId,
    personalAssets: personal?.n ?? 0,
    deletedSpaces: owned.filter((o) => o.members <= 1).map(({ id, name }) => ({ id, name })),
    sharedSpaces,
    joinedSpaces: joined?.n ?? 0,
  };
}

/**
 * 계정 삭제 실행: (공유 Space 소유권 이전) → 라이브러리 잠금 → 사진 정리 → 혼자인 Space와 사용자 삭제 → 실시간 연결·R2 정리.
 * 세션·멤버십·구독·신고자 표시 등은 FK(cascade·set null)로 함께 정리된다. 쿠키 지우기는 호출한 쪽(본인 탈퇴)이 한다.
 * transferShared가 아니면 공유 Space 소유자는 409.
 */
export async function deleteAccount(
  env: Env,
  db: Db,
  plan: DeletionPlan,
  opts: { transferShared?: boolean; defer: (p: Promise<unknown>) => void },
) {
  if (plan.sharedSpaces.length && !opts.transferShared) {
    throw new HTTPException(409, {
      message: `‘${plan.sharedSpaces.map((s) => s.name).join("’, ‘")}’의 소유권을 다른 멤버에게 넘긴 뒤 탈퇴할 수 있어요`,
    });
  }
  const userId = plan.userId;
  const deletedIds = plan.deletedSpaces.map((s) => s.id);
  const joinedIds = (
    await db.select({ spaceId: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, userId))
  )
    .map((m) => m.spaceId)
    .filter((id) => !deletedIds.includes(id));

  const { orphanShas } = await db.transaction(async (tx) => {
    for (const s of plan.sharedSpaces) {
      if (!s.newOwner) throw new HTTPException(409, { message: `‘${s.name}’에 소유권을 넘길 멤버가 없어요` });
      await tx
        .update(spaceMembers)
        .set({ role: "owner" })
        .where(and(eq(spaceMembers.spaceId, s.id), eq(spaceMembers.userId, s.newOwner.id)));
    }
    const libIds = (
      await tx
        .select({ id: libraries.id })
        .from(libraries)
        .where(deletedIds.length ? or(eq(libraries.userId, userId), inArray(libraries.spaceId, deletedIds)) : eq(libraries.userId, userId))
    ).map((l) => l.id);
    await lockLibraries(tx, libIds);
    const ids = libIds.length
      ? (await tx.select({ id: assets.id }).from(assets).where(inArray(assets.libraryId, libIds))).map((a) => a.id)
      : [];
    const removed = await removeAssets(tx, ids);
    if (deletedIds.length) await tx.delete(spaces).where(inArray(spaces.id, deletedIds));
    const [u] = await tx.delete(userTable).where(eq(userTable.id, userId)).returning({ email: userTable.email });
    // 운영자에게 들어온 삭제 요청이 있으면 처리됨으로
    if (u) {
      await tx
        .update(deletionRequests)
        .set({ status: "done", handledAt: new Date() })
        .where(and(eq(deletionRequests.email, u.email.toLowerCase()), eq(deletionRequests.status, "open")));
    }
    return removed;
  });
  // 실시간 연결 정리: 지운 Space는 전부, 남는 Space에서는 이 사용자만 (DB를 쓰지 않음)
  for (const id of deletedIds) opts.defer(kickFromHub(env, id));
  for (const id of joinedIds) opts.defer(kickFromHub(env, id, userId));
  await collectGarbage(db, env.MEDIA, orphanShas);
}
