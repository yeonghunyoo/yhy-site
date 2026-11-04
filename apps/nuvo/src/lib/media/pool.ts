import type { ProcessedImage, ProcessOptions } from "./process";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

const JOB_TIMEOUT_MS = 120_000;

/**
 * 미디어 처리 Web Worker 풀. 해시·EXIF·썸네일·HEIC 디코딩을 메인 스레드 밖에서 처리한다.
 * 작업은 큐에 쌓이고, 쉬는 워커가 하나씩 가져간다.
 */
class MediaPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: { msg: Record<string, unknown>; p: Pending }[] = [];
  private pending = new Map<number, { p: Pending; w: Worker; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;
  readonly size = Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 4) / 2)));

  private spawn() {
    const w = new Worker(new URL("./media.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const job = this.pending.get(e.data.id);
      if (!job) return;
      clearTimeout(job.timer);
      this.pending.delete(e.data.id);
      if (e.data.ok) job.p.resolve(e.data.result);
      else job.p.reject(new Error(e.data.error));
      this.release(w);
    };
    w.onerror = (e) => this.kill(w, e.message || "이미지 처리 중 오류");
    this.workers.push(w);
    return w;
  }

  /** 워커가 죽거나 멈추면 그 워커의 작업을 실패 처리하고 새 워커로 교체 */
  private kill(w: Worker, reason: string) {
    for (const [id, job] of this.pending) {
      if (job.w === w) {
        clearTimeout(job.timer);
        job.p.reject(new Error(reason));
        this.pending.delete(id);
      }
    }
    this.workers = this.workers.filter((x) => x !== w);
    this.idle = this.idle.filter((x) => x !== w);
    w.terminate();
    this.pump();
  }

  private release(w: Worker) {
    this.idle.push(w);
    this.pump();
  }

  private pump() {
    while (this.queue.length) {
      let w = this.idle.pop();
      if (!w && this.workers.length < this.size) w = this.spawn();
      if (!w) return;
      const job = this.queue.shift()!;
      const id = ++this.seq;
      // 아주 큰 HEIC 등으로 워커가 응답 없이 멈추면 (onerror도 안 옴) 업로드 대기열 전체가 막힌다 → 시간 제한
      const timer = setTimeout(() => this.kill(w!, "이미지 처리 시간이 너무 오래 걸려요"), JOB_TIMEOUT_MS);
      this.pending.set(id, { p: job.p, w, timer });
      w.postMessage({ ...job.msg, id });
    }
  }

  private run<T>(msg: Record<string, unknown>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ msg, p: { resolve: resolve as (v: unknown) => void, reject } });
      this.pump();
    });
  }

  process(file: File, opts: ProcessOptions) {
    return this.run<ProcessedImage>({ kind: "process", file, opts });
  }

  decodeForView(file: File) {
    return this.run<Blob>({ kind: "view", file });
  }
}

export const mediaPool = new MediaPool();
