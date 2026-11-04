import { env } from 'cloudflare:workers';

// Workers AI 어댑터 — 답변·재작성·임베딩·리랭크를 모두 `AI` 바인딩 하나로 부른다(docs/05-06-chat-rag.md).
// 모델을 바꿀 때는 이 상수만 고친다. 답변 모델은 환경변수 `CHAT_MODEL`로 덮어쓸 수 있다(모델 비교용).
export const AI_MODELS = {
  chat: '@cf/google/gemma-4-26b-a4b-it',
  embedding: '@cf/baai/bge-m3',
  rerank: '@cf/baai/bge-reranker-base',
  moderation: '@cf/meta/llama-guard-3-8b',
} as const;


export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Usage = { tokensIn: number; tokensOut: number };

interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}
const ai = () => (env as unknown as { AI?: AiBinding }).AI;
export const hasAi = () => Boolean(ai());

export const chatModel = () => (env as unknown as { CHAT_MODEL?: string }).CHAT_MODEL || AI_MODELS.chat;

/**
 * 답변 모델 요청 본문. 짧은 사실 답변이라 추론을 끄고 지연·비용을 줄인다 —
 * Qwen3는 사용자 턴 끝의 `/no_think`, 나머지(Gemma 4 등)는 `chat_template_kwargs.enable_thinking`.
 */
function chatInput(messages: ChatMessage[], maxTokens: number, stream: boolean) {
  const model = chatModel();
  const last = messages.at(-1);
  if (model.includes('qwen3') && last?.role === 'user') {
    messages = [...messages.slice(0, -1), { ...last, content: `${last.content} /no_think` }];
    return { model, input: { messages, max_tokens: maxTokens, stream } };
  }
  return { model, input: { messages, max_tokens: maxTokens, stream, chat_template_kwargs: { enable_thinking: false } } };
}

/** 추론 모델이 본문에 섞어 내는 <think> 블록을 지운다(닫히지 않은 블록 포함). */
const stripThink = (text: string) => text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

export async function embed(texts: string[]): Promise<number[][]> {
  const result = (await ai()!.run(AI_MODELS.embedding, { text: texts })) as { data: number[][] };
  return result.data;
}

/** 리랭크 점수(0~1). 결과는 입력 순서와 같은 배열 */
export async function rerank(query: string, texts: string[]): Promise<number[]> {
  const result = (await ai()!.run(AI_MODELS.rerank, { query, contexts: texts.map((text) => ({ text })) })) as {
    response?: { id?: number; score?: number }[];
  };
  const scores = texts.map(() => 0);
  for (const r of result.response ?? []) if (r.id !== undefined) scores[r.id] = r.score ?? 0;
  return scores;
}

/**
 * 유해 요청 검사(Llama Guard 3). 질문만 넣는다. 결과는 `safe` 또는 `unsafe\nS9`(MLCommons 위험 분류 코드).
 * 11/01 확인: 폭탄·마약·해킹·자해 같은 한국어 요청도 잡는다. 프롬프트 주입·모욕은 잡지 않는다(guard.ts가 따로 본다).
 */
export async function moderate(text: string): Promise<{ safe: boolean; category: string | null }> {
  const result = (await ai()!.run(AI_MODELS.moderation, { messages: [{ role: 'user', content: text }] })) as { response?: unknown };
  const verdict = String(result.response ?? '').trim();
  if (!verdict.startsWith('unsafe')) return { safe: true, category: null };
  return { safe: false, category: verdict.split('\n')[1]?.trim() ?? null };
}

type Completion = {
  choices?: { message?: { content?: string } }[];
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** 스트리밍 없이 한 번에 받는다(슈퍼바이저·공격 점검용). schema를 주면 JSON 모드(response_format json_schema)로 받는다. */
export async function complete(messages: ChatMessage[], maxTokens: number, schema?: object): Promise<{ text: string; usage: Usage }> {
  const { model, input } = chatInput(messages, maxTokens, false);
  const body = schema ? { ...input, response_format: { type: 'json_schema', json_schema: schema } } : input;
  const result = (await ai()!.run(model, body)) as Completion;
  const text = result.choices?.[0]?.message?.content ?? result.response ?? '';
  return {
    text: stripThink(text).trim(),
    usage: { tokensIn: result.usage?.prompt_tokens ?? 0, tokensOut: result.usage?.completion_tokens ?? 0 },
  };
}

type StreamEvent = {
  choices?: { delta?: { content?: string } }[];
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * 스트리밍 답변. 본문 조각마다 onDelta를 부르고, 끝나면 전체 본문과 토큰 수를 돌려준다. onDelta가 false를 돌려주면 거기서 끊는다.
 * Workers AI는 OpenAI 형식 조각(choices[].delta)을 보내다 마지막에 합계 usage만 담은 `{ response, usage }`를 보낸다.
 * 추론 조각(delta.reasoning·reasoning_content)은 버린다.
 */
export async function streamChat(
  messages: ChatMessage[],
  maxTokens: number,
  onDelta: (text: string) => Promise<boolean | void>,
): Promise<{ text: string; usage: Usage }> {
  const { model, input } = chatInput(messages, maxTokens, true);
  const stream = (await ai()!.run(model, input)) as ReadableStream<Uint8Array>;

  const decoder = new TextDecoder();
  let raw = '';
  let sent = 0;
  let buffer = '';
  let usage: Usage | null = null;
  const reader = stream.getReader();
  let stopped = false;
  while (!stopped) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const data = line.startsWith('data: ') ? line.slice(6).trim() : '';
      if (!data || data === '[DONE]') continue;
      let event: StreamEvent;
      try {
        event = JSON.parse(data) as StreamEvent;
      } catch {
        continue;
      }
      if (event.choices) raw += event.choices[0]?.delta?.content ?? '';
      else {
        raw += event.response ?? '';
        if (event.usage) usage = { tokensIn: event.usage.prompt_tokens ?? 0, tokensOut: event.usage.completion_tokens ?? 0 };
      }
      // <think> 블록이 열려 있는 동안은 내보내지 않는다. 앞쪽 공백은 버린다.
      const clean = stripThink(raw).replace(/^\s+/, '');
      if (clean.length > sent) {
        const keepGoing = await onDelta(clean.slice(sent));
        sent = clean.length;
        if (keepGoing === false) {
          stopped = true;
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
  }
  const text = stripThink(raw).trim();
  // 합계 usage가 오지 않으면 글자 수로 어림한다(한국어 약 1.5자/토큰).
  return {
    text,
    usage: usage ?? {
      tokensIn: Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 1.5),
      tokensOut: Math.ceil(text.length / 1.5),
    },
  };
}
