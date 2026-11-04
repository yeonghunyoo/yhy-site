// 마크다운 파서 — 본문은 그대로 두고, 상대 경로 로컬 이미지(![](img/a.png))만 꺼내 R2로 보낸다.
// 외부 URL 이미지는 내려받지 않는다(docreader도 원격 이미지는 받지 않는다). 검토 때 지우거나 직접 받아 상대 경로로 바꾼다.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export const markdownParser = {
  name: 'markdown',
  extensions: ['.md'],
  async parse(data, file) {
    let markdown = new TextDecoder().decode(data);
    const fm = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) markdown = markdown.slice(fm[0].length);
    const title = fm?.[1].match(/^title:\s*(.+)$/m)?.[1].trim() ?? markdown.match(/^#\s+(.+)$/m)?.[1].trim();

    const images = [];
    for (const [, , ref] of markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      if (/^([a-z]+:|\/)/i.test(ref) || images.some((i) => i.ref === ref)) {
        if (/^https?:/i.test(ref)) console.warn(`  외부 이미지 ${ref} — 내려받지 않는다. 검토 때 지우거나 로컬 파일로 바꾼다`);
        continue;
      }
      const path = resolve(dirname(file), ref);
      const mime = MIME[extname(path).toLowerCase()];
      if (!mime || !existsSync(path)) {
        console.warn(`  이미지 ${ref} — 파일이 없거나 지원하지 않는 형식(jpg·png·webp)`);
        continue;
      }
      images.push({ ref, data: new Uint8Array(readFileSync(path)), mime, kind: 'local' });
    }
    return { markdown: markdown.trim(), images, metadata: { title, parser: this.name } };
  },
};
