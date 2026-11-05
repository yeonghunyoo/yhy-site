import { validate } from "../lib/validate";
import { activities, assets, blobs, invites, libraries, spaceBlocks, spaceMembers, spaces, user as userTable } from "@nuvo/db";
import { InviteCreateInput, MemberRoleInput, SpaceNameInput, roleAtLeast, type Activity } from "@nuvo/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { requireUser, type AppEnv } from "../context";
import { requireSpaceRole } from "../lib/access";
import { billingOwner, ownerUsage } from "../lib/capacity";
import { requireSubscriber, subscriptionOf } from "../lib/subscription";
import { openReportCount } from "./reports";
import { kickFromHub, lockLibraries, notifyHub, recordSpaceActivity, removeAssets } from "../lib/assets";
import { collectGarbage, type Tx } from "../lib/gc";
import { HUB_USER_HEADER } from "../hub";
import { randomToken, signMediaUrl } from "../lib/sign";

const INVITE_TTL_DAYS = 7;

/** 이 Space의 멤버 행을 모두 잠그고 역할을 읽는다 (역할 변경·내보내기를 한 줄로 세움) */
async function lockMemberRoles(tx: Tx, spaceId: string) {
  const rows = await tx
    .select({ userId: spaceMembers.userId, role: spaceMembers.role })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId))
    .for("update");
  return new Map(rows.map((r) => [r.userId, r.role]));
}

async function spaceLibrary(c: { var: AppEnv["Variables"] }, spaceId: string) {
  const [lib] = await c.var.db.select().from(libraries).where(eq(libraries.spaceId, spaceId)).limit(1);
  if (!lib) throw new HTTPException(404, { message: "Space를 찾을 수 없어요" });
  return lib;
}

