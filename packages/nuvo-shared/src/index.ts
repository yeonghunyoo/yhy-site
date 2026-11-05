import { z } from "zod";

/* ───────── 역할 ───────── */

export const SpaceRole = z.enum(["owner", "admin", "editor", "viewer"]);
export type SpaceRole = z.infer<typeof SpaceRole>;

const RANK: Record<SpaceRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };
export const roleAtLeast = (role: SpaceRole | null | undefined, min: SpaceRole) =>
  role != null && RANK[role] >= RANK[min];

export const ROLE_LABEL: Record<SpaceRole, string> = {
  owner: "소유자",
  admin: "관리자",
  editor: "참여자",
  viewer: "보기만",
};

/* ───────── 미디어 ───────── */

export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);

/** 썸네일 변형 (긴 변 px). 512 = 그리드, 2048 = 보기 화면. o = 원본 */
export const THUMB_SIZES = [512, 2048] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];
export type MediaVariant = "o" | `${ThumbSize}`;

/** MVP 지원 이미지 형식 */
export const SUPPORTED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "image/avif"];
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // Worker 요청 본문 한도
export const MAX_THUMB_BYTES = 4 * 1024 * 1024;

export const isSupportedImage = (name: string, mime: string) =>
  SUPPORTED_MIME.includes(mime.toLowerCase()) || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(name);

/** 확장자로 MIME 보정 (브라우저가 HEIC를 빈 문자열로 주는 경우가 많다) */
export function guessMime(name: string, mime: string) {
  if (mime) return mime.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

/* ───────── 업로드 ───────── */

const ImageMime = z.string().refine((m) => SUPPORTED_MIME.includes(m.toLowerCase()), "지원하지 않는 형식");

export const UploadFileInfo = z.object({
  sha256: Sha256Hex,
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  mime: ImageMime,
});

export const UploadPrepareRequest = z.object({
  libraryId: z.string().uuid(),
  files: z.array(UploadFileInfo).min(1).max(200),
});
export type UploadPrepareRequest = z.infer<typeof UploadPrepareRequest>;

/** skip: 이미 이 라이브러리에 있음 / link: 업로드 없이 연결 가능 / upload: 원본 업로드 필요 */
export type UploadAction =
  | { sha256: string; action: "skip"; assetId: string }
  | { sha256: string; action: "link" }
  | { sha256: string; action: "upload" };

export const AssetMeta = z.object({
  sha256: Sha256Hex,
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  mime: ImageMime,
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  filename: z.string().max(255).nullable(),
  takenAt: z.number().int(), // epoch ms
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  camera: z.string().max(120).nullable(),
  dhash: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  blurhash: z.string().max(120).nullable(),
  /** 원본 업로드 시 서버가 준 영수증. link 항목은 생략. */
  receipt: z.string().max(200).optional(),
});
export type AssetMeta = z.infer<typeof AssetMeta>;

export const UploadCompleteRequest = z.object({
  libraryId: z.string().uuid(),
  items: z.array(AssetMeta).min(1).max(200),
});
export type UploadCompleteRequest = z.infer<typeof UploadCompleteRequest>;

/* ───────── 응답 타입 ───────── */

export interface LibraryInfo {
  id: string;
  type: "personal" | "space";
  usedBytes: number;
  quotaBytes: number;
}

export interface CloudAsset {
  id: string;
  libraryId: string;
  sha256: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  filename: string | null;
  takenAt: number;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  dhash: string | null;
  blurhash: string | null;
  uploadedBy: string | null;
  urls: { thumb: string; display: string; original: string };
}

export interface SpaceSummary {
  id: string;
  name: string;
  role: SpaceRole;
  libraryId: string;
  memberCount: number;
  assetCount: number;
  cover: string | null;
}

export interface Member {
  id: string;
  name: string;
  image: string | null;
  role: SpaceRole;
}

export interface Activity {
  id: string;
  type: "assets_added" | "member_joined" | "member_left" | "assets_removed";
  actorId: string | null;
  actorName: string | null;
  data: { count?: number; thumbs?: string[] };
  createdAt: number;
}

/** Space 실시간 이벤트 (WebSocket) */
export type HubEvent =
  | { type: "assets_changed"; actorId: string; actorName: string; count: number; action: "added" | "removed" }
  | { type: "members_changed" }
  /** 내가 Space에서 빠졌거나 Space가 삭제됨. 이어서 연결이 끊긴다 (종료 코드 4403). */
  | { type: "removed" };

export const SpaceNameInput = z.object({ name: z.string().trim().min(1).max(40) });
export const InviteCreateInput = z.object({ role: z.enum(["editor", "viewer"]).default("editor") });
export const MemberRoleInput = z.object({ role: SpaceRole });

/** 신고 사유 (docs/work-plan.md ⑤). child_safety는 운영자가 가장 먼저 본다 */
export const ReportReason = z.enum(["inappropriate", "privacy", "harassment", "child_safety", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  inappropriate: "부적절한 사진",
  privacy: "내 사진·개인정보가 동의 없이 올라감",
  harassment: "괴롭힘·불쾌한 행동",
  child_safety: "아동 안전 문제",
  other: "기타",
};
/** 사진 또는 멤버 중 하나는 있어야 한다 */
export const ReportInput = z
  .object({
    assetId: z.string().uuid().optional(),
    userId: z.string().min(1).max(64).optional(),
    reason: ReportReason,
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.assetId || v.userId, { message: "신고할 사진이나 멤버를 골라 주세요" });
export const ReportResolveInput = z.object({ status: z.enum(["resolved", "dismissed"]) });
export type SpaceReport = {
  id: string;
  reason: ReportReason;
  note: string | null;
  status: "open" | "resolved" | "dismissed";
  reporterName: string | null;
  targetUserId: string | null;
  targetName: string | null;
  assetId: string | null;
  thumb: string | null;
  createdAt: number;
};
export const CopyAssetsInput = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(500),
  targetLibraryId: z.string().uuid(),
});
export const BackupStatusInput = z.object({ sha256s: z.array(Sha256Hex).min(1).max(1000) });

/* ───────── 유틸 ───────── */

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
