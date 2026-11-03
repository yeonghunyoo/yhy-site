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
  const [signingOut, setSigningOut] = useState(false);
  // 관리자 여부는 서버만 안다(ADMIN_EMAILS) — 로그인한 계정이 바뀔 때 한 번 묻는다
  const [admin, setAdmin] = useState(false);
  const sessionEmail = data?.user.email;
  useEffect(() => {
    setAdmin(false);
    if (!sessionEmail) return;
    let alive = true;
    fetch('/api/account', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ admin?: boolean }>) : null))
      .then((body: { admin?: boolean } | null) => alive && setAdmin(Boolean(body?.admin)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sessionEmail]);
  // 헤더(정적 HTML)의 관리자 링크는 <html data-admin>일 때만 보인다(Header.astro). 링크만 숨기는 것이고 /admin은 서버가 404로 막는다
  useEffect(() => {
    document.documentElement.toggleAttribute('data-admin', admin);
  }, [admin]);
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
      <button type="button" className="btn text-sm" data-action="login">
        {dict.contact.login}
      </button>
    );
  }

  const { email, name } = data.user;
  const initial = (name?.trim() || email).charAt(0).toUpperCase();

  // 로그아웃이 끝날 때까지 메뉴를 열어 둔 채 항목에 스피너. 실패하면 다시 누를 수 있게 되돌린다.
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await authClient.signOut().catch(() => ({ error: true }));
    setSigningOut(false);
    if (error) return showToast(dict.ui.error);
    setOpen(false);
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
          {admin && (
            <a role="menuitem" href="/admin" className="flex min-h-11 w-full items-center rounded-[calc(var(--radius)-4px)] px-3 font-semibold hover:bg-bg">
              {dict.menu.admin}
            </a>
          )}
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
            disabled={signingOut}
            aria-busy={signingOut}
          >
            {dict.menu.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
