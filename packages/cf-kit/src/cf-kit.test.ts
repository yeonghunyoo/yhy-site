import { describe, expect, it, vi } from 'vitest';
import { alertOnceKv, capFrom, createCountBudget, kstDate, kvCounterStore, usageLevel, type KvLike } from './budget';
import { botReason, sameOrigin, WindowLimiter } from './guard';
import { createMailer } from './mail';
import { maskEmail } from './notify';

function memoryKv(): KvLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    put: async (k, v) => void data.set(k, v),
  };
}

describe('budget', () => {
  it('usageLevel: 80% warn, 100% over, 상한 0은 ok', () => {
    expect(usageLevel(79, 100).level).toBe('ok');
    expect(usageLevel(80, 100).level).toBe('warn');
    expect(usageLevel(100, 100).level).toBe('over');
    expect(usageLevel(5, 0).level).toBe('ok');
  });

  it('capFrom: 양의 정수만, 아니면 기본값', () => {
    expect(capFrom('30', 80)).toBe(30);
    expect(capFrom('2.7', 80)).toBe(2);
    expect(capFrom('', 80)).toBe(80);
    expect(capFrom('0', 80)).toBe(80);
    expect(capFrom(undefined, 80)).toBe(80);
  });

  it('kstDate: UTC 15시는 KST 다음 날', () => {
    expect(kstDate(new Date('2026-11-04T14:59:59Z'))).toBe('2026-11-04');
    expect(kstDate(new Date('2026-11-04T15:00:00Z'))).toBe('2026-11-05');
  });

  it('createCountBudget: 일 상한에서 막고, 키는 budget:{name}:{일|월}', async () => {
    const kv = memoryKv();
    const now = () => new Date('2026-11-04T03:00:00Z');
    const b = createCountBudget({ name: 'mail', caps: { day: 2, month: 10 }, store: kvCounterStore(kv), label: '메일', unit: '통', now });
    expect(await b.allowed()).toBe(true);
    await b.record();
    await b.record();
    expect(await b.counts()).toEqual({ day: 2, month: 2 });
    expect(await b.allowed()).toBe(false);
    expect([...kv.data.keys()].sort()).toEqual(['budget:mail:2026-11', 'budget:mail:2026-11-04']);
  });

  it('createCountBudget: 월 상한도 본다', async () => {
    const kv = memoryKv();
    kv.data.set('budget:mail:2026-11', '10');
    const b = createCountBudget({ name: 'mail', caps: { day: 5, month: 10 }, store: kvCounterStore(kv), label: '메일', unit: '통', now: () => new Date('2026-11-04T03:00:00Z') });
    expect(await b.allowed()).toBe(false);
  });

  it('alertOnceKv: 종류·단계마다 하루 1번', async () => {
    const kv = memoryKv();
    const notify = vi.fn();
    const alert = alertOnceKv(kv, notify);
    await alert('mail-day', 'ok', 'x');
    await alert('mail-day', 'warn', '메일 80 / 100통(오늘)');
    await alert('mail-day', 'warn', '메일 81 / 100통(오늘)');
    await alert('mail-day', 'over', '메일 100 / 100통(오늘)');
    expect(notify.mock.calls.map((c) => c[0])).toEqual(['⚠️ 사용량 80%: 메일 80 / 100통(오늘)', '🧯 차단기 작동: 메일 100 / 100통(오늘)']);
  });
});

describe('mail', () => {
  const mail = { to: 'a@b.c', subject: 's', text: 't', html: '<p>t</p>' };

  it('키가 없으면 dev로, dev도 없으면 mail_not_configured', async () => {
    const dev = vi.fn();
    expect((await createMailer({ from: 'x', dev })(mail)).ok).toBe(true);
    expect(dev).toHaveBeenCalledWith(mail);
    expect(await createMailer({ from: 'x' })(mail)).toEqual({ ok: false, error: 'mail_not_configured' });
  });

  it('예산을 넘으면 보내지 않고, 보낸 것만 기록한다', async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 'r1' }));
    const record = vi.fn(async () => {});
    const send = createMailer({ apiKey: 'k', from: 'x <x@y.z>', fetcher: fetcher as unknown as typeof fetch, budget: { allowed: async () => true, record } });
    expect(await send(mail)).toEqual({ ok: true, id: 'r1' });
    expect(record).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ from: 'x <x@y.z>', to: ['a@b.c'], subject: 's' });

    const blocked = createMailer({ apiKey: 'k', from: 'x', fetcher: fetcher as unknown as typeof fetch, budget: { allowed: async () => false, record } });
    expect(await blocked(mail)).toEqual({ ok: false, error: 'mail_budget' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('Resend 오류는 기록하지 않고 메시지를 돌려준다', async () => {
    const record = vi.fn(async () => {});
    const fetcher = (async () => Response.json({ message: 'invalid' }, { status: 422 })) as unknown as typeof fetch;
    const send = createMailer({ apiKey: 'k', from: 'x', fetcher, budget: { allowed: async () => true, record } });
    expect(await send(mail)).toEqual({ ok: false, error: 'invalid' });
    expect(record).not.toHaveBeenCalled();
  });
});

describe('guard', () => {
  it('WindowLimiter: 창 안에서 상한을 넘으면 막고 위반을 센다, 창이 바뀌면 다시', () => {
    const l = new WindowLimiter(2, 1000);
    expect(l.check('ip', 0).allowed).toBe(true);
    expect(l.check('ip', 10).allowed).toBe(true);
    expect(l.check('ip', 20)).toEqual({ allowed: false, violations: 1 });
    expect(l.check('ip', 30)).toEqual({ allowed: false, violations: 2 });
    expect(l.check('ip', 1000).allowed).toBe(true);
  });

  it('sameOrigin: Origin 우선, 없으면 Referer, 둘 다 없으면 거부', () => {
    expect(sameOrigin('https://a.dev', 'https://a.dev', null)).toBe(true);
    expect(sameOrigin('https://a.dev', 'https://b.dev', 'https://a.dev/x')).toBe(false);
    expect(sameOrigin('https://a.dev', null, 'https://a.dev/x')).toBe(true);
    expect(sameOrigin('https://a.dev', null, 'not a url')).toBe(false);
    expect(sameOrigin('https://a.dev', null, null)).toBe(false);
  });

  it('botReason: 브라우저 신호가 다 있으면 null', () => {
    const browser = { 'user-agent': 'Mozilla/5.0 Safari', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'accept-language': 'ko' };
    expect(botReason(new Headers(browser))).toBeNull();
    expect(botReason(new Headers({ ...browser, 'user-agent': 'curl/8' }))).toBe('tool_ua');
    expect(botReason(new Headers({ ...browser, 'sec-fetch-site': 'cross-site' }))).toBe('fetch_site');
    const { 'accept-language': _, ...noLang } = browser;
    expect(botReason(new Headers(noLang))).toBe('no_lang');
  });
});

describe('notify', () => {
  it('maskEmail', () => {
    expect(maskEmail('abcdef@gmail.com')).toBe('abc***@gmail.com');
    expect(maskEmail(null)).toBe('(unknown)');
  });
});
