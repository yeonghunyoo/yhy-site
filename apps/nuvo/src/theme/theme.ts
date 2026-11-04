import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Accent = "clay" | "sage" | "slate";

const THEME_KEY = "nuvo-theme";
const ACCENT_KEY = "nuvo-accent";
const listeners = new Set<() => void>();
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function getThemePref(): ThemePref {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function resolvedTheme(pref = getThemePref()): "light" | "dark" {
  return pref === "system" ? (media().matches ? "dark" : "light") : pref;
}

export function getAccent(): Accent {
  const v = localStorage.getItem(ACCENT_KEY);
  return v === "sage" || v === "slate" ? v : "clay";
}

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  const accent = getAccent();
  if (accent === "clay") delete root.dataset.accent;
  else root.dataset.accent = accent;
  listeners.forEach((l) => l());
}

export function setThemePref(pref: ThemePref) {
  if (pref === "system") localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, pref);
  apply();
}

export function setAccent(accent: Accent) {
  if (accent === "clay") localStorage.removeItem(ACCENT_KEY);
  else localStorage.setItem(ACCENT_KEY, accent);
  apply();
}

export function initTheme() {
  apply();
  media().addEventListener("change", () => getThemePref() === "system" && apply());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** 현재 테마 상태. 셰이더/3D도 이 값으로 색을 맞춘다. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, getThemePref);
  const resolved = useSyncExternalStore(subscribe, () => resolvedTheme());
  const accent = useSyncExternalStore(subscribe, getAccent);
  return { pref, resolved, accent };
}

/** CSS 변수 값을 읽어 three.js 등에 넘길 때 사용 (예: readToken("--accent")) */
export function readToken(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
