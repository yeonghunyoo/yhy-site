// src/lib/redirects.ts 확인(11/09). 사용: node scripts/redirects-check.mjs — 틀리면 종료 코드 1
import { redirectFor } from '../src/lib/redirects.ts';

const cases = [
  ['GET', 'https://bettercurl.dev/ko', 301, 'https://bettercurl.dev/ko/'],
  ['GET', 'https://bettercurl.dev/en/privacy?x=1', 301, 'https://bettercurl.dev/en/privacy/?x=1'],
  ['HEAD', 'https://bettercurl.dev/ko/projects/nuvo', 301, 'https://bettercurl.dev/ko/projects/nuvo/'],
  ['GET', 'https://bettercurl.dev/ko/', null],
  ['GET', 'https://bettercurl.dev/ko/projects/nuvo/', null],
  ['GET', 'https://bettercurl.dev/', null],
  ['GET', 'https://bettercurl.dev/llms.txt', null],
  ['GET', 'https://bettercurl.dev/sitemap.xml', null],
  ['GET', 'https://bettercurl.dev/admin', null],
  ['POST', 'https://bettercurl.dev/api/letters', null],
  ['GET', 'https://bettercurl.dev/kor', null],
  ['GET', 'https://bettercurl.dev/ko/file.txt', null],
  ['GET', 'https://portfolio-web.yeonghun-yoo.workers.dev/ko?a=b', 301, 'https://bettercurl.dev/ko/?a=b'],
  ['GET', 'https://portfolio-web.yeonghun-yoo.workers.dev/', 301, 'https://bettercurl.dev/'],
  ['POST', 'https://portfolio-web.yeonghun-yoo.workers.dev/api/letters', 308, 'https://bettercurl.dev/api/letters'],
  ['GET', 'https://portfolio-web-dev.yeonghun-yoo.workers.dev/ko/', null], // dev Worker(S-021)는 그대로
  ['GET', 'https://portfolio-web-dev.yeonghun-yoo.workers.dev/ko', 301, 'https://portfolio-web-dev.yeonghun-yoo.workers.dev/ko/'],
];
let fail = 0;
for (const [method, url, status, location] of cases) {
  const r = redirectFor(new Request(url, { method }));
  const got = r ? [r.status, r.headers.get('location')] : [null, undefined];
  const ok = got[0] === status && (status === null || got[1] === location);
  if (!ok) fail++;
  console.log(ok ? 'ok  ' : 'FAIL', method, url, '→', got[0], got[1] ?? '');
}
process.exit(fail ? 1 : 0);
