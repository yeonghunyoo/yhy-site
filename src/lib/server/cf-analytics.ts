import { env } from 'cloudflare:workers';
import { summarize, utc, type CfResult, type Row } from '../cf-summary';

export type { CfResult, CfUsage } from '../cf-summary';

// Cloudflare 사용량(GraphQL 분석 API) — /admin/usage(docs/guides/cost-guard.md "4. 사용량 대시보드").
// 운영에는 분석 읽기 전용 토큰 CF_ANALYTICS_TOKEN과 CF_ACCOUNT_ID가 필요하다(배포 토큰을 쓰지 않는다).
// 날짜는 UTC(Cloudflare 무료 한도가 UTC 자정에 다시 찬다). 결과는 isolate마다 5분 캐시하고 KV에 쓰지 않는다.

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const TTL_MS = 5 * 60 * 1000;

const QUERY = `query($a:String!,$s:Date!,$e:Date!){viewer{accounts(filter:{accountTag:$a}){
workersInvocationsAdaptive(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{requests errors} dimensions{date}}
aiInferenceAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{totalNeurons} dimensions{date modelId}}
d1AnalyticsAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{rowsRead rowsWritten} dimensions{date}}
kvOperationsAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{requests} dimensions{date actionType}}
r2OperationsAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{requests} dimensions{date actionType}}
r2StorageAdaptiveGroups(limit:100,filter:{date_geq:$s,date_leq:$e}){max{payloadSize metadataSize objectCount} dimensions{date bucketName}}
vectorizeV2QueriesAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){sum{queriedVectorDimensions} dimensions{date}}
vectorizeV2StorageAdaptiveGroups(limit:1000,filter:{date_geq:$s,date_leq:$e}){max{storedVectorDimensions vectorCount} dimensions{date}}
}}}`;

let cache: { at: number; result: CfResult } | null = null;

export async function cloudflareUsage(fresh = false): Promise<CfResult> {
  const token = (env as unknown as Record<string, string | undefined>).CF_ANALYTICS_TOKEN;
  const account = (env as unknown as Record<string, string | undefined>).CF_ACCOUNT_ID;
  if (!token || !account) return { ok: false, reason: 'no_token' };
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.result;

  const now = new Date();
  const start = new Date(Math.min(Date.parse(`${utc(now).slice(0, 7)}-01T00:00:00Z`), now.getTime() - 6 * 86_400_000));
  let result: CfResult;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { a: account, s: utc(start), e: utc(now) } }),
    });
    const body = (await res.json()) as { data?: { viewer?: { accounts?: Record<string, Row[]>[] } }; errors?: { message: string }[] };
    const acc = body.data?.viewer?.accounts?.[0];
    result = acc ? { ok: true, usage: summarize(acc, now) } : { ok: false, reason: 'error', message: body.errors?.map((e) => e.message).join('; ').slice(0, 200) ?? `HTTP ${res.status}` };
  } catch (error) {
    result = { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  cache = { at: Date.now(), result };
  return result;
}
