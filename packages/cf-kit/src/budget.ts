// 사용량 상한(과금 폭탄 차단기)의 공용 부분 — site docs/guides/cost-guard.md.
// 계산은 순수 함수, 카운터 저장은 CounterStore로 받는다(site는 KV, nuvo는 Postgres). 런타임(env)을 모른다.

export type Level = 'ok' | 'warn' | 'over';

/** 사용률(0~∞)과 단계: 80% 이상 warn, 100% 이상 over */
export function usageLevel(used: number, limit: number): { ratio: number; level: Level } {
  const ratio = limit > 0 ? used / limit : 0;
  return { ratio, level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}

/** 환경변수 상한: 양의 정수면 그 값, 아니면 기본값 */
export function capFrom(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' (KST). 일·월 상한은 한국 시간 자정에 바뀐다 */
export function kstDate(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 키별 정수 카운터. 없는 키는 0 */
export interface CounterStore {
  get(keys: string[]): Promise<number[]>;
  /** 각 키를 1 올린다. ttlSeconds가 지나면 지워도 된다(저장소가 지원하면) */
  increment(entries: { key: string; ttlSeconds: number }[]): Promise<void>;
}

/** KV 비슷한 저장소(Workers KV의 get·put만 쓴다) */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown>;
}

/**
 * KV 카운터. 읽고 +1 해서 쓰므로 동시에 오면 조금 덜 셀 수 있다(상한에 여유를 둔다).
 * 키 하나당 올릴 때마다 KV 쓰기 1회 — KV 무료 쓰기는 하루 1천 회라 자주 일어나는 일에는 쓰지 않는다.
 */
export function kvCounterStore(kv: KvLike): CounterStore {
  const get = async (keys: string[]) => {
    const values = await Promise.all(keys.map((k) => kv.get(k)));
    return values.map((v) => Number(v ?? 0));
  };
  return {
    get,
    async increment(entries) {
      const now = await get(entries.map((e) => e.key));
      await Promise.all(entries.map((e, i) => kv.put(e.key, String((now[i] ?? 0) + 1), { expirationTtl: e.ttlSeconds })));
    },
  };
}

/** 80%·100%에 부르는 알림. 하루 한 번만 보내는 일은 구현이 맡는다(alertOnceKv) */
export type Alert = (kind: string, level: Level, text: string) => Promise<void>;

/** 종류·단계마다 하루(KST) 1번만 notify. 플래그는 KV에 1회 쓴다 */
export function alertOnceKv(kv: KvLike, notify: (text: string) => void): Alert {
  return async (kind, level, text) => {
    if (level === 'ok') return;
    const key = `budget:alert:${kstDate(new Date())}:${kind}:${level}`;
    if (await kv.get(key)) return;
    await kv.put(key, '1', { expirationTtl: 60 * 60 * 26 });
    notify(level === 'over' ? `🧯 차단기 작동: ${text}` : `⚠️ 사용량 80%: ${text}`);
  };
}

export interface CountBudgetOptions {
  /** 카운터 키 이름: budget:{name}:{YYYY-MM-DD}, budget:{name}:{YYYY-MM} */
  name: string;
  caps: { day: number; month: number };
  store: CounterStore;
  /** 알림 문구용: '메일', '통' → "메일 12 / 80통(오늘)" */
  label: string;
  unit: string;
  alert?: Alert;
  now?: () => Date;
}

export interface CountBudget {
  counts(): Promise<{ day: number; month: number }>;
  /** 하나 더 써도 되는지(일·월 상한). 80%·100%에 alert */
  allowed(): Promise<boolean>;
  /** 하나 썼다고 기록 */
  record(): Promise<void>;
}

/** 일·월 개수 상한 — 메일처럼 "보낸 것만 센다" 식의 자원 */
export function createCountBudget(o: CountBudgetOptions): CountBudget {
  const keys = () => {
    const day = kstDate((o.now ?? (() => new Date()))());
    return { day: `budget:${o.name}:${day}`, month: `budget:${o.name}:${day.slice(0, 7)}` };
  };
  const counts = async () => {
    const k = keys();
    const [day = 0, month = 0] = await o.store.get([k.day, k.month]);
    return { day, month };
  };
  return {
    counts,
    async allowed() {
      const n = await counts();
      const d = usageLevel(n.day, o.caps.day);
      const m = usageLevel(n.month, o.caps.month);
      if (o.alert) {
        await Promise.all([
          o.alert(`${o.name}-day`, d.level, `${o.label} ${n.day} / ${o.caps.day}${o.unit}(오늘)`),
          o.alert(`${o.name}-month`, m.level, `${o.label} ${n.month} / ${o.caps.month}${o.unit}(이번 달)`),
        ]);
      }
      return d.level !== 'over' && m.level !== 'over';
    },
    async record() {
      const k = keys();
      await o.store.increment([
        { key: k.day, ttlSeconds: 60 * 60 * 26 },
        { key: k.month, ttlSeconds: 60 * 60 * 24 * 32 },
      ]);
    },
  };
}
