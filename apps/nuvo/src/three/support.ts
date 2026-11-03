let webgl: boolean | null = null;

export function canUseWebGL() {
  if (webgl != null) return webgl;
  try {
    const c = document.createElement("canvas");
    webgl = !!c.getContext("webgl2");
  } catch {
    webgl = false;
  }
  return webgl;
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 저사양 판단: 코어 수·메모리가 적거나 절전 모드 → 2D/정적 화면으로 강등 */
export function isLowEnd() {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  return (n.hardwareConcurrency ?? 8) <= 2 || (n.deviceMemory ?? 8) <= 2 || n.connection?.saveData === true;
}
