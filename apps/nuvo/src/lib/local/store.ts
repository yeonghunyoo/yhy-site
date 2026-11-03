import { isSupportedImage } from "@nuvo/shared";
import { useSyncExternalStore } from "react";
import { mediaPool } from "../media/pool";
import { localDb, type LocalFolder, type LocalItem } from "./db";

export type Permission = "granted" | "prompt" | "denied" | "n/a";

export interface ScanProgress {
  folderId: string;
  phase: "listing" | "processing" | "done";
  found: number;
  processed: number;
  failed: number;
}

interface State {
  ready: boolean;
  folders: LocalFolder[];
  items: LocalItem[];
  permissions: Record<string, Permission>;
  scans: Record<string, ScanProgress>;
}

const SKIP_DIRS = /^(\.|@eaDir$|\$RECYCLE\.BIN$|System Volume Information$|node_modules$)/;

let state: State = { ready: false, folders: [], items: [], permissions: {}, scans: {} };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** snapshot 모드 폴더의 파일은 이번 세션 동안만 메모리에 보관 */
const sessionFiles = new Map<string, File>();

export const supportsFolderHandles = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

export function useLocal() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export async function initLocal() {
  if (state.ready) return;
  const db = await localDb();
  const [folders, items] = await Promise.all([db.getAll("folders"), db.getAll("items")]);
  const permissions: Record<string, Permission> = {};
  for (const f of folders) {
    permissions[f.id] = f.handle ? ((await f.handle.queryPermission({ mode: "read" })) as Permission) : "n/a";
  }
  set({ ready: true, folders, items, permissions });
}

/** 폴더 연결 (Chrome/Edge). 선택한 폴더를 기억해 두고 다음 방문 때 다시 읽는다. */
export async function addFolderWithPicker() {
  const handle = await window.showDirectoryPicker!({ id: "nuvo-photos", mode: "read" });
  const db = await localDb();
  const existing = state.folders.find((f) => f.handle && f.name === handle.name);
  if (existing?.handle && (await existing.handle.isSameEntry(handle))) {
    await scanFolder(existing.id);
    return existing;
  }
  const folder: LocalFolder = { id: crypto.randomUUID(), name: handle.name, mode: "handle", handle, addedAt: Date.now(), lastScanAt: null, count: 0 };
  await db.put("folders", folder);
  set({ folders: [...state.folders, folder], permissions: { ...state.permissions, [folder.id]: "granted" } });
  void scanFolder(folder.id);
  return folder;
}

/** 폴더 참조를 지원하지 않는 브라우저: <input webkitdirectory>로 받은 파일 목록을 1회 스캔 */
export async function addFolderSnapshot(files: FileList | File[]) {
  const all = [...files];
  const list = all.filter((f) => isSupportedImage(f.name, f.type));
  if (list.length === 0) throw new Error("이 폴더에는 사진이 없어요");
  const root = (all[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split("/")[0] || "폴더";
  // 같은 이름의 폴더를 다시 고르면 새로 만들지 않고 기존 인덱스를 갱신한다 (IndexedDB가 계속 커지지 않게)
  const existing = state.folders.find((f) => f.mode === "snapshot" && f.name === root);
  const folder: LocalFolder = existing ?? { id: crypto.randomUUID(), name: root, mode: "snapshot", addedAt: Date.now(), lastScanAt: null, count: 0 };
  if (!existing) {
    const db = await localDb();
    await db.put("folders", folder);
    set({ folders: [...state.folders, folder], permissions: { ...state.permissions, [folder.id]: "n/a" } });
  }
  const entries = list.map((f) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return { path: rel.split("/").slice(1).join("/") || f.name, file: f };
  });
  await processEntries(folder, entries);
}

export async function requestFolderPermission(folderId: string) {
  const f = state.folders.find((x) => x.id === folderId);
  if (!f?.handle) return false;
  const p = (await f.handle.requestPermission({ mode: "read" })) as Permission;
  set({ permissions: { ...state.permissions, [folderId]: p } });
  return p === "granted";
}

export async function removeFolder(folderId: string) {
  const db = await localDb();
  const keys = state.items.filter((i) => i.folderId === folderId).map((i) => i.key);
  const tx = db.transaction(["folders", "items", "thumbs"], "readwrite");
  await Promise.all([
    tx.objectStore("folders").delete(folderId),
    ...keys.flatMap((k) => [tx.objectStore("items").delete(k), tx.objectStore("thumbs").delete(k)]),
    tx.done,
  ]);
  keys.forEach((k) => sessionFiles.delete(k));
  set({ folders: state.folders.filter((f) => f.id !== folderId), items: state.items.filter((i) => i.folderId !== folderId) });
}

async function* walk(dir: FileSystemDirectoryHandle, prefix = ""): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "directory") {
      if (!SKIP_DIRS.test(name)) yield* walk(h as FileSystemDirectoryHandle, `${prefix}${name}/`);
    } else if (isSupportedImage(name, "")) {
      yield { path: `${prefix}${name}`, handle: h as FileSystemFileHandle };
    }
  }
}

