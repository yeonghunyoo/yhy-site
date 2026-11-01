import type { APIRoute } from 'astro';
import { env, waitUntil } from 'cloudflare:workers';
import { lt } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n';
import { chatLogs } from '../../db/schema';
import { complete, hasAi, streamChat, type ChatMessage } from '../../lib/server/ai';
import { CHAT_LIMITS, citedSources, documentsBlock, hashIp, rewriteMessages, runawayCitations, systemPrompt } from '../../lib/server/chat';
import { getDb } from '../../lib/server/db';
import { kstDate } from '../../lib/server/dates';
import { notify } from '../../lib/server/notify';
import { retrieve, type ScoredSection } from '../../lib/server/rag';
import { clientIp } from '../../lib/server/ratelimit';

export const prerender = false;

type Turn = { role: 'user' | 'assistant'; content: string };

const encoder = new TextEncoder();
const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

const CAPPED: Record<Locale, string> = {
  ko: '오늘은 쉬어요. 궁금한 건 레터로 보내주세요. [[letter]]',
  en: "I'm taking a break today. Please send a letter instead. [[letter]]",
};

/** 검색 결과가 범위 밖이면 모델을 부르지 않고 이 문장으로 거절한다(docs/05-06-chat-rag.md 질문 파이프라인 4). */
const OUT_OF_SCOPE: Record<Locale, string> = {
  ko: '그건 제가 아는 범위가 아니에요. 직접 물어보고 싶으시면 레터를 보내주세요. [[letter]]',
  en: "That's outside what I know. If you'd like to ask yhy directly, please send a letter. [[letter]]",
};

/** AI 바인딩이 없을 때(로컬 확인용) — 검색 결과로 만든 모의 답변 */
function devAnswer(locale: Locale, sections: ScoredSection[]): string {
  const list = sections.map((s) => `「${s.section.heading}」`).join(', ');
  const slugs = [...new Set(sections.map((s) => `[[${s.section.slug}]]`))].join(' ');
  return locale === 'ko'
    ? `(로컬 모드 — AI 바인딩이 없어 검색 결과만 보여줘요) 관련 문서: ${list}. ${slugs}`
    : `(local mode — no AI binding, showing search results only) Related: ${list}. ${slugs}`;
}

function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter((t): t is Turn => (t?.role === 'user' || t?.role === 'assistant') && typeof t?.content === 'string')
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1000) }))
    .slice(-CHAT_LIMITS.historyTurns);
  // 첫 메시지는 user여야 한다.
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

/** 고정 문장 하나를 스트림처럼 보낸다. */
const fixedReply = (text: string) =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(sse({ t: 'delta', text }));
        c.enqueue(sse({ t: 'done', sources: [] }));
        c.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } },
  );

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

  const history = cleanHistory(input?.history);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const run = async () => {
    let answer = '';
    let rewritten: string | null = null;
    let sections: ScoredSection[] = [];
    let retrieval: { id: string; slug: string; score: number }[] = [];
    let tokensIn = 0;
    let tokensOut = 0;
    const send = async (text: string) => {
      answer += text;
      await writer.write(sse({ t: 'delta', text }));
    };
    try {
      // 2. 질문 재작성(두 번째 턴부터) — 실패하면 원 질문으로 검색한다.
      if (history.length && hasAi()) {
        const result = await complete(rewriteMessages(history, question), CHAT_LIMITS.rewriteMaxTokens).catch((error) => {
          console.error('[chat:rewrite]', error);
          return null;
        });
        if (result?.text) {
          rewritten = result.text.split('\n')[0].slice(0, CHAT_LIMITS.questionMax);
          tokensIn += result.usage.tokensIn;
          tokensOut += result.usage.tokensOut;
        }
      }

      // 3~7. 검색 → 범위 판단 → 부모 섹션 top-k
      const found = await retrieve(rewritten ?? question, locale);
      sections = found.sections;
      retrieval = found.trace.sections.map(({ id, slug, score }) => ({ id, slug, score }));

      if (sections.length === 0) await send(OUT_OF_SCOPE[locale]);
      else if (!hasAi()) {
        for (const piece of devAnswer(locale, sections).match(/.{1,12}/gsu) ?? []) {
          await send(piece);
          await new Promise((r) => setTimeout(r, 30));
        }
      } else {
        // 8~9. 프롬프트 → 스트리밍 답변
        const messages: ChatMessage[] = [
          { role: 'system', content: systemPrompt(locale) },
          ...history,
          { role: 'user', content: `${documentsBlock(sections)}\n\n<question>\n${question}\n</question>` },
        ];
        const result = await streamChat(messages, CHAT_LIMITS.answerMaxTokens, async (text) => {
          await send(text);
          return !runawayCitations(answer);
        });
        tokensIn += result.usage.tokensIn;
        tokensOut += result.usage.tokensOut;
      }
      await writer.write(sse({ t: 'done', sources: citedSources(answer, sections) }));
    } catch (error) {
      // Workers AI 한도·오류: 아직 아무것도 못 보냈으면 "오늘은 쉬어요"로 끝낸다.
      console.error('[chat]', error);
      if (!answer) {
        await send(CAPPED[locale]).catch(() => {});
        await writer.write(sse({ t: 'done', sources: [] })).catch(() => {});
      } else await writer.write(sse({ t: 'error' })).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }

    // 10~11. 질문·재작성 질문·검색 기록·토큰만 남긴다(답변 본문 저장 안 함). 90일 지난 로그는 여기서 함께 지운다.
    const db = getDb();
    await db.insert(chatLogs).values({
      id: crypto.randomUUID(),
      userId: me?.id ?? null,
      ipHash,
      locale,
      question,
      rewritten,
      sources: citedSources(answer, sections),
      retrieval,
      tokensIn,
      tokensOut,
    });
    await db.delete(chatLogs).where(lt(chatLogs.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)));
    if (tokensIn + tokensOut > 0) {
      const current = Number((await env.KV.get(monthKey)) ?? 0);
      await env.KV.put(monthKey, String(current + tokensIn + tokensOut), { expirationTtl: 60 * 60 * 24 * 32 });
    }
  };
  waitUntil(run().catch((e) => console.error('[chat:log]', e)));

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
};
