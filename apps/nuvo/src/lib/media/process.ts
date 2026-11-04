/// <reference lib="webworker" />
import exifr from "exifr";
import { encode as encodeBlurhash } from "blurhash";

export interface ProcessOptions {
  /** 보기용 2048px 이미지도 만들지 (업로드 시 true, 로컬 스캔 시 false) */
  display: boolean;
}

export interface ProcessedImage {
  sha256: string;
  size: number;
  mime: string;
  width: number;
  height: number;
  takenAt: number;
  lat: number | null;
  lng: number | null;
  camera: string | null;
  dhash: string;
  blurhash: string;
  thumb: Blob;
  display: Blob | null;
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

export const isHeicLike = (file: File) =>
  /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);

/** HEIC는 Chrome/Firefox가 직접 못 열어서 WASM(libheif)으로 디코딩한다. 필요할 때만 로드. */
async function decode(file: File): Promise<ImageBitmap> {
  if (isHeicLike(file)) {
    const { heicTo } = await import("heic-to");
    return heicTo({ blob: file, type: "bitmap" });
  }
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function fit(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function resized(src: ImageBitmap, w: number, h: number, quality: ResizeQuality = "high") {
  return createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: quality });
}

/** WebP 우선, 지원 안 되면(Safari) JPEG */
async function encode(bmp: ImageBitmap, q: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0);
  const webp = await canvas.convertToBlob({ type: "image/webp", quality: q });
  if (webp.type === "image/webp") return webp;
  return canvas.convertToBlob({ type: "image/jpeg", quality: q });
}

function pixels(bmp: ImageBitmap) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
}

/** dHash: 9×8 흑백으로 줄여 좌우 밝기 비교 → 64bit. 리사이즈·재압축(카톡 전송 등)에 강하다. */
async function dhash(src: ImageBitmap) {
  const small = await resized(src, 9, 8, "medium");
  const px = pixels(small);
  small.close();
  const gray = (i: number) => px[i * 4]! * 0.299 + px[i * 4 + 1]! * 0.587 + px[i * 4 + 2]! * 0.114;
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (gray(y * 9 + x) < gray(y * 9 + x + 1) ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

async function blurhashOf(src: ImageBitmap) {
  const { w, h } = fit(src.width, src.height, 32);
  const small = await resized(src, w, h, "medium");
  const px = pixels(small);
  small.close();
  return encodeBlurhash(new Uint8ClampedArray(px), w, h, 4, 3);
}

interface Exif {
  DateTimeOriginal?: Date;
  CreateDate?: Date;
  latitude?: number;
  longitude?: number;
  Make?: string;
  Model?: string;
}

async function readExif(buf: ArrayBuffer): Promise<Exif> {
  try {
    return ((await exifr.parse(buf, {
      pick: ["DateTimeOriginal", "CreateDate", "Make", "Model", "GPSLatitude", "GPSLongitude", "GPSLatitudeRef", "GPSLongitudeRef"],
      gps: true,
    })) ?? {}) as Exif;
  } catch {
    return {};
  }
}

function cameraName(e: Exif) {
  const make = e.Make?.trim();
  const model = e.Model?.trim();
  if (!model) return make || null;
  return make && !model.toLowerCase().startsWith(make.toLowerCase()) ? `${make} ${model}` : model;
}

export async function processImage(file: File, opts: ProcessOptions): Promise<ProcessedImage> {
  const buf = await file.arrayBuffer();
  const [digest, exif] = await Promise.all([crypto.subtle.digest("SHA-256", buf), readExif(buf)]);
  const bmp = await decode(file);
  try {
    const t = fit(bmp.width, bmp.height, 512);
    const tb = await resized(bmp, t.w, t.h);
    const thumb = await encode(tb, 0.8);
    tb.close();

    let display: Blob | null = null;
    if (opts.display) {
      const d = fit(bmp.width, bmp.height, 2048);
      const db = await resized(bmp, d.w, d.h);
      display = await encode(db, 0.85);
      db.close();
    }

    const taken = exif.DateTimeOriginal ?? exif.CreateDate;
    const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
    return {
      sha256: toHex(digest),
      size: file.size,
      mime: file.type || (isHeicLike(file) ? "image/heic" : "application/octet-stream"),
      width: bmp.width,
      height: bmp.height,
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.getTime() : file.lastModified,
      lat: valid(exif.latitude) ? exif.latitude : null,
      lng: valid(exif.longitude) ? exif.longitude : null,
      camera: cameraName(exif)?.slice(0, 120) ?? null,
      dhash: await dhash(bmp),
      blurhash: await blurhashOf(bmp),
      thumb,
      display,
    };
  } finally {
    bmp.close();
  }
}

/** 보기 화면용: 브라우저가 직접 못 여는 형식(HEIC)을 JPEG로 변환 */
export async function decodeForView(file: File): Promise<Blob> {
  const bmp = await decode(file);
  try {
    const d = fit(bmp.width, bmp.height, 2560);
    const r = await resized(bmp, d.w, d.h);
    const out = await encode(r, 0.9);
    r.close();
    return out;
  } finally {
    bmp.close();
  }
}
