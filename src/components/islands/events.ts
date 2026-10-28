// 아일랜드끼리(헤더 메뉴 ↔ 시트) 주고받는 브라우저 이벤트와 저장소 키.

export type SheetName = 'login' | 'letter' | 'account';
export interface OpenDetail {
  sheet: SheetName;
}

export function openSheet(detail: OpenDetail): void {
  window.dispatchEvent(new CustomEvent<OpenDetail>('ui:open', { detail }));
}

export function showToast(message: string): void {
  window.dispatchEvent(new CustomEvent<string>('ui:toast', { detail: message }));
}

/** 로그인 전에 누른 보호 동작. 로그인 후 같은 시트를 다시 연다. */
export interface PendingAction {
  type: 'letter';
}

const PENDING_KEY = 'pendingAction';
const FLASH_KEY = 'flashToast';

export function setPendingAction(action: PendingAction): void {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(action));
  } catch {}
}

export function takePendingAction(): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingAction) : null;
  } catch {
    return null;
  }
}

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
