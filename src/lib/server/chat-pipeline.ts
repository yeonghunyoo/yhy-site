import type { Locale } from '../../i18n';
import type { RetrievalLog } from '../../db/schema';
import { complete, hasAi, moderate, type ChatMessage, type Usage } from './ai';
import { DECISION_SCHEMA, parseDecision, SUPERVISOR_MAX_TOKENS, supervisorMessages, topicsBlock, type Decision, type Route } from './agents/supervisor';
import { ragSections } from '../../db/schema';
import { getDb } from './db';
import { DIAGRAM_MAX_TOKENS, DIAGRAM_SCHEMA, diagramMessages, parseDiagram } from './agents/diagram';
import type { Diagram } from '../diagram';
import { CHAT_LIMITS, documentsBlock, systemPrompt } from './chat';
import { detectInjection, GUARD_REPLY, verifyTurn, type GuardFlag } from './guard';
import { retrieve, type RetrievalTrace, type ScoredSection } from './rag';

// 질문 파이프라인(docs/05-06-chat-rag.md): 이력 검증 → 주입 검사 → [유해 검사 ‖ 슈퍼바이저 → (포트폴리오면) 검색] → 하위 에이전트.
// 포트폴리오 에이전트의 모델 답변(9단계)은 부르는 쪽이 한다 — /api/chat은 스트리밍, 어드민 공격 점검은 한 번에.
// 잡담·연락·무관 작업은 여기서 답(reply)까지 정한다. 하위 에이전트의 답은 슈퍼바이저를 다시 거치지 않는다.

export const OUT_OF_SCOPE: Record<Locale, string> = {
  ko: '그건 제가 아는 범위가 아니에요. 직접 물어보고 싶으시면 레터를 보내주세요. [[letter]]',
  en: "That's outside what I know. If you'd like to ask yhy directly, please send a letter. [[letter]]",
};

/** 연락 에이전트(지금은 고정 안내). 레터 초안 자동 작성은 다음 단계 */
export const CONTACT_REPLY: Record<Locale, string> = {
  ko: '로그인한 뒤 "레터 보내기"로 yhy에게 직접 메시지를 보낼 수 있어요. 답장은 메일로 와요. [[letter]]',
  en: 'Sign in and use "Send a letter" to message yhy directly. Replies arrive by email. [[letter]]',
};

/** 무관한 작업 요청 — 모델 없이 거절. yhy에게 물을 일이 아니라 레터 칩은 붙이지 않는다 */
export const OFF_TASK_REPLY: Record<Locale, string> = {
  ko: '그건 제가 도와드릴 수 없어요. 저는 yhy의 프로젝트, 기술, 경력, 연락 방법을 안내해요.',
  en: "I can't help with that. I can tell you about yhy's projects, stack, career, and how to get in touch.",
};

export type Turn = { role: 'user' | 'assistant'; content: string };

