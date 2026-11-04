import { useCallback, useEffect, useState } from 'react';
import type { Dict, Locale } from '../../i18n';
import { LetterSheet } from './LetterSheet';
import { takeFlashToast, type OpenDetail, type SheetName } from './events';

interface Props {
  dict: Dict;
  locale: Locale;
}

/** 페이지당 하나. 레터 시트와 토스트를 띄운다. 방문자 로그인은 없다(11/04, docs/03-letters.md). */
export default function Overlay({ dict, locale }: Props) {
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const open = useCallback((detail: OpenDetail) => setSheet(detail.sheet), []);
  const close = useCallback(() => setSheet(null), []);

  useEffect(() => {
    const onOpen = (e: Event) => open((e as CustomEvent<OpenDetail>).detail);
    const onToast = (e: Event) => setToast((e as CustomEvent<string>).detail);
    // 정적 HTML의 [data-action] 버튼(연락 섹션 등)
    const onClick = (e: MouseEvent) => {
      const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
      if (target?.dataset.action === 'letter') {
        e.preventDefault();
        open({ sheet: 'letter' });
      }
    };
    window.addEventListener('ui:open', onOpen);
    window.addEventListener('ui:toast', onToast);
    document.addEventListener('click', onClick);

    // 하이드레이트 전에 누른 버튼(client:demand가 넘김)
    if (window.__uiPending === 'letter') {
      window.__uiPending = undefined;
      open({ sheet: 'letter' });
    }
    const flash = takeFlashToast();
    if (flash && flash in dict.toast) setToast(dict.toast[flash as keyof Dict['toast']]);

    return () => {
      window.removeEventListener('ui:open', onOpen);
      window.removeEventListener('ui:toast', onToast);
      document.removeEventListener('click', onClick);
    };
  }, [open, dict]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <LetterSheet
        dict={dict}
        locale={locale}
        open={sheet === 'letter'}
        onClose={close}
        onSent={() => {
          setSheet(null);
          setToast(dict.toast.letterSent);
        }}
      />
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
