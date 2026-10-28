import type { APIRoute } from 'astro';
import { env, waitUntil } from 'cloudflare:workers';
import Anthropic from '@anthropic-ai/sdk';
import { lt } from 'drizzle-orm';
import { isLocale, type Locale } from '../../i18n';
import { chatLogs, type RagChunk } from '../../db/schema';
import { CHAT_LIMITS, CHAT_MODEL, citedSources, documentsBlock, hashIp, systemPrompt } from '../../lib/server/chat';
import { getDb } from '../../lib/server/db';
import { kstDate } from '../../lib/server/dates';
import { notify } from '../../lib/server/notify';
import { search } from '../../lib/server/rag';
import { clientIp } from '../../lib/server/ratelimit';

export const prerender = false;

type Turn = { role: 'user' | 'assistant'; content: string };

const encoder = new TextEncoder();
const sse = (data: unknown) => encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

const CAPPED: Record<Locale, string> = {
  ko: '오늘은 쉬어요. 궁금한 건 레터로 보내주세요. [[letter]]',
  en: "I'm taking a break today. Please send a letter instead. [[letter]]",
};

/** 키가 없을 때(로컬) — 검색 결과로 만든 모의 답변. UI·출처 칩·로그를 키 없이 확인하는 용도. */
function devAnswer(locale: Locale, chunks: RagChunk[]): string {
  if (chunks.length === 0) return locale === 'ko' ? '(로컬 모드) 관련 문서를 찾지 못했어요. [[letter]]' : '(local mode) No matching documents. [[letter]]';
  const list = chunks.map((c) => `「${c.heading}」`).join(', ');
  const slugs = [...new Set(chunks.map((c) => `[[${c.slug}]]`))].join(' ');
  return locale === 'ko'
    ? `(로컬 모드 — ANTHROPIC_API_KEY가 없어 검색 결과만 보여줘요) 관련 문서: ${list}. ${slugs}`
    : `(local mode — no ANTHROPIC_API_KEY, showing search results only) Related: ${list}. ${slugs}`;
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
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(sse({ t: 'delta', text: CAPPED[locale] }));
          c.enqueue(sse({ t: 'done', sources: [] }));
          c.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } },
    );
  }

  const chunks = await search(question, locale);
  const history = cleanHistory(input?.history);
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const run = async () => {
    let answer = '';
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      if (!env.ANTHROPIC_API_KEY) {
        answer = devAnswer(locale, chunks);
        for (const piece of answer.match(/.{1,12}/gsu) ?? []) {
          await writer.write(sse({ t: 'delta', text: piece }));
          await new Promise((r) => setTimeout(r, 30));
        }
      } else {
        const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
        const stream = client.messages.stream({
          model: CHAT_MODEL,
          max_tokens: 2048,
          // 짧은 사실 답변 — 낮은 effort로 지연·비용을 줄인다.
          output_config: { effort: 'low' },
          system: systemPrompt(locale),
          messages: [
            ...history,
            { role: 'user', content: `${documentsBlock(chunks)}\n\n<question>\n${question}\n</question>` },
          ],
        });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            answer += event.delta.text;
            await writer.write(sse({ t: 'delta', text: event.delta.text }));
          }
        }
        const final = await stream.finalMessage();
        tokensIn = final.usage.input_tokens;
        tokensOut = final.usage.output_tokens;
        if (final.stop_reason === 'refusal' && !answer) {
          answer = CAPPED[locale].replace(/^[^.]*\.\s*/, '');
          await writer.write(sse({ t: 'delta', text: answer }));
        }
      }
      await writer.write(sse({ t: 'done', sources: citedSources(answer, chunks) }));
    } catch (error) {
      console.error('[chat]', error);
      await writer.write(sse({ t: 'error' }));
    } finally {
      await writer.close().catch(() => {});
    }

    // 질문·토큰만 남긴다(답변 본문 저장 안 함). 90일 지난 로그는 여기서 함께 지운다.
    const db = getDb();
    await db.insert(chatLogs).values({
      id: crypto.randomUUID(),
      userId: me?.id ?? null,
      ipHash,
      locale,
      question,
      sources: citedSources(answer, chunks),
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
