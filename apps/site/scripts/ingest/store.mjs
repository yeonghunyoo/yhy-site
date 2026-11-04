// 저장 — 원본은 R2 sources/(비공개), 이미지는 R2 media/(사이트 /media/*로 서빙). 키는 내용 해시라 같은 파일은 한 번만 올라간다.
// 설계: docs/06-ingest.md "3. 저장 (R2)". 업로드는 wrangler CLI(`wrangler login`)로 해서 API 키가 필요 없다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BUCKET = 'portfolio-rag';
const TMP_DIR = '.wrangler/tmp/ingest';
// 이미 올린 키 목록(로컬 캐시). R2 put은 같은 키면 덮어쓸 뿐이라 캐시가 없어도 결과는 같다 — 업로드 횟수만 줄인다.
const UPLOADED = '.wrangler/ingest-uploaded.json';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'text/markdown': 'md' };

function loadUploaded() {
  try {
    return new Set(JSON.parse(readFileSync(UPLOADED, 'utf8')));
  } catch {
    return new Set();
  }
}

/**
 * @param {{ upload: boolean }} options upload=false면 R2에 올리지 않고 .wrangler/tmp/ingest/에만 쓴다(미리보기·로그인 없는 환경)
 */
export function createStore({ upload }) {
  const uploaded = loadUploaded();
  let count = 0;

  function put(key, data, mime) {
    mkdirSync(join(TMP_DIR, key.split('/')[0]), { recursive: true });
    const path = join(TMP_DIR, key);
    if (!existsSync(path)) writeFileSync(path, data);
    if (!upload || uploaded.has(key)) return;
    execFileSync(
      './node_modules/.bin/wrangler',
      ['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', path, '--content-type', mime, '--remote'],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    uploaded.add(key);
    count++;
  }

  return {
    /** 원본 파일 → sources/{hash}.{ext}. 반환: 전체 해시 */
    source(data, mime) {
      const hash = sha256(data);
      put(`sources/${hash.slice(0, 32)}.${EXT[mime] ?? 'bin'}`, data, mime);
      return hash;
    },
    /** 이미지 → media/{hash}.{ext}. 반환: 사이트 경로 /media/{hash}.{ext} */
    media(data, mime) {
      const name = `${sha256(data).slice(0, 32)}.${EXT[mime]}`;
      put(`media/${name}`, data, mime);
      return `/media/${name}`;
    },
    /** 이번 실행에서 실제로 올린 수. 캐시를 저장한다 */
    finish() {
      if (upload) {
        mkdirSync('.wrangler', { recursive: true });
        writeFileSync(UPLOADED, JSON.stringify([...uploaded].sort()));
      }
      return count;
    },
  };
}

/** 본문의 임시 참조(images/…)를 저장한 URL로 바꾼다. 참조가 없는 이미지는 버린다. */
export function rewriteImageRefs(markdown, images, store) {
  let out = markdown;
  for (const image of images) {
    const url = store.media(image.data, image.mime);
    out = out.split(`](${image.ref})`).join(`](${url})`);
  }
  return out;
}
