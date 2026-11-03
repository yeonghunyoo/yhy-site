import { env } from 'cloudflare:workers';
import { count, gte, sql } from 'drizzle-orm';
import { chatLogs, letters } from '../../db/schema';
import { capFrom, DEFAULT_CAPS, estimateNeurons, usageLevel, type Level } from '../usage-math';
import { getDb } from './db';
import { kstDate, kstDayStart } from './dates';
import { notify } from './notify';

// 사이트 전체 일일 상한(과금 폭탄 차단기) — docs/guides/cost-guard.md.
// 챗·레터 집계는 이미 쓰는 D1 로그에서 센다(KV 쓰기 없음). 메일만 KV 일·월 카운터(보낸 메일 1통당 쓰기 2회).
// 결과는 isolate마다 잠깐 캐시해 매 요청 D1을 훑지 않는다.

type Env = Record<string, string | undefined>;
const e = () => env as unknown as Env;

export function caps() {
  return {
    aiNeuronsDay: capFrom(e().AI_DAILY_NEURON_CAP, DEFAULT_CAPS.aiNeuronsDay),
    chatTurnsDay: capFrom(e().CHAT_DAILY_TURN_CAP, DEFAULT_CAPS.chatTurnsDay),
    mailDay: capFrom(e().MAIL_DAILY_CAP, DEFAULT_CAPS.mailDay),
    mailMonth: capFrom(e().MAIL_MONTHLY_CAP, DEFAULT_CAPS.mailMonth),
    lettersDay: capFrom(e().LETTER_DAILY_CAP, DEFAULT_CAPS.lettersDay),
    chatTokensMonth: capFrom(e().CHAT_MONTHLY_TOKEN_CAP, 2_000_000),
  };
}

export const killed = (name: 'KILL_LOGIN_MAIL' | 'KILL_LETTERS') => e()[name] === '1';

const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, fresh = false): Promise<T> {
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const monthStart = (day: string) => kstDayStart(`${day.slice(0, 7)}-01`);

/** 오늘(KST) 사이트 전체 챗: 턴 수, 토큰, 추정 뉴런 */
export function chatToday(fresh = false) {
  const day = kstDate(new Date());
  return cached(`chat:${day}`, 30_000, async () => {
    const row = await getDb()
      .select({ turns: count(), tin: sql<number>`coalesce(sum(${chatLogs.tokensIn}), 0)`, tout: sql<number>`coalesce(sum(${chatLogs.tokensOut}), 0)` })
      .from(chatLogs)
      .where(gte(chatLogs.createdAt, kstDayStart(day)))
      .get();
    const turns = row?.turns ?? 0;
    const tin = Number(row?.tin ?? 0);
    const tout = Number(row?.tout ?? 0);
    return { day, turns, tokens: tin + tout, neurons: estimateNeurons(turns, tin, tout) };
  }, fresh);
}

/** 이번 달(KST) 챗 토큰 합계 — 기존 KV `chat:month:*` 누계를 대신한다 */
export function chatMonthTokens(fresh = false) {
  const day = kstDate(new Date());
  return cached(`chat-month:${day.slice(0, 7)}`, 60_000, async () => {
    const row = await getDb()
      .select({ tokens: sql<number>`coalesce(sum(${chatLogs.tokensIn} + ${chatLogs.tokensOut}), 0)` })
      .from(chatLogs)
      .where(gte(chatLogs.createdAt, monthStart(day)))
      .get();
    return Number(row?.tokens ?? 0);
  }, fresh);
}

/** 오늘(KST) 사이트 전체 레터 수 */
export function lettersToday(fresh = false) {
  const day = kstDate(new Date());
  return cached(`letters:${day}`, 30_000, async () => {
    const row = await getDb().select({ n: count() }).from(letters).where(gte(letters.createdAt, kstDayStart(day))).get();
    return row?.n ?? 0;
  }, fresh);
}

/** 80%·100% 알림은 종류·단계마다 하루 1번(KV 플래그 1회 쓰기) */
async function alertOnce(kind: string, level: Level, text: string) {
  if (level === 'ok') return;
  const key = `budget:alert:${kstDate(new Date())}:${kind}:${level}`;
  if (await env.KV.get(key)) return;
  await env.KV.put(key, '1', { expirationTtl: 60 * 60 * 26 });
  notify(level === 'over' ? `🧯 차단기 작동: ${text}` : `⚠️ 사용량 80%: ${text}`);
}

export type ChatGate = { ok: true } | { ok: false; reason: 'neurons' | 'turns' | 'tokens' };

/** 챗 1턴을 시작해도 되는지. 넘으면 고정 응답으로 끝내고 AI를 부르지 않는다 */
export async function chatGate(): Promise<ChatGate> {
  const c = caps();
  const [today, month] = await Promise.all([chatToday(), chatMonthTokens()]);
  const checks = [
    { reason: 'neurons' as const, ...usageLevel(today.neurons, c.aiNeuronsDay), text: `Workers AI 추정 ${Math.round(today.neurons)} / ${c.aiNeuronsDay} 뉴런(오늘)` },
    { reason: 'turns' as const, ...usageLevel(today.turns, c.chatTurnsDay), text: `챗 ${today.turns} / ${c.chatTurnsDay}턴(오늘)` },
    { reason: 'tokens' as const, ...usageLevel(month, c.chatTokensMonth), text: `챗 토큰 ${month} / ${c.chatTokensMonth}(이번 달)` },
  ];
  await Promise.all(checks.map((x) => alertOnce(`chat-${x.reason}`, x.level, x.text)));
  const over = checks.find((x) => x.level === 'over');
  return over ? { ok: false, reason: over.reason } : { ok: true };
}

// 메일(Resend): 보낸 메일만 센다 — 일·월 KV 카운터
const mailKeys = () => {
  const day = kstDate(new Date());
  return { day: `budget:mail:${day}`, month: `budget:mail:${day.slice(0, 7)}` };
};

export async function mailCounts(): Promise<{ day: number; month: number }> {
  const k = mailKeys();
  const [day, month] = await Promise.all([env.KV.get(k.day), env.KV.get(k.month)]);
  return { day: Number(day ?? 0), month: Number(month ?? 0) };
}

/** 메일을 더 보내도 되는지(일·월 상한). 80%·100% 알림 포함 */
export async function mailAllowed(): Promise<boolean> {
  const c = caps();
  const n = await mailCounts();
  const d = usageLevel(n.day, c.mailDay);
  const m = usageLevel(n.month, c.mailMonth);
  await Promise.all([
    alertOnce('mail-day', d.level, `메일 ${n.day} / ${c.mailDay}통(오늘)`),
    alertOnce('mail-month', m.level, `메일 ${n.month} / ${c.mailMonth}통(이번 달)`),
  ]);
  return d.level !== 'over' && m.level !== 'over';
}

export async function recordMail(): Promise<void> {
  const k = mailKeys();
  const n = await mailCounts();
  await Promise.all([
    env.KV.put(k.day, String(n.day + 1), { expirationTtl: 60 * 60 * 26 }),
    env.KV.put(k.month, String(n.month + 1), { expirationTtl: 60 * 60 * 24 * 32 }),
  ]);
}

/** 레터를 더 받아도 되는지(사이트 전체 일일 상한) */
export async function lettersAllowed(): Promise<boolean> {
  const c = caps();
  const n = await lettersToday(true);
  const u = usageLevel(n, c.lettersDay);
  await alertOnce('letters', u.level, `레터 ${n} / ${c.lettersDay}통(오늘)`);
  return u.level !== 'over';
}