export const spaceRoutes = new Hono<AppEnv>()
  .post("/", validate("json", SpaceNameInput), async (c) => {
    const user = requireUser(c);
    const { name } = c.req.valid("json");
    // Space 만들기는 구독자만 (초대받은 가족은 구독 없이 보기·올리기, docs/decisions.md D-016)
    await requireSubscriber(c.var.db, user.id);
    const out = await c.var.db.transaction(async (tx) => {
      const [s] = await tx.insert(spaces).values({ name, createdBy: user.id }).returning();
      await tx.insert(spaceMembers).values({ spaceId: s!.id, userId: user.id, role: "owner" });
      const [lib] = await tx
        .insert(libraries)
        // Space는 별도 용량이 없다(0). 소유자의 개인 용량에서 차감한다 (worker/lib/capacity.ts)
        .values({ type: "space", spaceId: s!.id, quotaBytes: 0 })
        .returning();
      return { id: s!.id, name: s!.name, libraryId: lib!.id };
    });
    return c.json(out, 201);
  })

  .get("/:id", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    const myRole = await requireSpaceRole(c.var.db, user.id, spaceId, "viewer");
    const [s] = await c.var.db.select().from(spaces).where(eq(spaces.id, spaceId));
    const lib = await spaceLibrary(c, spaceId);
    const members = await c.var.db
      .select({ id: userTable.id, name: userTable.name, image: userTable.image, role: spaceMembers.role })
      .from(spaceMembers)
      .innerJoin(userTable, eq(userTable.id, spaceMembers.userId))
      .where(eq(spaceMembers.spaceId, spaceId))
      .orderBy(spaceMembers.joinedAt);
    const owner = await billingOwner(c.var.db, lib);
    const usage = owner ? await ownerUsage(c.var.db, owner) : { usedBytes: lib.usedBytes, quotaBytes: 0 };
    return c.json({
      id: s!.id,
      name: s!.name,
      myRole,
      // 용량은 소유자 것 (개인 + 소유 Space 합). 소유자 구독이 끝나면 올리기가 막히니 화면이 알 수 있게 함께 준다
      library: { id: lib.id, type: "space" as const, usedBytes: usage.usedBytes, quotaBytes: usage.quotaBytes, ownBytes: lib.usedBytes },
      ownerSubscribed: owner ? (await subscriptionOf(c.var.db, owner)).active : false,
      // 관리자에게만: 처리 안 된 신고 수
      openReports: roleAtLeast(myRole, "admin") ? await openReportCount(c.var.db, spaceId) : 0,
      members,
    });
  })

  .patch("/:id", validate("json", SpaceNameInput), async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "admin");
    await c.var.db.update(spaces).set({ name: c.req.valid("json").name }).where(eq(spaces.id, spaceId));
    return c.json({ ok: true });
  })

  /** Space 삭제 (소유자만). 사진의 Blob 참조를 정리한 뒤 삭제한다. */
  .delete("/:id", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "owner");
    const lib = await spaceLibrary(c, spaceId);
    // 한 트랜잭션에서: 라이브러리를 잠가 새 업로드를 막고 → 사진 정리 → Space 삭제
    const { orphanShas } = await c.var.db.transaction(async (tx) => {
      await lockLibraries(tx, [lib.id]);
      const ids = (await tx.select({ id: assets.id }).from(assets).where(eq(assets.libraryId, lib.id))).map((r) => r.id);
      const removed = await removeAssets(tx, ids);
      await tx.delete(spaces).where(eq(spaces.id, spaceId));
      return removed;
    });
    c.executionCtx.waitUntil(kickFromHub(c.env, spaceId));
    await collectGarbage(c.var.db, c.env.MEDIA, orphanShas);
    return c.json({ ok: true });
  })

  .post("/:id/invites", validate("json", InviteCreateInput), async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "admin");
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400_000);
    await c.var.db.insert(invites).values({ token, spaceId, role: c.req.valid("json").role, createdBy: user.id, expiresAt });
    return c.json({ token, path: `/invite/${token}`, expiresAt: expiresAt.getTime() }, 201);
  })

  /** 역할 변경. owner 지정 = 소유권 이전 (기존 소유자는 admin이 된다) */
  .patch("/:id/members/:userId", validate("json", MemberRoleInput), async (c) => {
    const user = requireUser(c);
    const { id: spaceId, userId } = c.req.param();
    const { role } = c.req.valid("json");
    await requireSpaceRole(c.var.db, user.id, spaceId, "admin");

    await c.var.db.transaction(async (tx) => {
      // 멤버 행을 잠근 뒤 역할을 다시 읽는다 → 동시에 두 번 소유권을 넘겨도 소유자는 한 명
      const roles = await lockMemberRoles(tx, spaceId);
      const myRole = roles.get(user.id);
      const targetRole = roles.get(userId);
      if (!myRole || !roleAtLeast(myRole, "admin")) throw new HTTPException(403, { message: "권한이 없어요" });
      if (!targetRole) throw new HTTPException(404, { message: "멤버를 찾을 수 없어요" });
      if (userId === user.id) throw new HTTPException(400, { message: "내 역할은 직접 바꿀 수 없어요" });
      if (targetRole === "owner") throw new HTTPException(403, { message: "소유자의 역할은 바꿀 수 없어요" });
      // 관리자를 지정하거나, 관리자의 역할을 바꾸는 것은 소유자만 (관리자끼리 강등 후 내보내기 방지)
      if ((role === "owner" || role === "admin" || targetRole === "admin") && myRole !== "owner")
        throw new HTTPException(403, { message: "관리자 역할은 소유자만 바꿀 수 있어요" });

      if (role === "owner") {
        await tx
          .update(spaceMembers)
          .set({ role: "admin" })
          .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, user.id)));
      }
      await tx
        .update(spaceMembers)
        .set({ role })
        .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
    });
    c.executionCtx.waitUntil(notifyHub(c.env, spaceId, { type: "members_changed" }));
    return c.json({ ok: true });
  })

  /**
   * 내보내기(admin+) 또는 나가기(본인). 기본 정책: 올린 사진은 Space에 남는다.
   * ?removePhotos=1 이면 그 사람이 올린 사진도 함께 삭제.
   * ?block=1 이면 내보내면서 차단 — 초대 링크로 다시 들어올 수 없다 (docs/work-plan.md ⑤). 본인 나가기에는 쓸 수 없다
   */
  .delete(
    "/:id/members/:userId",
    validate("query", z.object({ removePhotos: z.literal("1").optional(), block: z.literal("1").optional() })),
    async (c) => {
      const user = requireUser(c);
      const { id: spaceId, userId } = c.req.param();
      const self = userId === user.id;
      await requireSpaceRole(c.var.db, user.id, spaceId, "viewer");
      const removePhotos = c.req.valid("query").removePhotos === "1";
      const block = c.req.valid("query").block === "1";
      if (block && self) throw new HTTPException(400, { message: "자기 자신은 차단할 수 없어요" });
      const lib = await spaceLibrary(c, spaceId);

      const { orphanShas } = await c.var.db.transaction(async (tx) => {
        const roles = await lockMemberRoles(tx, spaceId);
        const myRole = roles.get(user.id);
        const targetRole = roles.get(userId);
        if (!myRole) throw new HTTPException(404, { message: "Space를 찾을 수 없어요" });
        if (!targetRole) throw new HTTPException(404, { message: "멤버를 찾을 수 없어요" });
        if (!self && !roleAtLeast(myRole, "admin")) throw new HTTPException(403, { message: "권한이 없어요" });
        if (targetRole === "owner")
          throw new HTTPException(400, { message: "소유자는 나가기 전에 다른 멤버에게 소유권을 넘겨야 해요" });
        if (!self && targetRole === "admin" && myRole !== "owner")
          throw new HTTPException(403, { message: "관리자는 소유자만 내보낼 수 있어요" });

        let removed = { orphanShas: [] as string[] };
        if (removePhotos) {
          const ids = (
            await tx
              .select({ id: assets.id })
              .from(assets)
              .where(and(eq(assets.libraryId, lib.id), eq(assets.uploadedBy, userId)))
          ).map((r) => r.id);
          removed = await removeAssets(tx, ids);
        }
        await tx.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)));
        if (block) await tx.insert(spaceBlocks).values({ spaceId, userId, blockedBy: user.id }).onConflictDoNothing();
        return removed;
      });
      // 내보낸 사람의 실시간 연결을 끊는다 (연결할 때만 권한을 확인하므로)
      c.executionCtx.waitUntil(kickFromHub(c.env, spaceId, userId));
      await collectGarbage(c.var.db, c.env.MEDIA, orphanShas);

      const [target] = await c.var.db.select({ id: userTable.id, name: userTable.name }).from(userTable).where(eq(userTable.id, userId));
      await recordSpaceActivity(c.env, c.var.db, spaceId, target ?? user, "member_left", {}, { type: "members_changed" });
      return c.json({ ok: true });
    },
  )

  /** 관리자(admin+): 차단 목록 */
  .get("/:id/blocks", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "admin");
    const rows = await c.var.db
      .select({ id: spaceBlocks.userId, name: userTable.name, createdAt: spaceBlocks.createdAt })
      .from(spaceBlocks)
      .innerJoin(userTable, eq(userTable.id, spaceBlocks.userId))
      .where(eq(spaceBlocks.spaceId, spaceId))
      .orderBy(desc(spaceBlocks.createdAt));
    return c.json({ blocks: rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() })) });
  })

  /** 관리자(admin+): 차단 풀기 (다시 초대할 수 있게) */
  .delete("/:id/blocks/:userId", async (c) => {
    const user = requireUser(c);
    const { id: spaceId, userId } = c.req.param();
    await requireSpaceRole(c.var.db, user.id, spaceId, "admin");
    await c.var.db.delete(spaceBlocks).where(and(eq(spaceBlocks.spaceId, spaceId), eq(spaceBlocks.userId, userId)));
    return c.json({ ok: true });
  })

  .get("/:id/activities", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "viewer");
    const rows = await c.var.db
      .select({
        id: activities.id,
        type: activities.type,
        actorId: activities.actorId,
        actorName: userTable.name,
        data: activities.data,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .leftJoin(userTable, eq(userTable.id, activities.actorId))
      .where(eq(activities.spaceId, spaceId))
      .orderBy(desc(activities.createdAt))
      .limit(40);
    // 피드에 남은 썸네일 중 지금도 이 Space에 있는 사진만 보여준다 (지운 사진이 피드로 새지 않게)
    const shasOf = (d: Record<string, unknown>) =>
      Array.isArray(d.shas) ? (d.shas as unknown[]).filter((x): x is string => typeof x === "string") : [];
    const all = [...new Set(rows.flatMap((r) => shasOf(r.data)))];
    const lib = await spaceLibrary(c, spaceId);
    const present = new Set(
      all.length
        ? (
            await c.var.db
              .select({ sha256: blobs.sha256 })
              .from(assets)
              .innerJoin(blobs, eq(blobs.id, assets.blobId))
              .where(and(eq(assets.libraryId, lib.id), inArray(blobs.sha256, all)))
          ).map((r) => r.sha256)
        : [],
    );
    const out: Activity[] = await Promise.all(
      rows.map(async (r) => {
        const shas = shasOf(r.data).filter((s) => present.has(s));
        return {
          id: r.id,
          type: r.type,
          actorId: r.actorId,
          actorName: r.actorName,
          createdAt: r.createdAt.getTime(),
          data: {
            count: typeof r.data.count === "number" ? r.data.count : undefined,
            thumbs: await Promise.all(shas.map((s) => signMediaUrl(c.env.MEDIA_SIGNING_KEY, s, "512"))),
          },
        };
      }),
    );
    return c.json({ activities: out });
  })

  /** 실시간 연결 (WebSocket) → Space별 Durable Object */
  .get("/:id/live", async (c) => {
    const user = requireUser(c);
    const spaceId = c.req.param("id");
    await requireSpaceRole(c.var.db, user.id, spaceId, "viewer");
    if (c.req.header("upgrade") !== "websocket") throw new HTTPException(426, { message: "websocket only" });
    const stub = c.env.SPACE_HUB.get(c.env.SPACE_HUB.idFromName(spaceId));
    // 허브가 연결에 사용자 id를 붙여 두었다가, 내보낼 때 그 사람 연결만 끊는다 (클라이언트가 보낸 값은 덮어씀)
    const headers = new Headers(c.req.raw.headers);
    headers.set(HUB_USER_HEADER, user.id);
    return stub.fetch(new Request(c.req.raw.url, { headers }));
  });