/** 폴더 다시 읽기: 크기·수정 시각이 같은 파일은 건너뛰고, 사라진 파일은 인덱스에서 뺀다 */
export async function scanFolder(folderId: string) {
  const folder = state.folders.find((f) => f.id === folderId);
  if (!folder?.handle || state.scans[folderId]?.phase === "listing" || state.scans[folderId]?.phase === "processing") return;
  if ((await folder.handle.queryPermission({ mode: "read" })) !== "granted") {
    if (!(await requestFolderPermission(folderId))) return;
  }
  setScan(folderId, { phase: "listing", found: 0, processed: 0, failed: 0 });
  try {
    const entries: { path: string; file: File }[] = [];
    let unreadable = 0;
    for await (const e of walk(folder.handle)) {
      try {
        entries.push({ path: e.path, file: await e.handle.getFile() });
      } catch {
        // 잠긴 파일이나 스캔 중 지워진 파일은 건너뛴다
        unreadable++;
      }
      if (entries.length % 200 === 0) setScan(folderId, { found: entries.length });
    }
    await processEntries(folder, entries, unreadable);
  } catch (e) {
    // 폴더 권한이 사라지는 등 목록을 끝까지 못 읽음 → 단계를 풀어 두어야 다음에 다시 스캔할 수 있다
    console.warn("폴더 스캔 실패", e);
    setScan(folderId, { phase: "done" });
    const p = (await folder.handle.queryPermission({ mode: "read" }).catch(() => "denied")) as Permission;
    set({ permissions: { ...state.permissions, [folderId]: p } });
  }
}

function setScan(folderId: string, patch: Partial<ScanProgress>) {
  const prev = state.scans[folderId] ?? { folderId, phase: "listing", found: 0, processed: 0, failed: 0 };
  set({ scans: { ...state.scans, [folderId]: { ...prev, ...patch } } });
}

