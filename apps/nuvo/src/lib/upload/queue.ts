import { guessMime, isSupportedImage, MAX_UPLOAD_BYTES, type AssetMeta, type UploadAction } from "@nuvo/shared";
import { useSyncExternalStore } from "react";
import { api, ApiError, putWithProgress, unwrap } from "../api";
import { queryClient } from "../query";
import { mediaPool } from "../media/pool";

export type UploadStatus = "queued" | "processing" | "uploading" | "done" | "skipped" | "error";

export interface UploadItem {
  id: number;
  name: string;
  size: number;
  libraryId: string;
  status: UploadStatus;
  loaded: number;
  error?: string;
}

interface Job {
  item: UploadItem;
  getFile: () => Promise<File | null>;
  retried?: boolean;
}

let items: UploadItem[] = [];
const jobs: Job[] = [];
let active = 0;
let seq = 0;
const CONCURRENCY = 3;
const listeners = new Set<() => void>();
const emit = () => {
  items = [...items];
  listeners.forEach((l) => l());
};

function update(id: number, patch: Partial<UploadItem>) {
  const i = items.findIndex((x) => x.id === id);
  if (i >= 0) items[i] = { ...items[i]!, ...patch };
  emit();
}

export function useUploads() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
  );
}

export function clearFinished() {
  items = items.filter((i) => !["done", "skipped", "error"].includes(i.status));
  emit();
}

/**
 * 업로드 대기열에 추가. getFile을 늦게 부르는 이유: 로컬 폴더 사진은 차례가 올 때 PC에서 읽는다.
 */
export function enqueue(libraryId: string, files: { name: string; size: number; getFile: () => Promise<File | null> }[]) {
  for (const f of files) {
    const item: UploadItem = { id: ++seq, name: f.name, size: f.size, libraryId, status: "queued", loaded: 0 };
    items.push(item);
    jobs.push({ item, getFile: f.getFile });
  }
  emit();
  pump();
}

export function enqueueFiles(libraryId: string, files: File[]) {
  const ok = files.filter((f) => isSupportedImage(f.name, f.type));
  enqueue(
    libraryId,
    ok.map((f) => ({ name: f.name, size: f.size, getFile: async () => f })),
  );
  return { accepted: ok.length, rejected: files.length - ok.length };
}

function pump() {
  while (active < CONCURRENCY && jobs.length) {
    const job = jobs.shift()!;
    active++;
    run(job).finally(() => {
      active--;
      pump();
      if (active === 0 && jobs.length === 0) onIdle();
    });
  }
}

const touched = new Set<string>();
function onIdle() {
  for (const libraryId of touched) {
    void queryClient.invalidateQueries({ queryKey: ["assets", libraryId] });
  }
  touched.clear();
  void queryClient.invalidateQueries({ queryKey: ["me"] });
  void queryClient.invalidateQueries({ queryKey: ["space"] });
  void queryClient.invalidateQueries({ queryKey: ["activities"] });
  void queryClient.invalidateQueries({ queryKey: ["backup-status"] });
}

async function run(job: Job) {
  const { item, getFile } = job;
  const { id, libraryId } = item;
  try {
    const file = await getFile();
    if (!file) throw new Error("파일을 읽을 수 없어요 (폴더 권한을 확인해 주세요)");
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("100MB보다 큰 파일은 아직 올릴 수 없어요");

    update(id, { status: "processing" });
    const p = await mediaPool.process(file, { display: true });
    const mime = guessMime(file.name, file.type);

    const prep = await unwrap(
      api.uploads.prepare.$post({ json: { libraryId, files: [{ sha256: p.sha256, size: p.size, mime }] } }),
    );
    const action = (prep.results[0] as UploadAction).action;
    if (action === "skip") {
      update(id, { status: "skipped", loaded: item.size });
      return;
    }

    let receipt: string | undefined;
    if (action === "upload") {
      update(id, { status: "uploading" });
      const q = `libraryId=${libraryId}`;
      const res = (await putWithProgress(`/api/uploads/blob/${p.sha256}?${q}`, file, mime, (loaded) =>
        update(id, { loaded }),
      )) as { receipt: string };
      receipt = res.receipt;
      // 썸네일은 원본을 올린 영수증이 있어야 받아 준다
      const tq = `receipt=${encodeURIComponent(receipt)}`;
      await putWithProgress(`/api/uploads/blob/${p.sha256}/thumb/512?${tq}`, p.thumb, p.thumb.type);
      if (p.display) await putWithProgress(`/api/uploads/blob/${p.sha256}/thumb/2048?${tq}`, p.display, p.display.type);
    }

    const meta: AssetMeta = {
      sha256: p.sha256,
      size: p.size,
      mime,
      width: p.width,
      height: p.height,
      filename: file.name.slice(0, 255),
      takenAt: Math.round(p.takenAt),
      lat: p.lat,
      lng: p.lng,
      camera: p.camera,
      dhash: p.dhash,
      blurhash: p.blurhash,
      receipt,
    };
    await unwrap(api.uploads.complete.$post({ json: { libraryId, items: [meta] } }));
    touched.add(libraryId);
    update(id, { status: "done", loaded: item.size });
  } catch (e) {
    // 409: 같은 사진이 다른 곳에서 동시에 지워짐 → 처음부터 한 번 더 (prepare가 다시 판단)
    if (e instanceof ApiError && e.status === 409 && !job.retried) {
      update(id, { status: "queued", loaded: 0 });
      jobs.unshift({ ...job, retried: true });
      return;
    }
    const msg = e instanceof ApiError || e instanceof Error ? e.message : "업로드 실패";
    update(id, { status: "error", error: msg });
    if (e instanceof ApiError && (e.status === 413 || e.status === 507)) {
      // 413: 이 라이브러리 용량 초과 → 같은 라이브러리 작업 중단
      // 507: 서비스 전체 저장 공간이 가득 참 → 남은 작업 모두 중단
      const all = e.status === 507;
      for (let i = jobs.length - 1; i >= 0; i--) {
        if (all || jobs[i]!.item.libraryId === libraryId) {
          update(jobs[i]!.item.id, { status: "error", error: msg });
          jobs.splice(i, 1);
        }
      }
    }
  }
}
