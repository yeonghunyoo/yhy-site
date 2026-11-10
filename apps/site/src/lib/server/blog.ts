// 블로그 읽기(docs/08-blog.md "사이트", S-017). 동기화(scripts/blog-sync.mjs)가 R2 blog/에 쓴 것을 요청 때 읽는다.
// Notion은 부르지 않는다. index.json은 이 isolate에 60초 기억해 R2 읽기를 줄인다(페이지 응답은 src/worker.ts가 엣지에 캐시).
import { env } from 'cloudflare:workers';
import type { Locale } from '../../i18n';

export interface BlogMeta {
  slug: string;
  locale: Locale;
  title: string;
  summary: string;
  date: string;
  updated: string;
  tags: string[];
  minutes: number;
  cover?: { url: string; width: number; height: number };
}
export interface BlogIndex {
  version: string;
  posts: BlogMeta[];
}
export interface BlogPost {
  meta: BlogMeta;
  html: string;
  toc: { depth: number; id: string; text: string }[];
}

interface R2Object {
  text(): Promise<string>;
}
interface R2Like {
  get(key: string): Promise<R2Object | null>;
}

const bucket = () => (env as unknown as { R2?: R2Like }).R2;
const EMPTY: BlogIndex = { version: '', posts: [] };
const TTL_MS = 60_000;
let memo: { at: number; index: BlogIndex } | null = null;

export async function getIndex(): Promise<BlogIndex> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.index;
  const r2 = bucket();
  let index = EMPTY;
  try {
    const obj = r2 ? await r2.get('blog/index.json') : null;
    if (obj) index = JSON.parse(await obj.text()) as BlogIndex;
  } catch (e) {
    console.error('blog index 읽기 실패', e);
  }
  memo = { at: Date.now(), index };
  return index;
}

export async function listPosts(locale: Locale): Promise<BlogMeta[]> {
  return (await getIndex()).posts.filter((p) => p.locale === locale);
}

/** 이 slug가 있는 언어들(hreflang·언어 전환) */
export async function localesOf(slug: string): Promise<Locale[]> {
  return (await getIndex()).posts.filter((p) => p.slug === slug).map((p) => p.locale);
}

export async function getPost(slug: string, locale: Locale): Promise<BlogPost | null> {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const listed = (await getIndex()).posts.some((p) => p.slug === slug && p.locale === locale);
  if (!listed) return null; // 공개가 풀린 글은 index에서 먼저 빠진다
  const obj = await bucket()?.get(`blog/posts/${slug}.${locale}.json`);
  if (!obj) {
    console.error(`blog 글 파일 없음: ${slug}.${locale}`);
    return null;
  }
  return JSON.parse(await obj.text()) as BlogPost;
}
