import { hc } from "hono/client";
import type { AppType } from "../../worker";

/** Worker 라우트와 타입이 자동으로 맞춰지는 API 클라이언트 */
export const api = hc<AppType>("/").api;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** hc 응답을 풀고, 실패하면 서버의 한국어 메시지로 ApiError를 던진다 */
type Body<R> = R extends { json(): Promise<infer T> } ? T : never;

export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(p: Promise<R>): Promise<Body<R>> {
  const res = await p;
  if (!res.ok) {
    let msg = "요청에 실패했어요";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      /* 본문 없음 */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<Body<R>>;
}

/** 진행률이 필요한 PUT 업로드 (fetch는 업로드 진행률을 주지 않는다) */
export function putWithProgress(url: string, body: Blob, contentType: string, onProgress?: (loaded: number) => void) {
  return new Promise<unknown>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      let data: { error?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error ?? "업로드에 실패했어요"));
    };
    xhr.onerror = () => reject(new ApiError(0, "네트워크 오류"));
    xhr.send(body);
  });
}