export interface Prepared {
  /** 모델 없이 보낼 고정 답변(가드레일·범위 밖·로컬 모의). 없으면 messages로 모델을 부른다 */
  reply: string | null;
  flag: GuardFlag | null;
  /** 모델 위반 분류(Llama Guard S1~S14) — 로그용 */
  category: string | null;
  /** 슈퍼바이저가 고른 경로. 주입 검사에서 막히면 null */
  route: Route | null;
  /** 흐름도 경로: 흐름도 에이전트에 보낼 메시지. 흐름도가 안 나오면 messages(일반 답)로 대신한다 */
  diagramMessages: ChatMessage[] | null;
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

// 문서 목차는 rag:build 때만 바뀐다 — isolate마다 5분 캐시
let topicsCache: { at: number; text: string } | null = null;
async function topics(): Promise<string> {
  if (topicsCache && Date.now() - topicsCache.at < 5 * 60 * 1000) return topicsCache.text;
  const rows = await getDb()
    .select({ slug: ragSections.slug, title: ragSections.title, heading: ragSections.heading })
    .from(ragSections)
    .orderBy(ragSections.slug, ragSections.position)
    .catch(() => []);
  topicsCache = { at: Date.now(), text: topicsBlock(rows) };
  return topicsCache.text;
}

/**
 * 슈퍼바이저: 경로·검색 질문·잡담 답을 정한다. JSON이 깨지거나 호출이 실패하면 원 질문으로 포트폴리오 경로(이전 동작).
 * AI 바인딩이 없으면(로컬 확인) 언제나 포트폴리오 경로.
 */
export async function decide(question: string, history: Turn[], locale: Locale, usage: Usage): Promise<Decision> {
  const fallback: Decision = { route: 'portfolio', query: question, reply: null };
  if (!hasAi()) return fallback;
  const messages = supervisorMessages(history, escapeTags(question), locale, await topics());
  const call = () => complete(messages, SUPERVISOR_MAX_TOKENS, DECISION_SCHEMA);
  // Workers AI가 가끔 "Capacity temporarily exceeded"(3040)로 거절한다(11/03 측정) — 한 번만 다시 시도한다.
  const result = await call()
    .catch(() => new Promise<void>((r) => setTimeout(r, 300)).then(call))
    .catch((error) => {
      console.error('[chat:supervisor]', error);
      return null;
    });
  if (!result) return fallback;
  usage.tokensIn += result.usage.tokensIn;
  usage.tokensOut += result.usage.tokensOut;
  const decision = parseDecision(result.text, question);
  if (!decision) console.error('[chat:supervisor] unparsable', result.text.slice(0, 200));
  return decision ?? fallback;
}

export async function prepare(question: string, history: Turn[], locale: Locale): Promise<Prepared> {
  const usage: Usage = { tokensIn: 0, tokensOut: 0 };
  const base = { category: null, messages: [], sections: [], rewritten: null, retrieval: [], usage, route: null, diagramMessages: null };

  // 노골적인 지시 변경·프롬프트 공개 요청은 모델 없이 거절한다.
  if (detectInjection(question)) return { ...base, reply: GUARD_REPLY.injection[locale], flag: 'injection' };

  // 유해 검사는 슈퍼바이저·검색과 동시에. 유해 검사가 실패하면 통과시키고(가용성 우선) 로그만 남긴다.
  const moderation = hasAi()
    ? moderate(question).catch((error) => {
        console.error('[chat:moderation]', error);
        return { safe: true, category: null };
      })
    : Promise.resolve({ safe: true, category: null });

  // 슈퍼바이저 → 포트폴리오 경로면 검색. 유해 검사와 동시에 돈다.
  const routed = (async () => {
    const decision = await decide(question, history, locale, usage);
    const found: { sections: ScoredSection[]; trace: RetrievalTrace | null } =
      decision.route === 'portfolio' || decision.route === 'diagram' ? await retrieve(decision.query ?? question, locale) : { sections: [], trace: null };
    return { decision, ...found };
  })();

  const [verdict, { decision, sections, trace }] = await Promise.all([moderation, routed]);
  const retrieval = trace?.sections.map(({ id, slug, score }) => ({ id, slug, score })) ?? [];
  const rewritten = decision.query && decision.query !== question ? decision.query : null;
  const done = { ...base, route: decision.route, rewritten, retrieval, sections };

  if (!verdict.safe) {
    const selfHarm = verdict.category === 'S11';
    return { ...done, reply: GUARD_REPLY[selfHarm ? 'self_harm' : 'unsafe'][locale], flag: selfHarm ? 'self_harm' : 'unsafe', category: verdict.category };
  }
  if (decision.route === 'chat') return { ...done, reply: decision.reply, flag: null };
  if (decision.route === 'contact') return { ...done, reply: CONTACT_REPLY[locale], flag: null };
  if (decision.route === 'off_task') return { ...done, reply: OFF_TASK_REPLY[locale], flag: 'off_task' };
  if (sections.length === 0) return { ...done, reply: OUT_OF_SCOPE[locale], flag: 'out_of_scope' };
  if (!hasAi()) return { ...done, reply: devAnswer(locale, sections), flag: null };

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(locale) },
    ...history,
    { role: 'user', content: `${documentsBlock(sections)}\n\n<question>\n${escapeTags(question)}\n</question>` },
  ];
  const diagram = decision.route === 'diagram' ? diagramMessages(sections, escapeTags(question), locale) : null;
  return { ...done, reply: null, flag: null, messages, diagramMessages: diagram };
}

/**
 * 흐름도 에이전트 호출(docs/05-06-chat-rag.md "흐름도 에이전트"). 요약 + `[[slug]]` 줄과 검사한 흐름도를 돌려준다.
 * 용량 오류 등은 한 번 다시 시도하고, 그래도 안 되거나 노드가 2개 미만이면 null — 부르는 쪽이 일반 답(prepared.messages)으로 대신한다.
 */
export async function runDiagram(prepared: Prepared, usage: Usage): Promise<{ text: string; diagram: Diagram } | null> {
  if (!prepared.diagramMessages || !hasAi()) return null;
  const call = () => complete(prepared.diagramMessages!, DIAGRAM_MAX_TOKENS, DIAGRAM_SCHEMA);
  const result = await call()
    .catch(() => new Promise<void>((r) => setTimeout(r, 300)).then(call))
    .catch((error) => {
      console.error('[chat:diagram]', error);
      return null;
    });
  if (!result) return null;
  usage.tokensIn += result.usage.tokensIn;
  usage.tokensOut += result.usage.tokensOut;
  const parsed = parseDiagram(result.text, [...new Set(prepared.sections.map((s) => s.section.slug))]);
  if (!parsed) {
    console.error('[chat:diagram] unusable', result.text.slice(0, 200));
    return null;
  }
  const cite = parsed.sources.map((slug) => `[[${slug}]]`).join(' ');
  return { text: `${parsed.summary}${cite ? `\n\n${cite}` : ''}`.trim(), diagram: parsed.diagram };
}
