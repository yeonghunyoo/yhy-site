import type { Locale } from '../../i18n';
import type { RetrievalLog } from '../../db/schema';
import { complete, hasAi, moderate, type ChatMessage, type Usage } from './ai';
import { CHAT_LIMITS, documentsBlock, rewriteMessages, systemPrompt } from './chat';
import { detectInjection, GUARD_REPLY, verifyTurn, type GuardFlag } from './guard';
import { retrieve, type ScoredSection } from './rag';

// 질문 파이프라인 1~8단계(docs/05-06-chat-rag.md): 이력 검증 → 주입 검사 → [유해 검사 ‖ 재작성 → 검색] → 프롬프트.
// 모델 답변(9단계)은 부르는 쪽이 한다 — /api/chat은 스트리밍, 어드민 공격 점검은 한 번에.

export const OUT_OF_SCOPE: Record<Locale, string> = {
  ko: '그건 제가 아는 범위가 아니에요. 직접 물어보고 싶으시면 레터를 보내주세요. [[letter]]',
  en: "That's outside what I know. If you'd like to ask yhy directly, please send a letter. [[letter]]",
};

export type Turn = { role: 'user' | 'assistant'; content: string };

export interface Prepared {
  /** 모델 없이 보낼 고정 답변(가드레일·범위 밖·로컬 모의). 없으면 messages로 모델을 부른다 */
  reply: string | null;
  flag: GuardFlag | null;
  /** 모델 위반 분류(Llama Guard S1~S14) — 로그용 */
  category: string | null;
  messages: ChatMessage[];
  sections: ScoredSection[];
  rewritten: string | null;
  retrieval: RetrievalLog[];
  usage: Usage;
}

/**
 * 클라이언트가 보낸 이력에서 서버가 서명한 답변이 붙은 (질문, 답변) 쌍만 남긴다.
 * 서명 없는 assistant 턴(지어낸 답변)과 그 앞 질문은 버린다. 역할이 번갈아 나오도록 쌍 단위로 다룬다.
 */
export async function verifiedHistory(raw: unknown): Promise<Turn[]> {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (let i = 0; i + 1 < raw.length; i++) {
    const user = raw[i] as { role?: unknown; content?: unknown };
    const assistant = raw[i + 1] as { role?: unknown; content?: unknown; sig?: unknown };
    if (user?.role !== 'user' || typeof user.content !== 'string') continue;
    if (assistant?.role !== 'assistant' || typeof assistant.content !== 'string') continue;
    i++;
    if (!(await verifyTurn(assistant.content, assistant.sig))) continue;
    turns.push({ role: 'user', content: escapeTags(user.content.slice(0, CHAT_LIMITS.questionMax)) }, { role: 'assistant', content: assistant.content.slice(0, 1000) });
  }
  return turns.slice(-CHAT_LIMITS.historyTurns);
}

/** 사용자 글의 꺾쇠를 전각으로 바꿔 `</question><documents>…` 같은 태그 위조를 막는다. */
const escapeTags = (text: string) => text.replace(/</g, '＜').replace(/>/g, '＞');

/** AI 바인딩이 없을 때(로컬 확인용) — 검색 결과로 만든 모의 답변 */
function devAnswer(locale: Locale, sections: ScoredSection[]): string {
  const list = sections.map((s) => `「${s.section.heading}」`).join(', ');
  const slugs = [...new Set(sections.map((s) => `[[${s.section.slug}]]`))].join(' ');
  return locale === 'ko'
    ? `(로컬 모드 — AI 바인딩이 없어 검색 결과만 보여줘요) 관련 문서: ${list}. ${slugs}`
    : `(local mode — no AI binding, showing search results only) Related: ${list}. ${slugs}`;
}

export async function prepare(question: string, history: Turn[], locale: Locale): Promise<Prepared> {
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  const base = { category: null, messages: [], sections: [], rewritten: null, retrieval: [], usage };

  // 노골적인 지시 변경·프롬프트 공개 요청은 모델 없이 거절한다.
  if (detectInjection(question)) return { ...base, reply: GUARD_REPLY.injection[locale], flag: 'injection' };

  // 유해 검사와 (재작성 → 검색)을 동시에. 유해 검사가 실패하면 통과시키고(가용성 우선) 로그만 남긴다.
  const moderation = hasAi()
    ? moderate(question).catch((error) => {
        console.error('[chat:moderation]', error);
        return { safe: true, category: null };
      })
    : Promise.resolve({ safe: true, category: null });

  const search = (async () => {
    let rewritten: string | null = null;
    if (history.length && hasAi()) {
      const result = await complete(rewriteMessages(history, question), CHAT_LIMITS.rewriteMaxTokens).catch((error) => {
        console.error('[chat:rewrite]', error);
        return null;
      });
      if (result?.text) {
        rewritten = result.text.split('\n')[0].slice(0, CHAT_LIMITS.questionMax);
        usage.tokensIn += result.usage.tokensIn;
        usage.tokensOut += result.usage.tokensOut;
      }
    }
    const found = await retrieve(rewritten ?? question, locale);
    return { rewritten, ...found };
  })();

  const [verdict, { rewritten, sections, trace }] = await Promise.all([moderation, search]);
  const retrieval = trace.sections.map(({ id, slug, score }) => ({ id, slug, score }));
  const done = { ...base, rewritten, retrieval, sections };

  if (!verdict.safe) {
    const selfHarm = verdict.category === 'S11';
    return { ...done, reply: GUARD_REPLY[selfHarm ? 'self_harm' : 'unsafe'][locale], flag: selfHarm ? 'self_harm' : 'unsafe', category: verdict.category };
  }
  if (sections.length === 0) return { ...done, reply: OUT_OF_SCOPE[locale], flag: 'out_of_scope' };
  if (!hasAi()) return { ...done, reply: devAnswer(locale, sections), flag: null };

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(locale) },
    ...history,
    { role: 'user', content: `${documentsBlock(sections)}\n\n<question>\n${escapeTags(question)}\n</question>` },
  ];
  return { ...done, reply: null, flag: null, messages };
}