async function processEntries(folder: LocalFolder, entries: { path: string; file: File }[], unreadable = 0) {
  const db = await localDb();
  const known = new Map(state.items.filter((i) => i.folderId === folder.id).map((i) => [i.path, i]));
  const seen = new Set<string>();
  const todo: { path: string; file: File }[] = [];
  for (const e of entries) {
    seen.add(e.path);
    if (folder.mode === "snapshot") sessionFiles.set(`${folder.id}:${e.path}`, e.file);
    const k = known.get(e.path);
    if (!k || k.size !== e.file.size || k.lastModified !== e.file.lastModified) todo.push(e);
  }
  setScan(folder.id, { phase: "processing", found: entries.length, processed: entries.length - todo.length, failed: 0 });

  // 사라진 파일 정리
  const gone = [...known.values()].filter((i) => !seen.has(i.path));
  if (gone.length) {
    const tx = db.transaction(["items", "thumbs"], "readwrite");
    await Promise.all([...gone.flatMap((g) => [tx.objectStore("items").delete(g.key), tx.objectStore("thumbs").delete(g.key)]), tx.done]);
  }

  let processed = entries.length - todo.length;
  let failed = unreadable;
  let batch: LocalItem[] = [];
  let lastFlush = Date.now();
  const flush = () => {
    if (!batch.length) return;
    const add = new Map(batch.map((b) => [b.key, b]));
    const goneKeys = new Set(gone.map((g) => g.key));
    set({ items: [...state.items.filter((i) => !add.has(i.key) && !goneKeys.has(i.key)), ...batch] });
    batch = [];
  };

  await Promise.all(
    todo.map(async ({ path, file }) => {
      try {
        const r = await mediaPool.process(file, { display: false });
        const item: LocalItem = {
          key: `${folder.id}:${path}`,
          folderId: folder.id,
          path,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          mime: r.mime,
          sha256: r.sha256,
          takenAt: r.takenAt,
          width: r.width,
          height: r.height,
          lat: r.lat,
          lng: r.lng,
          camera: r.camera,
          dhash: r.dhash,
          blurhash: r.blurhash,
        };
        const tx = db.transaction(["items", "thumbs"], "readwrite");
        await Promise.all([tx.objectStore("items").put(item), tx.objectStore("thumbs").put(r.thumb, item.key), tx.done]);
        batch.push(item);
        processed++;
      } catch (e) {
        console.warn("로컬 사진 처리 실패", path, e);
        failed++;
      }
      // 진행 표시는 96장마다 또는 0.5초마다 (적은 장수도 진행이 보이게)
      if (batch.length >= 96 || Date.now() - lastFlush > 500) {
        lastFlush = Date.now();
        flush();
        setScan(folder.id, { processed, failed });
      }
    }),
  );
  flush();
  if (gone.length) set({ items: state.items.filter((i) => !gone.some((g) => g.key === i.key)) });

  const count = state.items.filter((i) => i.folderId === folder.id).length;
  const updated: LocalFolder = { ...folder, lastScanAt: Date.now(), count };
  await db.put("folders", updated);
  set({ folders: state.folders.map((f) => (f.id === folder.id ? updated : f)) });
  setScan(folder.id, { phase: "done", processed, failed });
}

/** 원본 파일 읽기 (PC에서 직접). 권한이 없으면 null. */
export async function getLocalFile(item: LocalItem): Promise<File | null> {
  const mem = sessionFiles.get(item.key);
  if (mem) return mem;
  const folder = state.folders.find((f) => f.id === item.folderId);
  if (!folder?.handle) return null;
  if ((await folder.handle.queryPermission({ mode: "read" })) !== "granted") return null;
  try {
    const parts = item.path.split("/");
    let dir = folder.handle;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    return await (await dir.getFileHandle(parts.at(-1)!)).getFile();
  } catch {
    return null; // 파일이 옮겨졌거나 삭제됨 → 다음 스캔 때 정리
  }
}

/* ───── 로컬 썸네일 object URL 캐시 (보이는 칸만 만들고, 넘치면 오래된 것부터 해제) ───── */

const thumbUrls = new Map<string, string>();
const MAX_URLS = 800;

export async function localThumbUrl(key: string): Promise<string | null> {
  const hit = thumbUrls.get(key);
  if (hit) {
    thumbUrls.delete(key);
    thumbUrls.set(key, hit);
    return hit;
  }
  const blob = await (await localDb()).get("thumbs", key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  thumbUrls.set(key, url);
  if (thumbUrls.size > MAX_URLS) {
    const [oldKey, oldUrl] = thumbUrls.entries().next().value!;
    thumbUrls.delete(oldKey);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

export const localThumbBlob = async (key: string) => (await localDb()).get("thumbs", key);