export const inviteRoutes = new Hono<AppEnv>()
  /** 초대 미리보기 (로그인 전에도 볼 수 있음, 최소 정보만) */
  .get("/:token", async (c) => {
    const token = c.req.param("token");
    const [inv] = await c.var.db
      .select({
        spaceId: invites.spaceId,
        role: invites.role,
        expiresAt: invites.expiresAt,
        uses: invites.uses,
        maxUses: invites.maxUses,
        spaceName: spaces.name,
        inviterName: userTable.name,
        memberCount: sql<number>`(select count(*)::int from ${spaceMembers} m where m.space_id = ${invites.spaceId})`,
      })
      .from(invites)
      .innerJoin(spaces, eq(spaces.id, invites.spaceId))
      .leftJoin(userTable, eq(userTable.id, invites.createdBy))
      .where(eq(invites.token, token));
    if (!inv) throw new HTTPException(404, { message: "초대 링크를 찾을 수 없어요" });
    const valid = inv.expiresAt.getTime() > Date.now() && inv.uses < inv.maxUses;
    const user = c.var.user;
    let alreadyMember = false;
    if (user) {
      const [m] = await c.var.db
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, inv.spaceId), eq(spaceMembers.userId, user.id)));
      alreadyMember = Boolean(m);
    }
    return c.json({
      spaceId: alreadyMember ? inv.spaceId : null,
      spaceName: inv.spaceName,
      inviterName: inv.inviterName,
      role: inv.role,
      memberCount: inv.memberCount,
      valid,
      alreadyMember,
    });
  })

  .post("/:token/accept", async (c) => {
    const user = requireUser(c);
    const token = c.req.param("token");
    const db = c.var.db;
    const result = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invites).where(eq(invites.token, token)).for("update");
      if (!inv) throw new HTTPException(404, { message: "초대 링크를 찾을 수 없어요" });
      const [m] = await tx
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, inv.spaceId), eq(spaceMembers.userId, user.id)));
      if (m) return { spaceId: inv.spaceId, joined: false };
      if (inv.expiresAt.getTime() < Date.now() || inv.uses >= inv.maxUses)
        throw new HTTPException(410, { message: "만료된 초대 링크예요" });
      // 차단된 사람은 링크가 유효해도 들어올 수 없다
      const [blocked] = await tx
        .select({ userId: spaceBlocks.userId })
        .from(spaceBlocks)
        .where(and(eq(spaceBlocks.spaceId, inv.spaceId), eq(spaceBlocks.userId, user.id)))
        .limit(1);
      if (blocked) throw new HTTPException(403, { message: "이 Space에는 참여할 수 없어요" });
      await tx.insert(spaceMembers).values({ spaceId: inv.spaceId, userId: user.id, role: inv.role });
      await tx.update(invites).set({ uses: sql`${invites.uses} + 1` }).where(eq(invites.token, token));
      return { spaceId: inv.spaceId, joined: true };
    });
    if (result.joined) {
      await recordSpaceActivity(c.env, db, result.spaceId, user, "member_joined", {}, { type: "members_changed" });
    }
    return c.json(result);
  });
