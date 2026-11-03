/// <reference lib="webworker" />
import { decodeForView, processImage, type ProcessOptions } from "./process";

type Req =
  | { id: number; kind: "process"; file: File; opts: ProcessOptions }
  | { id: number; kind: "view"; file: File };

self.onmessage = async (e: MessageEvent<Req>) => {
  const req = e.data;
  try {
    const result = req.kind === "process" ? await processImage(req.file, req.opts) : await decodeForView(req.file);
    self.postMessage({ id: req.id, ok: true, result });
  } catch (err) {
    self.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
