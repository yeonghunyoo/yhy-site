import type { MediaVariant } from "@nuvo/shared";

const enc = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string) {
  let k = keyCache.get(secret);
  if (!k) {
    k = crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
    keyCache.set(secret, k);
  }
  return k;
}

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hmac(secret: string, payload: string, bytes = 16) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return b64url(sig.slice(0, bytes));
}

/** 상수 시간 비교 */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const WINDOW = 6 * 60 * 60; // 6시간

/**
 * 만료 시각을 6시간 단위로 맞춘다 → 같은 사진의 URL이 몇 시간 동안 동일해서 브라우저 캐시가 잘 맞는다.
 * 유효 기간: 6~12시간.
 */
export function mediaExpiry(nowSec = Math.floor(Date.now() / 1000)) {
  return (Math.floor(nowSec / WINDOW) + 2) * WINDOW;
}

export async function signMediaUrl(secret: string, sha256: string, variant: MediaVariant, exp = mediaExpiry()) {
  const s = await hmac(secret, `m/${sha256}/${variant}/${exp}`);
  return `/m/${sha256}/${variant}?e=${exp}&s=${s}`;
}

export async function verifyMediaSig(secret: string, sha256: string, variant: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(await hmac(secret, `m/${sha256}/${variant}/${exp}`), sig);
}

/** 원본 업로드 영수증: 이 사용자가 이 sha256의 바이트를 실제로 올렸다는 증명 (1시간 유효) */
export async function signReceipt(secret: string, userId: string, sha256: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${exp}.${await hmac(secret, `r/${userId}/${sha256}/${exp}`)}`;
}

export async function verifyReceipt(secret: string, userId: string, sha256: string, receipt: string) {
  const [e, s] = receipt.split(".");
  const exp = Number(e);
  if (!s || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(await hmac(secret, `r/${userId}/${sha256}/${exp}`), s);
}

export function randomToken(bytes = 18) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return b64url(a.buffer);
}

export const r2Key = {
  original: (sha: string) => `o/${sha}`,
  thumb: (sha: string, size: number | string) => `t/${sha}/${size}`,
};
