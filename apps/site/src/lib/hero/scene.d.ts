// scene.js 타입(빌드 도구 없이 브라우저에서도 그대로 도는 JS라 선언을 따로 둔다)
export interface HeroOptions {
  cell?: number;
  minCols?: number;
  maxCols?: number;
  cols?: number | null;
  levels?: number;
  dither?: boolean;
  aspect?: number | null;
  palette?: { dark?: string; light?: string; accent?: string };
  modelUrl?: string | null;
  points?: Record<string, [number, number, number]> | null;
  preserve?: boolean;
  /** 'pixel' = 계조 칸, 'ascii' = 글자(밝기 ramp + 윤곽 - / | \) */
  mode?: 'pixel' | 'ascii';
  ramp?: string;
  edge?: number;
}

export interface Hero {
  ready: Promise<void>;
  resize(width?: number, height?: number): void;
  render(): void;
  setProgress(p: number): void;
  setOptions(next: HeroOptions): void;
  snapshot(): { width: number; height: number; data: number[] };
  loadModel(url: string): Promise<void>;
  dispose(): void;
}

export const STEP1: number;
export const RESOLVE: number;
export const FACE: number;
export function createHero(canvas: HTMLCanvasElement, options?: HeroOptions): Hero;
