// 히어로 장면 로컬 서버 — apps/site를 루트로 정적 파일을 낸다(scene.html, node_modules/three, hero-src 모델).
// 사용: pnpm hero:preview → http://localhost:4321/scripts/hero/scene.html  (모델: ?model=/hero-src/out/head.min.glb)
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.wasm': 'application/wasm' };

export function serve(port = 4321) {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      const file = await realpath(join(ROOT, path));
      // pnpm은 node_modules를 심볼릭 링크로 두므로 실제 경로가 레포 안이면 허용한다
      if (!file.startsWith(resolve(ROOT, '../..'))) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await serve(Number(process.env.PORT ?? 4321));
  console.log('http://localhost:4321/scripts/hero/scene.html');
}
