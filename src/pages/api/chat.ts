import type { APIRoute } from 'astro';
import { env, waitUntil } from 'cloudflare:workers';
import { lt } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n';
import { chatLogs } from '../../db/schema';
import { streamChat } from '../../lib/server/ai';
import { CHAT_LIMITS, citedSources, hashIp, runawayCitations } from '../../lib/server/chat';
import { prepare, verifiedHistory, type Prepared } from '../../lib/server/chat-pipeline';
import { getDb } from '../../lib/server/db';
import { kstDate } from '../../lib/server/dates';
import { GUARD_REPLY, outputBlocked, signTurn, type GuardFlag } from '../../lib/server/guard';
import { notify } from '../../lib/server/notify';
import { clientIp } from '../../lib/server/ratelimit';

export const prerender = false;

const encoder = new TextEncoder();
const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
const SSE_HEADERS = { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' };

const CAPPED: Record<Locale, string> = {
  ko: '오늘은 쉬어요. 궁금한 건 레터로 보내주세요. [[letter]]',
  en: "I'm taking a break today. Please send a letter instead. [[letter]]",
};

/** 고정 문장 하나를 스트림처럼 보낸다. 다음 턴 이력에 쓸 수 있게 서명을 붙인다. */
async function fixedReply(text: string) {
  const sig = await signTurn(text);
  return new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(sse({ t: 'delta', text }));
        c.enqueue(sse({ t: 'done', sources: [], sig }));
        c.close();
      },
    }),
    { headers: SSE_HEADERS },
  );
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (env.CHAT_ENABLED !== '1') return Response.json({ error: 'not_found' }, { status: 404 });

  const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const question = String(input?.message ?? '').trim();
  const locale: Locale = isLocale(input?.locale) ? input.locale : 'ko';
  if (!question || question.length > CHAT_LIMITS.questionMax) return Response.json({ error: 'invalid' }, { status: 400 });

  // 턴 제한: 비로그인 3턴 / 로그인 30턴 (하루, KST)
  const me = locals.user;
  const ipHash = await hashIp(clientIp(request), env.BETTER_AUTH_SECRET);
  const who = me ? me.id : `ip:${ipHash}`;
  const dayKey = `chat:${who}:${kstDate(new Date())}`;
  const used = Number((await env.KV.get(dayKey)) ?? 0);
  const limit = me ? CHAT_LIMITS.signedInPerDay : CHAT_LIMITS.anonPerDay;
  if (used >= limit) return Response.json({ error: 'limit', signedIn: Boolean(me) }, { status: 429 });
  await env.KV.put(dayKey, String(used + 1), { expirationTtl: 60 * 60 * 26 });

  // 월 토큰 상한
  const monthKey = `chat:month:${kstDate(new Date()).slice(0, 7)}`;
  const cap = Number(env.CHAT_MONTHLY_TOKEN_CAP) || CHAT_LIMITS.defaultMonthlyTokenCap;
  const monthUsed = Number((await env.KV.get(monthKey)) ?? 0);
  if (monthUsed >= cap) {
    const flag = `${monthKey}:notified`;
    if (!(await env.KV.get(flag))) {
      await env.KV.put(flag, '1', { expirationTtl: 60 * 60 * 24 * 32 });
      notify('💸 챗 상한 도달');
    }
    return fixedReply(CAPPED[locale]);
  }

  const history = await verifiedHistory(input?.history);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const run = async () => {
    let answer = '';
    let prepared: Prepared | null = null;
    let flag: GuardFlag | null = null;
    const usage = { tokensIn: 0, tokensOut: 0 };
    const send = async (text: string) => {
      answer += text;
      await writer.write(sse({ t: 'delta', text }));
    };
    try {
      prepared = await prepare(question, history, locale);
      flag = prepared.flag;
      usage.tokensIn += prepared.usage.tokensIn;
      usage.tokensOut += prepared.usage.tokensOut;
      if (prepared.reply !== null) await send(prepared.reply);
      else {
        // 9. 스트리밍 답변. 코드 블록(출력 가드)이나 출처 표기 폭주가 보이면 거기서 끊는다.
        let pending = '';
        const result = await streamChat(prepared.messages, CHAT_LIMITS.answerMaxTokens, async (text) => {
          pending += text;
          if (outputBlocked(answer + pending)) {
            const safe = (answer + pending).split('```')[0].slice(answer.length);
            if (safe) await send(safe);
            await send(`${answer ? '\n' : ''}${GUARD_REPLY.output_blocked[locale]}`);
            flag = 'output_blocked';
            return false;
          }
          // 백틱이 이어 올 수 있으니 끝의 백틱은 다음 조각까지 잡아 둔다.
          const hold = pending.match(/`{1,2}$/)?.[0] ?? '';
          const ready = pending.slice(0, pending.length - hold.length);
          pending = hold;
          if (ready) await send(ready);
          return !runawayCitations(answer);
        });
        if (pending && flag !== 'output_blocked') await send(pending);
        usage.tokensIn += result.usage.tokensIn;
        usage.tokensOut += result.usage.tokensOut;
      }
      await writer.write(sse({ t: 'done', sources: citedSources(answer, prepared.sections), sig: await signTurn(answer) }));
    } catch (error) {
      // Workers AI 한도·오류: 아직 아무것도 못 보냈으면 "오늘은 쉬어요"로 끝낸다.
      console.error('[chat]', error);
      if (!answer) {
        await send(CAPPED[locale]).catch(() => {});
        await writer.write(sse({ t: 'done', sources: [], sig: await signTurn(answer) })).catch(() => {});
      } else await writer.write(sse({ t: 'error' })).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }

    // 10~11. 질문·재작성 질문·검색 기록·가드 판정·토큰만 남긴다(답변 본문 저장 안 함). 90일 지난 로그는 여기서 함께 지운다.
    const db = getDb();
    await db.insert(chatLogs).values({
      id: crypto.randomUUID(),
      userId: me?.id ?? null,
      ipHash,
      locale,
      question,
      rewritten: prepared?.rewritten ?? null,
      route: prepared?.route ?? null,
      sources: citedSources(answer, prepared?.sections ?? []),
      retrieval: prepared?.retrieval ?? [],
      flag: flag && prepared?.category ? `${flag}:${prepared.category}` : flag,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
    });
    await db.delete(chatLogs).where(lt(chatLogs.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
    if (usage.tokensIn + usage.tokensOut > 0) {
      const current = Number((await env.KV.get(monthKey)) ?? 0);
      await env.KV.put(monthKey, String(current + usage.tokensIn + usage.tokensOut), { expirationTtl: 60 * 60 * 24 * 32 });
    }
    // 유해·자해·출력 차단은 알린다. 같은 시간대에는 한 번만(연속 공격에 알림이 쏟아지지 않게).
    if (flag === 'unsafe' || flag === 'self_harm' || flag === 'output_blocked') {
      const notifyKey = `notify:chat-guard:${new Date().toISOString().slice(0, 13)}`;
      if (!(await env.KV.get(notifyKey))) {
        await env.KV.put(notifyKey, '1', { expirationTtl: 60 * 60 * 2 });
        notify(`🛡 챗 가드 ${flag}${prepared?.category ? ` ${prepared.category}` : ''} — /admin/chat`);
      }
    }
  };
  waitUntil(run().catch((e) => console.error('[chat:log]', e)));

  return new Response(readable, { headers: SSE_HEADERS });
};
