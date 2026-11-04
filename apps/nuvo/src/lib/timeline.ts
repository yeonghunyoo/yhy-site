import type { CloudAsset } from "@nuvo/shared";
import type { LocalItem } from "./local/db";

/** 타임라인 한 칸: nuvo 사진, 이 PC 사진, 또는 둘 다(같은 sha256) */
export interface TItem {
  key: string;
  takenAt: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  cloud?: CloudAsset;
  local?: LocalItem;
}

export type SourceFilter = "all" | "cloud" | "local";

/** 같은 사진(sha256)은 한 칸으로 합친다. 필터는 합친 뒤에 적용 (그래야 "이 PC" 보기에서도 백업 여부가 맞다) */
export function mergeItems(cloud: CloudAsset[], local: LocalItem[], filter: SourceFilter = "all"): TItem[] {
  const bySha = new Map<string, TItem>();
  const out: TItem[] = [];
  for (const a of cloud) {
    const t: TItem = { key: `c:${a.id}`, takenAt: a.takenAt, width: a.width, height: a.height, sha256: a.sha256, cloud: a };
    bySha.set(a.sha256, t);
    out.push(t);
  }
  for (const l of local) {
    const existing = bySha.get(l.sha256);
    if (existing) {
      existing.local ??= l;
      continue;
    }
    const t: TItem = { key: `l:${l.key}`, takenAt: l.takenAt, width: l.width, height: l.height, sha256: l.sha256, local: l };
    bySha.set(l.sha256, t);
    out.push(t);
  }
  const filtered = filter === "all" ? out : out.filter((t) => (filter === "cloud" ? t.cloud : t.local));
  return filtered.sort((a, b) => b.takenAt - a.takenAt);
}

const dayFmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
const monthFmt = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long" });

export function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export type Row =
  | { type: "header"; key: string; label: string; sub: string }
  | { type: "row"; key: string; items: TItem[]; startIndex: number };

/** 날짜별 헤더 + 열 수에 맞춘 행으로 펼친다 (가상 스크롤용) */
export function buildRows(items: TItem[], cols: number): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < items.length) {
    const k = dayKey(items[i]!.takenAt);
    let j = i;
    while (j < items.length && dayKey(items[j]!.takenAt) === k) j++;
    const first = items[i]!.takenAt;
    rows.push({ type: "header", key: `h:${k}`, label: dayFmt.format(first), sub: `${j - i}장` });
    for (let r = i; r < j; r += cols) {
      rows.push({ type: "row", key: `r:${k}:${r}`, items: items.slice(r, Math.min(r + cols, j)), startIndex: r });
    }
    i = j;
  }
  return rows;
}

export const formatMonth = (ms: number) => monthFmt.format(ms);
export const formatDateTime = (ms: number) =>
  new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeStyle: "short" }).format(ms);
