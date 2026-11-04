import { libraries, spaceMembers, type Db } from "@nuvo/db";
import { roleAtLeast, type SpaceRole } from "@nuvo/shared";
import { and, eq, isNotNull, or, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

export type LibraryRow = typeof libraries.$inferSelect;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 잘못된 형식의 id가 Postgres uuid 컬럼까지 가서 500이 나지 않게 */
export const isUuid = (s: string) => UUID_RE.test(s);

/** 라이브러리에 대한 내 역할. 개인 라이브러리 주인은 owner. */
export async function libraryAccess(db: Db, userId: string, libraryId: string) {
  if (!isUuid(libraryId)) return { lib: null, role: null as SpaceRole | null };
  const [lib] = await db.select().from(libraries).where(eq(libraries.id, libraryId)).limit(1);
  if (!lib) return { lib: null, role: null as SpaceRole | null };
  if (lib.type === "personal") return { lib, role: lib.userId === userId ? ("owner" as const) : null };
  const [m] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, lib.spaceId!), eq(spaceMembers.userId, userId)))
    .limit(1);
  return { lib, role: m?.role ?? null };
}

export async function requireLibrary(db: Db, userId: string, libraryId: string, min: SpaceRole) {
  const { lib, role } = await libraryAccess(db, userId, libraryId);
  if (!lib || !role) throw new HTTPException(404, { message: "라이브러리를 찾을 수 없어요" });
  if (!roleAtLeast(role, min)) throw new HTTPException(403, { message: "권한이 없어요" });
  return { lib, role };
}

/** 내가 접근할 수 있는 모든 라이브러리 id (개인 + 가입한 Space) */
export async function accessibleLibraryIds(db: Db, userId: string) {
  const mySpaces = db.select({ id: spaceMembers.spaceId }).from(spaceMembers).where(eq(spaceMembers.userId, userId));
  const rows = await db
    .select({ id: libraries.id })
    .from(libraries)
    .where(or(eq(libraries.userId, userId), and(isNotNull(libraries.spaceId), inArray(libraries.spaceId, mySpaces))));
  return rows.map((r) => r.id);
}

export async function requireSpaceRole(db: Db, userId: string, spaceId: string, min: SpaceRole) {
  if (!isUuid(spaceId)) throw new HTTPException(404, { message: "Space를 찾을 수 없어요" });
  const [m] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1);
  if (!m) throw new HTTPException(404, { message: "Space를 찾을 수 없어요" });
  if (!roleAtLeast(m.role, min)) throw new HTTPException(403, { message: "권한이 없어요" });
  return m.role;
}
