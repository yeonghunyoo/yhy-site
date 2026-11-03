import { openDB, type DBSchema } from "idb";

export interface LocalFolder {
  id: string;
  name: string;
  /** handle: 폴더 참조 유지(Chrome/Edge) / snapshot: 1회성 스캔(그 외 브라우저) */
  mode: "handle" | "snapshot";
  handle?: FileSystemDirectoryHandle;
  addedAt: number;
  lastScanAt: number | null;
  count: number;
}

/** 이 PC에 있는 사진 1장의 인덱스 (원본은 PC에만 있다) */
export interface LocalItem {
  key: string; // `${folderId}:${path}`
  folderId: string;
  path: string;
  name: string;
  size: number;
  lastModified: number;
  mime: string;
  sha256: string;
  takenAt: number;
  width: number;
  height: number;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  dhash: string;
  blurhash: string;
}

interface LocalDB extends DBSchema {
  folders: { key: string; value: LocalFolder };
  items: { key: string; value: LocalItem; indexes: { folderId: string } };
  thumbs: { key: string; value: Blob };
}

let dbp: ReturnType<typeof openDB<LocalDB>> | null = null;

/** 브라우저 안에만 저장되는 로컬 인덱스. 서버로 아무것도 보내지 않는다. */
export function localDb() {
  dbp ??= openDB<LocalDB>("nuvo-local", 1, {
    upgrade(db) {
      db.createObjectStore("folders", { keyPath: "id" });
      const items = db.createObjectStore("items", { keyPath: "key" });
      items.createIndex("folderId", "folderId");
      db.createObjectStore("thumbs");
    },
  });
  return dbp;
}
