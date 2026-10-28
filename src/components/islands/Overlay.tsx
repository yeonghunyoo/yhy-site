import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dict, Locale } from '../../i18n';
import { authClient } from '../../lib/auth-client';
import { AccountSheet } from './AccountSheet';
import { LetterSheet } from './LetterSheet';
import { LoginSheet } from './LoginSheet';
import {
  setPendingAction,
  takeFlashToast,
  takePendingAction,
  type OpenDetail,
  type SheetName,
} from './events';

interface Props {
  dict: Dict;
  locale: Locale;
}

/** 페이지당 하나. 시트(로그인·레터·계정 삭제)와 토스트를 띄우고, 로그인 복귀 후 하던 작업을 재개한다. */
export default function Overlay({ dict, locale }: Props) {
  const { data: session, isPending } = authClient.useSession();
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const signedIn = useRef(false);
  signedIn.current = Boolean(session);

  const open = useCallback((detail: OpenDetail) => {
    // 보호된 동작은 로그인부터. 끝나면 돌아와서 같은 시트를 자동으로 연다.
    if (detail.sheet === 'letter' && !signedIn.current) {
      setPendingAction({ type: 'letter' });
      setLoginNotice(null);
      setSheet('login');
      return;
    }
    setLoginNotice(null);
    setSheet(detail.sheet);
  }, []);

  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    const onOpen = (e: Event) => open((e as CustomEvent<OpenDetail>).detail);
    const onToast = (e: Event) => setToast((e as CustomEvent<string>).detail);
    // 정적 HTML의 [data-action] 버튼(연락 섹션 등)
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
      const action = target?.dataset.action;
      if (action === 'login' || action === 'letter') {
        e.preventDefault();
        open({ sheet: action });
      }
    };
    window.addEventListener('ui:open', onOpen);
    window.addEventListener('ui:toast', onToast);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('ui:open', onOpen);
      window.removeEventListener('ui:toast', onToast);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  // 로그인 복귀(?signed_in) · 링크 만료(?auth_error) 처리 — 세션 확인이 끝난 뒤 한 번
  const handled = useRef(false);
  useEffect(() => {
    if (isPending || handled.current) return;
    handled.current = true;
    const url = new URL(location.href);
    const params = url.searchParams;

    if (params.has('auth_error') || params.has('error')) {
      if (!session) {
        // 차단된 계정은 세션 생성이 거부된다(failed_to_create_session). 그 밖에는 링크 만료·재사용.
        setLoginNotice(params.get('error') === 'failed_to_create_session' ? dict.auth.blocked : dict.auth.expired);
        setSheet('login');
      }
      params.delete('auth_error');
      params.delete('error');
    }

    if (params.has('signed_in')) {
      params.delete('signed_in');
      if (session) {
        const pending = takePendingAction();
        if (pending?.type === 'letter') setSheet('letter');
        // 다른 기기에서 링크를 연 경우 등 — 이어갈 작업이 없으면 안내만
        else setToast(dict.toast.signedIn);
      }
    }

    // 하이드레이트 전에 누른 버튼(client:demand가 넘김)
    const pendingClick = window.__uiPending;
    if (pendingClick === 'login' || pendingClick === 'letter') {
      window.__uiPending = undefined;
      open({ sheet: pendingClick });
    }

    const flash = takeFlashToast();
    if (flash && flash in dict.toast) setToast(dict.toast[flash as keyof Dict['toast']]);

    const next = url.pathname + (params.size ? `?${params}` : '') + url.hash;
    if (next !== location.pathname + location.search + location.hash) history.replaceState(null, '', next);
  }, [isPending, session, dict, open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // 보호 API가 401을 주면(세션 만료) 조용히 로그인 시트로
  const onUnauthorized = useCallback(() => {
    setPendingAction({ type: 'letter' });
    setLoginNotice(null);
    setSheet('login');
  }, []);

  return (
    <>
      <LoginSheet dict={dict} locale={locale} open={sheet === 'login'} notice={loginNotice} onClose={close} />
      <LetterSheet
        dict={dict}
        locale={locale}
        open={sheet === 'letter'}
        email={session?.user.email ?? ''}
        onClose={close}
        onSent={() => {
          setSheet(null);
          setToast(dict.toast.letterSent);
        }}
        onUnauthorized={onUnauthorized}
      />
      <AccountSheet dict={dict} locale={locale} open={sheet === 'account'} onClose={close} />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4"
        role="status"
        aria-live="polite"
      >
        {toast && (
          <p className="rounded-[var(--radius)] bg-accent px-4 py-3 text-sm font-semibold text-accent-fg shadow-lg">{toast}</p>
        )}
      </div>
    </>
  );
}
