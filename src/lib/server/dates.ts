// 어드민은 한국 시간 기준으로 본다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' (KST) */
export function kstDate(date: Date): string {
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘 포함 최근 n일의 KST 날짜, 오래된 순 */
export function lastKstDays(n: number): string[] {
  const today = Date.now();
  return Array.from({ length: n }, (_, i) => kstDate(new Date(today - (n - 1 - i) * 24 * 60 * 60 * 1000)));
}

/** KST 날짜 시작 시각(UTC Date) */
export function kstDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS);
}

export function formatKst(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}
