// scripts/blog/convert.mjs 확인(11/10). 사용: node scripts/blog/convert-check.mjs — 틀리면 종료 코드 1
import { readFileSync } from 'node:fs';
import { renderPost, normalizeNotionMarkdown, checkMeta } from './convert.mjs';

const md = readFileSync(new URL('./fixture.md', import.meta.url), 'utf8');
const seen = [];
const { html, toc, images, warnings } = await renderPost(md, {
  resolveImage: async (src, alt) => (seen.push([src, alt]), { url: `/blog/img/${String(seen.length).padStart(32, '0')}.webp`, width: 800, height: 600 }),
});

let fail = 0;
const ok = (cond, name) => {
  if (!cond) fail++;
  console.log(cond ? 'ok  ' : 'FAIL', name);
};
ok(/<h2 id="실험">실험<\/h2>/.test(html), '제목 h2 + id');
ok(/<table>[\s\S]*<(b|strong)>13분<\/(b|strong)>/.test(html), '표와 굵게');
ok(/<code>raw<\/code>/.test(html), '코드');
ok(/<figure><img src="\/blog\/img\/0+1\.webp" alt="정제 버전 — 홈" width="800" height="600" decoding="async" fetchpriority="high"><figcaption>정제 버전 — 홈<\/figcaption><\/figure>/.test(html), '그림·캡션·첫 이미지 우선');
ok(/<img src="\/blog\/img\/0+2\.webp" alt="" [^>]*loading="lazy"/.test(html), '두 번째 이미지 lazy');
ok(seen[0][0].startsWith('notion-file-block://') && seen[1][0] === 'https://example.com/no-caption.png', 'resolveImage에 원래 주소');
ok(/<aside class="callout">[\s\S]*<(b|strong)>핵심<\/(b|strong)>[\s\S]*단계 구조가 버그를 막았다\.[\s\S]*<\/aside>/.test(html), '콜아웃 → aside, 안의 마크다운');
ok(/왼쪽 단[\s\S]*오른쪽 단/.test(html) && !/column/.test(html), '단 펼침');
ok(!/notion\.so/.test(html) && /비공개 페이지를 참고/.test(html), '멘션은 글자만');
ok(/<a href="https:\/\/developers\.notion\.com" rel="noopener" target="_blank">/.test(html), '바깥 링크 noopener');
ok(!/<script|alert\(|style=|color=/.test(html), '스크립트·style·색 제거');
ok(!/video/.test(html) && warnings.some((w) => /video/.test(w.msg)), '동영상 뺌 + 경고');
ok(warnings.some((w) => /캡션/.test(w.msg)), '캡션 없는 이미지 경고');
ok(toc.length === 2 && toc[0].depth === 2 && toc[1].depth === 3, '목차 h2·h3');
ok(images.length === 2, '이미지 2개');
ok(normalizeNotionMarkdown('a\n<unknown url="x"/>').warnings.some((w) => w.fatal), '<unknown>은 치명');
ok(/<h2/.test((await renderPost('# 큰 제목\n\n## 작은', { resolveImage: async () => null })).html.split('\n')[0]), 'h1은 h2로 내림');
const m = checkMeta({ title: 't', slug: 'Bad Slug', locale: 'ko', date: '2026-11-10', summary: '짧음' });
ok(m.errors.some((e) => /slug/.test(e)) && m.warns.length === 1, '메타 점검');
ok(/<div class="blog-embed" data-blog-component="scramble" data-props="\{&#x22;text&#x22;:&#x22;BETTER CALL YH!&#x22;\}"><p class="blog-embed-fallback">글자가 기호에서 풀린다\.<\/p><\/div>/.test(html), '자리표시 컴포넌트 → 빈 자리 + 대체 글');
ok(!/evil-thing/.test(html) && /<p class="blog-embed-fallback">허용 목록에 없는 컴포넌트\.<\/p>/.test(html) && warnings.some((w) => /evil-thing/.test(w.msg)), '허용 목록 밖은 대체 글만 + 경고');
ok(/<pre><span class="code-ln" aria-hidden="true">1<\/span><code class="hljs language-javascript">[\s\S]*console[\s\S]*<\/code><\/pre>/.test(html), '보통 코드 블록: 줄 번호 + 문법 색');

// 단계·탭(S-020): Notion 2열 블록 + 탭 블록(fixture-steps.md는 Notion에서 다시 읽은 실제 형식)
const steps = (await renderPost(readFileSync(new URL('./fixture-steps.md', import.meta.url), 'utf8'), { resolveImage: async () => null })).html;
ok((steps.match(/<div class="blog-steps">/g) ?? []).length === 1 && (steps.match(/<div class="blog-step">/g) ?? []).length === 3, '이어진 2열 블록 3개 → 단계 묶음 1개·단계 3개');
ok(/<div class="blog-step-text">\s*<h3 id="sdk-설치">SDK 설치<\/h3>/.test(steps), '단계 왼쪽: 소제목 + 설명');
ok(/<div class="code-tabs">\s*<div class="code-tab" data-label="npm">\s*<p class="code-label">npm<\/p>[\s\S]*data-label="pnpm"/.test(steps), '탭 여럿 → code-tabs(npm·pnpm)');
ok(/<div class="code-file">\s*<div class="code-tab" data-label="proxy\.ts">/.test(steps), '탭 하나 → 파일명 이름표');
ok(/<span class="hljs-keyword">import<\/span>/.test(steps), '문법 색(클래스)');
ok(/<\/div><\/div><h2 id="단계-밖의-보통-코드">/.test(steps.replace(/\n/g, '')), '2열 밖 코드는 단계 밖');

if (fail) console.log('\n' + html);
process.exit(fail ? 1 : 0);
