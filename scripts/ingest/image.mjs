// 이미지 인코딩 — pdf.js가 주는 원시 픽셀(1·3·4채널)을 JPEG(불투명) 또는 PNG(투명)로. 긴 변은 2,000px로 줄인다.
import { createCanvas, ImageData } from '@napi-rs/canvas';

const MAX_SIDE = 2000;

export async function encodePixels({ data, width, height, channels }) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  let opaque = true;
  for (let i = 0, j = 0; i < width * height; i++, j += channels) {
    const o = i * 4;
    if (channels === 1) rgba[o] = rgba[o + 1] = rgba[o + 2] = data[j];
    else {
      rgba[o] = data[j];
      rgba[o + 1] = data[j + 1];
      rgba[o + 2] = data[j + 2];
    }
    rgba[o + 3] = channels === 4 ? data[j + 3] : 255;
    if (rgba[o + 3] !== 255) opaque = false;
  }
  let canvas = createCanvas(width, height);
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0);
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  if (scale < 1) {
    const small = createCanvas(Math.round(width * scale), Math.round(height * scale));
    small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
    canvas = small;
  }
  return opaque
    ? { data: new Uint8Array(await canvas.encode('jpeg', 85)), mime: 'image/jpeg' }
    : { data: new Uint8Array(await canvas.encode('png')), mime: 'image/png' };
}
