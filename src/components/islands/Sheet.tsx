import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  /** 하단 고정 영역(전송 버튼 등). 키보드가 올라와도 보이도록 본문만 스크롤한다. */
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 모바일: 하단 시트(드래그 다운으로 닫기) / md 이상: 중앙 모달 */
export function Sheet({ open, onClose, title, closeLabel, children, footer }: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [keyboard, setKeyboard] = useState(0);
  const [viewportH, setViewportH] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

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

    // 키보드가 올라오면 보이는 영역(visualViewport)에 맞춰 시트를 올리고 높이를 줄인다.
    const vv = window.visualViewport;
    const onViewport = () => {
      if (!vv) return;
      setKeyboard(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
      setViewportH(vv.height);
    };
    onViewport();
    vv?.addEventListener('resize', onViewport);
    vv?.addEventListener('scroll', onViewport);
    document.addEventListener('keydown', onKey);

    return () => {
      root.style.overflow = prevOverflow;
      vv?.removeEventListener('resize', onViewport);
      vv?.removeEventListener('scroll', onViewport);
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

  const maxHeight = viewportH ? `${Math.round(viewportH * 0.92)}px` : '92dvh';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex w-full flex-col rounded-t-[var(--radius)] border border-border bg-surface shadow-2xl outline-none md:max-w-lg md:rounded-[var(--radius)]"
        style={{
          maxHeight,
          marginBottom: keyboard,
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
          <div className="flex justify-center pt-2 md:hidden" aria-hidden="true">
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
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
