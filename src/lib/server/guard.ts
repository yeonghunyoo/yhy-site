import { env } from 'cloudflare:workers';
import type { Locale } from '../../i18n';

// 챗 가드레일(docs/05-06-chat-rag.md "보안·가드레일"). 모델 앞뒤에서 결정적으로 막을 수 있는 것은 여기서 막는다.

export type GuardFlag = 'injection' | 'unsafe' | 'self_harm' | 'out_of_scope' | 'output_blocked';

/** 지시를 바꾸거나 숨은 설정을 꺼내려는 노골적인 요청. 오탐을 줄이려고 "무엇을 + 어떻게" 짝으로만 잡는다. */
const INJECTION = [
  /\b(ignore|disregard|forget|override)\b[^.?!\n]{0,30}\b(previous|prior|above|earlier|all|your)\b[^.?!\n]{0,20}\b(instructions?|rules?|prompts?|guidelines?)\b/i,
  /(이전|위의?|앞의?|기존|모든|원래)\s*(의\s*)?(지시|지침|명령|규칙|프롬프트|설정)[^.?!\n]{0,15}(무시|잊|따르지\s*마|취소)/,
  /\b(system|developer|hidden)\s*(prompt|message|instructions?)\b[^.?!\n]{0,30}\b(show|print|reveal|repeat|output|display|tell)\b/i,
  /\b(show|print|reveal|repeat|output|display|tell)\b[^.?!\n]{0,30}\b(system|developer|hidden)\s*(prompt|message|instructions?)\b/i,
  /(시스템|개발자|숨은|내부)\s*(프롬프트|메시지|지시|지침|설정)[^.?!\n]{0,20}(보여|출력|알려|공개|그대로|말해|읊어)/,
  /\b(jailbreak|DAN mode|developer mode)\b|탈옥|제약\s*없는\s*모드/i,
];
export const detectInjection = (text: string) => INJECTION.some((re) => re.test(text));

/** 답변 출력 검사: 포트폴리오 챗은 코드를 쓰지 않는다 — 코드 블록이 나오면 거기서 끊는다. */
export const outputBlocked = (text: string) => text.includes('```');

export const GUARD_REPLY: Record<'injection' | 'unsafe' | 'self_harm' | 'output_blocked', Record<Locale, string>> = {
  injection: {
    ko: '그 요청은 도와드릴 수 없어요. yhy의 프로젝트나 기술, 연락 방법을 물어봐 주세요.',
    en: "I can't help with that. Ask me about yhy's projects, stack, or how to get in touch.",
  },
  unsafe: {
    ko: '그 요청은 도와드릴 수 없어요. 포트폴리오에 관한 질문이면 답할게요.',
    en: "I can't help with that. I'm happy to answer questions about the portfolio.",
  },
  // 자해 관련(Llama Guard S11)은 거절 대신 도움받을 곳을 안내한다.
  self_harm: {
    ko: '많이 힘드신 것 같아요. 혼자 견디지 마시고 자살예방상담전화 109(24시간)나 가까운 사람에게 지금 이야기해 주세요. 위급하면 112·119에 연락해 주세요.',
    en: "It sounds like you're going through a lot. Please reach out to someone you trust or a local crisis line right now, and call your local emergency number if you're in danger.",
  },
  output_blocked: {
    ko: '(여기까지만 답할게요. 포트폴리오에 관한 질문을 해 주세요.)',
    en: "(I'll stop here. Please ask about the portfolio.)",
  },
};

// 대화 이력 서명: 서버가 만든 답변에만 HMAC을 붙여 돌려주고, 다음 요청에서 서명이 맞는 답변만 이력으로 받는다.
// 클라이언트가 "assistant" 턴을 지어내 모델을 조종하는 것을 막는다.
let keyPromise: Promise<CryptoKey> | null = null;
const key = () =>
  (keyPromise ??= crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`chat-history:${env.BETTER_AUTH_SECRET}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  ));

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function signTurn(content: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await key(), new TextEncoder().encode(content));
  return toBase64Url(new Uint8Array(mac));
}

export async function verifyTurn(content: string, sig: unknown): Promise<boolean> {
  if (typeof sig !== 'string' || !sig) return false;
  return (await signTurn(content)) === sig;
}
