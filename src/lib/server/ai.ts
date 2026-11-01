import { env } from 'cloudflare:workers';

// Workers AI 어댑터 — 답변·재작성·임베딩·리랭크를 모두 `AI` 바인딩 하나로 부른다(docs/05-06-chat-rag.md).
// 모델을 바꿀 때는 이 상수만 고친다.
export const AI_MODELS = {
  chat: '@cf/qwen/qwen3-30b-a3b-fp8',
  embedding: '@cf/baai/bge-m3',
  rerank: '@cf/baai/bge-reranker-base',
} as const;

/** Qwen3는 사용자 턴 끝의 `/no_think`로 추론을 끈다. 짧은 사실 답변이라 끄고 지연·비용을 줄인다. */
const NO_THINK = ' /no_think';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Usage = { tokensIn: number; tokensOut: number };

interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}
const ai = () => (env as unknown as { AI?: AiBinding }).AI;
export const hasAi = () => Boolean(ai());

function withNoThink(messages: ChatMessage[]): ChatMessage[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return messages;
  return [...messages.slice(0, -1), { ...last, content: last.content + NO_THINK }];
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

type Completion = {
  choices?: { message?: { content?: string } }[];
  response?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** 스트리밍 없이 한 번에 받는다(질문 재작성용). */
export async function complete(messages: ChatMessage[], maxTokens: number): Promise<{ text: string; usage: Usage }> {
  const result = (await ai()!.run(AI_MODELS.chat, { messages: withNoThink(messages), max_tokens: maxTokens })) as Completion;
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
 * 추론 조각(delta.reasoning_content)은 버린다.
 */
export async function streamChat(
  messages: ChatMessage[],
  maxTokens: number,
  onDelta: (text: string) => Promise<boolean | void>,
): Promise<{ text: string; usage: Usage }> {
  const stream = (await ai()!.run(AI_MODELS.chat, {
    messages: withNoThink(messages),
    max_tokens: maxTokens,
    stream: true,
  })) as ReadableStream<Uint8Array>;

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
