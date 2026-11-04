import { readToken } from "../theme/theme";

/** CSS 색(oklch 포함)을 three.js가 쓰는 sRGB [0..1]로 변환. 브라우저 캔버스가 변환을 대신 해준다. */
export function cssColorToRgb(css: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0]! / 255, d[1]! / 255, d[2]! / 255];
}

export const tokenRgb = (name: string) => cssColorToRgb(readToken(name) || "#888");
