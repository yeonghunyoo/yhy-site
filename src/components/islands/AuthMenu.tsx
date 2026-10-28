import { useEffect, useRef, useState } from 'react';
import type { Dict } from '../../i18n';
import { authClient } from '../../lib/auth-client';
import { openSheet, showToast } from './events';

interface Props {
  dict: Dict;
}

/** 헤더 우측: 비로그인이면 로그인 버튼, 로그인하면 이니셜 아바타 + 메뉴 */
export default function AuthMenu({ dict }: Props) {
  const { data } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 세션 확인 중에도 로그인 버튼을 보여준다(대부분의 방문자는 비로그인 — 레이아웃 흔들림 최소화).
  // 클릭은 Overlay(하이드레이트 전에는 client:demand)가 [data-action]으로 받는다.
  if (!data) {
    return (
      <button type="button" className="btn btn-ghost text-sm" data-action="login">
        {dict.contact.login}
      </button>
    );
  }

  const { email, name } = data.user;
  const initial = (name?.trim() || email).charAt(0).toUpperCase();

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    showToast(dict.toast.signedOut);
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="grid size-11 place-items-center rounded-full border border-border bg-surface font-bold"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={dict.menu.label}
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute top-12 right-0 w-64 rounded-[var(--radius)] border border-border bg-surface p-1 shadow-xl">
          <p className="px-3 py-2 text-sm text-muted">
            {dict.menu.signedInAs}
            <span className="block break-all text-fg">{email}</span>
          </p>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-11 w-full items-center rounded-[calc(var(--radius)-4px)] px-3 text-left hover:bg-bg"
            onClick={() => {
              setOpen(false);
              openSheet({ sheet: 'account' });
            }}
          >
            {dict.menu.deleteAccount}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex min-h-11 w-full items-center rounded-[calc(var(--radius)-4px)] px-3 text-left hover:bg-bg"
            onClick={signOut}
          >
            {dict.menu.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
