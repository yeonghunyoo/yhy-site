import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ───────────── Better Auth 코어 테이블 (컬럼 이름은 Better Auth 규약) ───────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Better Auth 요청 수 제한 (운영에서만 사용). 로그인·가입·메일 발송 남용 방지 */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/* ───────────── nuvo 도메인 ───────────── */

/** 물리 파일 1개 (내용 주소: sha256). 여러 Asset이 같은 Blob을 가리킨다. */
export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sha256: text("sha256").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    width: integer("width"),
    height: integer("height"),
    /** 이 Blob을 가리키는 Asset 수. 0이 되면 R2 객체 삭제. */
    refCount: integer("ref_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("blobs_sha256_uq").on(t.sha256)],
);

export const spaces = pgTable("spaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const spaceRole = pgEnum("space_role", ["owner", "admin", "editor", "viewer"]);

export const spaceMembers = pgTable(
  "space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: spaceRole("role").notNull(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.userId] }), index("space_members_user_idx").on(t.userId)],
);

export const libraryType = pgEnum("library_type", ["personal", "space"]);

/** 사진 보관소: 개인(userId) 또는 Space 공동(spaceId). 용량은 라이브러리 단위. */
export const libraries = pgTable(
  "libraries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: libraryType("type").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, { onDelete: "cascade" }),
    quotaBytes: bigint("quota_bytes", { mode: "number" }).notNull(),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("libraries_user_uq").on(t.userId), uniqueIndex("libraries_space_uq").on(t.spaceId)],
);

/** 라이브러리 안의 사진 1장 */
export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    blobId: uuid("blob_id")
      .notNull()
      .references(() => blobs.id),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    filename: text("filename"),
    /** 촬영 시각 (없으면 파일 수정 시각) */
    takenAt: ts("taken_at").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    camera: text("camera"),
    /** 유사 이미지 탐지용 64bit dHash (hex 16자) */
    dhash: text("dhash"),
    blurhash: text("blurhash"),
    caption: text("caption"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("assets_library_blob_uq").on(t.libraryId, t.blobId),
    index("assets_library_taken_idx").on(t.libraryId, t.takenAt, t.id),
  ],
);

export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  spaceId: uuid("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  role: spaceRole("role").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  expiresAt: ts("expires_at").notNull(),
  maxUses: integer("max_uses").notNull().default(10),
  uses: integer("uses").notNull().default(0),
  createdAt: createdAt(),
});

export const activityType = pgEnum("activity_type", ["assets_added", "member_joined", "member_left", "assets_removed"]);

/** Space 피드: "엄마가 사진 12장을 추가했어요" */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: activityType("type").notNull(),
    /** assets_added: { count, assetIds(앞 몇 개) } */
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activities_space_idx").on(t.spaceId, t.createdAt)],
);

/**
 * R2 정리 대기열. 두 경우에 행이 생긴다.
 * - 원본을 올렸지만 아직 완료(/complete)하지 않은 업로드: owner = 사용자 id, bytes = 크기 (대기 용량 계산에도 씀)
 * - 참조가 0이 되어 지운 Blob: owner = "-"
 * due_at 이 지난 뒤에도 Blob 행이 없고 기다리는 업로드도 없으면 R2 객체를 지운다 (worker/lib/gc.ts).
 */
export const r2Gc = pgTable(
  "r2_gc",
  {
    sha256: text("sha256").notNull(),
    owner: text("owner").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    dueAt: ts("due_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sha256, t.owner] }), index("r2_gc_due_idx").on(t.dueAt)],
);

/**
 * 사용량 카운터(일·월 상한). 키 = budget:{이름}:{YYYY-MM-DD | YYYY-MM} (KST). worker/lib/usage.ts
 * 하루에 몇 행만 생겨서 지우지 않는다. expires_at이 지난 행은 0으로 본다.
 */
export const usageCounter = pgTable("usage_counter", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
});
