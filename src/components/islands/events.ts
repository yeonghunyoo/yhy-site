// 아일랜드끼리(헤더 메뉴 ↔ 시트) 주고받는 브라우저 이벤트와 저장소 키.

export type SheetName = 'letter';
export interface OpenDetail {
  sheet: SheetName;
}

export function openSheet(detail: OpenDetail): void {
  window.dispatchEvent(new CustomEvent<OpenDetail>('ui:open', { detail }));
}

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent<string>('ui:toast', { detail: message }));
}

const FLASH_KEY = 'flashToast';

/** 페이지 이동 뒤에 띄울 토스트 키 */
export function setFlashToast(key: string): void {
  try {
    sessionStorage.setItem(FLASH_KEY, key);
  } catch {}
}

export function takeFlashToast(): string | null {
  try {
    const key = sessionStorage.getItem(FLASH_KEY);
    sessionStorage.removeItem(FLASH_KEY);
    return key;
  } catch {
    return null;
  }
}
