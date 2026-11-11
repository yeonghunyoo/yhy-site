import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { lockScroll } from './scroll-lock';
import { watchViewport } from './viewport';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  /** 하단 고정 영역(전송 버튼 등). 키보드가 올라와도 보이도록 본문만 스크롤한다.
   *  키보드가 떠 있을 때 숨길 부가 요소는 `group-data-keyboard/sheet:hidden`을 단다. */
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 모바일: 하단 시트(드래그 다운으로 닫기) / md 이상: 중앙 모달 */
export function Sheet({ open, onClose, title, closeLabel, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    // iOS Safari는 overflow:hidden만으로는 배경이 밀린다 — body 고정(scroll-lock.ts). 챗 위에 겹쳐 열려도 횟수로 센다.
    const unlock = lockScroll();

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel;
    first?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };

    // 키보드가 올라오면 보이는 영역에 맞춰 시트를 올리고 높이를 줄인다. 프레임마다 DOM에 바로 쓴다(viewport.ts) —
    // 상태로 받으면 늦게 그려져 키보드를 내릴 때마다 시트가 출렁인다.
    // 키보드가 떠 있으면 남은 높이가 좁아 보이는 영역을 꽉 채우고, data-keyboard로 손잡이·부가 문구·safe-area 여백을 뺀다
    const stopViewport = watchViewport(({ height, top, keyboard }) => {
      if (!panel) return;
      panel.style.marginBottom = `${Math.max(0, window.innerHeight - height - top)}px`;
      panel.style.maxHeight = `${Math.round(keyboard ? height : height * 0.92)}px`;
      panel.toggleAttribute('data-keyboard', keyboard);
    });
    document.addEventListener('keydown', onKey);

    return () => {
      unlock();
      stopViewport();
      document.removeEventListener('keydown', onKey);
      setDragY(0);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  if (!open) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (window.matchMedia('(min-width: 768px)').matches) return;
    dragStart.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    dragStart.current = null;
    if (dragY > 100) onClose();
    else setDragY(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      {/* 화면 높이의 2배로 늘린 어두운 막 — iOS가 보이는 영역을 밀어도 페이지가 드러나지 않는다 */}
      <div className="fixed inset-x-0 top-0 h-[200lvh] bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="group/sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius)] bg-surface shadow-2xl outline-none after:absolute after:inset-x-0 after:top-full after:h-[100lvh] after:bg-surface md:max-w-lg md:rounded-[var(--radius)] md:after:hidden"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragStart.current === null ? 'transform 0.2s' : undefined,
        }}
      >
        <div
          className="touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2 group-data-keyboard/sheet:hidden md:hidden" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </div>
          <div className="flex items-center justify-between gap-2 pr-2 pl-5 md:pt-2">
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="grid size-11 place-items-center text-xl" aria-label={closeLabel}>
              ×
            </button>
          </div>
        </div>
        <div data-scroll-allow className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] group-data-keyboard/sheet:pt-2 group-data-keyboard/sheet:pb-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
