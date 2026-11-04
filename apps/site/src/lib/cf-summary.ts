// Cloudflare GraphQL 응답 → 표시용 합계(순수 함수, 로컬 테스트용으로 분리). 호출은 src/lib/server/cf-analytics.ts
import { r2Class } from './usage-math';

export interface CfUsage {
  fetchedAt: number;
  /** 최근 7일(UTC, 오래된 순) */
  days: string[];
  today: string;
  month: string;
  workersRequests: Record<string, number>;
  workersErrors: Record<string, number>;
  aiNeurons: Record<string, number>;
  aiByModelToday: { model: string; neurons: number }[];
  d1RowsRead: Record<string, number>;
  d1RowsWritten: Record<string, number>;
  kvReads: Record<string, number>;
  kvWrites: Record<string, number>;
  kvOther: Record<string, number>;
  r2ClassAMonth: number;
  r2ClassBMonth: number;
  r2StorageBytes: number;
  r2Objects: number;
  vectorizeQueriedMonth: number;
  vectorizeStoredDims: number;
  vectorizeVectors: number;
}

export type CfResult = { ok: true; usage: CfUsage } | { ok: false; reason: 'no_token' | 'error'; message?: string };

export const utc = (d: Date) => d.toISOString().slice(0, 10);

export type Row<S = Record<string, number>> = { sum?: S; max?: S; dimensions: Record<string, string> };

/** GraphQL 응답 → 표시용 합계. 테스트에서 그대로 쓰려고 분리했다 */
export function summarize(account: Record<string, Row[] | undefined>, now = new Date()): CfUsage {
  const today = utc(now);
  const month = today.slice(0, 7);
  const days = Array.from({ length: 7 }, (_, i) => utc(new Date(now.getTime() - (6 - i) * 86_400_000)));
  const add = (map: Record<string, number>, key: string, n: number) => (map[key] = (map[key] ?? 0) + (n || 0));
  const u: CfUsage = {
    fetchedAt: now.getTime(), days, today, month,
    workersRequests: {}, workersErrors: {}, aiNeurons: {}, aiByModelToday: [], d1RowsRead: {}, d1RowsWritten: {},
    kvReads: {}, kvWrites: {}, kvOther: {}, r2ClassAMonth: 0, r2ClassBMonth: 0, r2StorageBytes: 0, r2Objects: 0,
    vectorizeQueriedMonth: 0, vectorizeStoredDims: 0, vectorizeVectors: 0,
  };
  for (const r of account.workersInvocationsAdaptive ?? []) {
    add(u.workersRequests, r.dimensions.date, r.sum?.requests ?? 0);
    add(u.workersErrors, r.dimensions.date, r.sum?.errors ?? 0);
  }
  const models: Record<string, number> = {};
  for (const r of account.aiInferenceAdaptiveGroups ?? []) {
    add(u.aiNeurons, r.dimensions.date, r.sum?.totalNeurons ?? 0);
    if (r.dimensions.date === today) add(models, r.dimensions.modelId, r.sum?.totalNeurons ?? 0);
  }
  u.aiByModelToday = Object.entries(models).map(([model, neurons]) => ({ model, neurons })).sort((a, b) => b.neurons - a.neurons);
  for (const r of account.d1AnalyticsAdaptiveGroups ?? []) {
    add(u.d1RowsRead, r.dimensions.date, r.sum?.rowsRead ?? 0);
    add(u.d1RowsWritten, r.dimensions.date, r.sum?.rowsWritten ?? 0);
  }
  for (const r of account.kvOperationsAdaptiveGroups ?? []) {
    const t = r.dimensions.actionType;
    add(t === 'read' ? u.kvReads : t === 'write' ? u.kvWrites : u.kvOther, r.dimensions.date, r.sum?.requests ?? 0);
  }
  for (const r of account.r2OperationsAdaptiveGroups ?? []) {
    if (!r.dimensions.date.startsWith(month)) continue;
    const cls = r2Class(r.dimensions.actionType);
    if (cls === 'A') u.r2ClassAMonth += r.sum?.requests ?? 0;
    if (cls === 'B') u.r2ClassBMonth += r.sum?.requests ?? 0;
  }
  // 저장 용량은 버킷마다 가장 최근 날짜의 최댓값
  const latest: Record<string, { date: string; bytes: number; objects: number }> = {};
  for (const r of account.r2StorageAdaptiveGroups ?? []) {
    const prev = latest[r.dimensions.bucketName];
    if (!prev || r.dimensions.date >= prev.date) {
      latest[r.dimensions.bucketName] = { date: r.dimensions.date, bytes: (r.max?.payloadSize ?? 0) + (r.max?.metadataSize ?? 0), objects: r.max?.objectCount ?? 0 };
    }
  }
  for (const b of Object.values(latest)) {
    u.r2StorageBytes += b.bytes;
    u.r2Objects += b.objects;
  }
  for (const r of account.vectorizeV2QueriesAdaptiveGroups ?? []) {
    if (r.dimensions.date.startsWith(month)) u.vectorizeQueriedMonth += r.sum?.queriedVectorDimensions ?? 0;
  }
  const vec = [...(account.vectorizeV2StorageAdaptiveGroups ?? [])].sort((a, b) => a.dimensions.date.localeCompare(b.dimensions.date)).pop();
  u.vectorizeStoredDims = vec?.max?.storedVectorDimensions ?? 0;
  u.vectorizeVectors = vec?.max?.vectorCount ?? 0;
  return u;
}

