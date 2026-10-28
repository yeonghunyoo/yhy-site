import { env, waitUntil } from 'cloudflare:workers';
import { notify } from './notify';

/** 5xx를 Telegram으로 알린다. 1분에 1회로 묶는다(KV 키로 중복 억제). */
export function report5xx(path: string, message: string): void {
  console.error(`[5xx] ${path} ${message}`);
  const minute = new Date().toISOString().slice(0, 16);
  const key = `notify:5xx:${minute}`;
  waitUntil(
    (async () => {
      if (await env.KV.get(key)) return;
      await env.KV.put(key, '1', { expirationTtl: 120 });
      notify(`🔥 5xx ${path}\n${message.slice(0, 120)}`);
    })().catch(() => {}),
  );
}
