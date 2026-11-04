import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Diagram } from '../../../lib/diagram';
import { layout, type Layout } from './layout';

// 챗 답 아래 흐름도(docs/05-06-chat-rag.md "흐름도 에이전트"). ChatDock이 import()로 필요할 때만 불러 초기 JS에 들어가지 않는다.
// 색은 SVG 요소의 Tailwind 클래스(토큰)만 쓴다 — style=""·<style> 없음(CSP). 묶음(group)은 새 색을 만들지 않고 채움·테두리 굵기·점선으로 구분한다.

interface Props {
  diagram: Diagram;
  labels: { title: string; expand: string; close: string; connections: string; hint: string; fit: string };
}

const GROUP_STYLES = [
  'fill-surface stroke-border',
  'fill-bg stroke-fg',
  'fill-fg/5 stroke-muted [stroke-dasharray:5_3]',
  'fill-accent/10 stroke-accent stroke-2',
];

// 미리보기는 칸 폭과 이 높이 안에 전체가 들어가게 줄인다(스크롤 없음 — 목록 스크롤을 가로채지 않게). 자세히는 크게 보기에서 확대
const PREVIEW_MAX_H = 320;
const MAX_ZOOM = 4; // 크게 보기: 원래 크기의 4배까지

function Svg({ data, groups, width, label }: { data: Layout; groups: Map<string, number>; width: number; label: string }) {
  const marker = `arrow-${useId().replace(/:/g, '')}`;
  const height = (data.height * width) / data.width;
  return (
    <svg
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${data.width} ${data.height}`}
      className="block max-w-none select-none"
    >
      <defs>
        <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" className="fill-muted" />
        </marker>
      </defs>
      {data.edges.map((e) => (
        <path key={`${e.from}>${e.to}`} d={e.d} className="fill-none stroke-muted" strokeWidth={1.5} markerEnd={`url(#${marker})`} />
      ))}
      {data.nodes.map((n) => {
        const style = GROUP_STYLES[(n.group ? (groups.get(n.group) ?? 0) : 0) % GROUP_STYLES.length];
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} className={style} strokeWidth={1.25} />
            <text x={n.x + n.w / 2} y={n.y + 10 + 13} textAnchor="middle" className="fill-fg text-[13px]">
              {n.lines.map((line, i) => (
                <tspan key={i} x={n.x + n.w / 2} dy={i === 0 ? 0 : 17}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      {data.edges
        .filter((e) => e.label)
        .map((e) => {
          const w = Math.min(130, [...e.label!].length * 7 + 10);
          return (
            <g key={`l-${e.from}>${e.to}`}>
              <rect x={e.lx - w / 2} y={e.ly - 9} width={w} height={17} rx={4} className="fill-surface" />
              <text x={e.lx} y={e.ly + 4} textAnchor="middle" className="fill-muted text-[11px]">
                {e.label}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

export default function DiagramView({ diagram, labels }: Props) {
  const data = useMemo(() => layout(diagram), [diagram]);
  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of diagram.nodes) if (n.group && !map.has(n.group)) map.set(n.group, map.size);
    return map;
  }, [diagram]);
  const names = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n.label])), [diagram]);
  const connections = diagram.edges.map((e) => `${names.get(e.from)} → ${names.get(e.to)}${e.label ? ` (${e.label})` : ''}`);
  const label = `${labels.title}: ${connections.join(', ') || diagram.nodes.map((n) => n.label).join(', ')}`;

  // 칸 폭(테두리 안쪽 여백 8px 제외)과 최대 높이 안에 전체가 들어가게 맞춘다. 원래 크기보다 키우지는 않는다
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox(el.clientWidth - 8);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = Math.min(data.width, box || data.width, (PREVIEW_MAX_H * data.width) / data.height);
  const [zoom, setZoom] = useState(false);
  // 크게 보기는 Esc로 닫는다(챗 독은 aria-modal이 떠 있으면 Esc로 닫히지 않는다)
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom]);

  return (
    <figure className="mt-2">
      {/* 눌러도 크게 보기가 열린다. 스크롤 상자가 아니라 세로로 끌면 챗 목록이 스크롤된다 */}
      <div ref={boxRef} className="rounded-[var(--radius)] border border-border bg-bg p-1">
        <button type="button" className="flex w-full cursor-zoom-in justify-center" aria-label={`${labels.expand}: ${labels.title}`} onClick={() => setZoom(true)}>
          <Svg data={data} groups={groups} width={width} label={label} />
        </button>
      </div>
      <figcaption className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
        <span>{labels.title}</span>
        <button type="button" className="min-h-11 px-2 underline underline-offset-2" onClick={() => setZoom(true)}>
          {labels.expand}
        </button>
      </figcaption>
      <ul className="sr-only" aria-label={labels.connections}>
        {connections.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {zoom &&
        // 챗 패널은 transform으로 움직여 fixed가 패널 안에 갇힌다 — body로 꺼내 화면 전체를 쓴다
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={labels.title} className="fixed inset-0 z-[60] flex h-dvh flex-col bg-surface">
            <div className="flex shrink-0 items-center justify-between border-b border-border pt-[env(safe-area-inset-top)] pr-2 pl-4">
              <span className="font-semibold">{labels.title}</span>
              <button type="button" autoFocus className="grid size-11 place-items-center text-xl" aria-label={labels.close} onClick={() => setZoom(false)}>
                ×
              </button>
            </div>
            <PanZoom data={data} fitLabel={labels.fit}>
              <Svg data={data} groups={groups} width={data.width} label={label} />
            </PanZoom>
            <p className="shrink-0 border-t border-border px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-center text-xs text-muted">{labels.hint}</p>
          </div>,
          document.body,
        )}
    </figure>
  );
}

/**
 * 크게 보기의 확대·이동. 처음엔 화면에 전체가 들어가게 맞추고, 두 손가락 핀치·한 손가락 끌기·두 번 탭(맞춤 ↔ 2.5배)·
 * 휠(데스크톱)·+/−/0 키로 움직인다. 확대는 CSS scale이 아니라 SVG 크기를 바꿔 글자가 흐려지지 않게 하고,
 * 값은 프레임마다 DOM에 바로 쓴다(상태로 받으면 손가락을 늦게 따라간다). 브라우저 확대는 touch-none으로 막는다.
 */
function PanZoom({ data, fitLabel, children }: { data: Layout; fitLabel: string; children: ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 1, x: 0, y: 0, fit: 1 });
  const fitRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    const svg = inner?.querySelector('svg');
    if (!box || !inner || !svg) return;
    const v = view.current;
    const size = () => ({ w: box.clientWidth, h: box.clientHeight });

    const clamp = () => {
      const { w, h } = size();
      const cw = data.width * v.s;
      const ch = data.height * v.s;
      v.x = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, v.x));
      v.y = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, v.y));
    };
    const apply = () => {
      clamp();
      svg.setAttribute('width', String(data.width * v.s));
      svg.setAttribute('height', String(data.height * v.s));
      inner.style.transform = `translate3d(${v.x}px, ${v.y}px, 0)`;
    };
    const minS = () => Math.min(v.fit, 1);
    const maxS = () => Math.max(v.fit, MAX_ZOOM);
    /** (px, py) 지점을 고정한 채로 배율을 s로 */
    const zoomAt = (s: number, px: number, py: number) => {
      const ns = Math.min(maxS(), Math.max(minS(), s));
      v.x = px - ((px - v.x) * ns) / v.s;
      v.y = py - ((py - v.y) * ns) / v.s;
      v.s = ns;
      apply();
    };
    const fit = () => {
      const { w, h } = size();
      v.fit = Math.min((w - 16) / data.width, (h - 16) / data.height, 2);
      v.s = v.fit;
      apply();
    };
    fitRef.current = fit;
    fit();

    // 포인터 추적: 1개 = 이동, 2개 = 핀치(두 손가락 가운데를 고정한 채 배율 변경)
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; s: number; mx: number; my: number; x: number; y: number } | null = null;
    let tap: { t: number; x: number; y: number } | null = null;
    let moved = false;
    const local = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const startPinch = () => {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: v.s, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, x: v.x, y: v.y };
    };
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest('button')) return; // 맞추기 버튼
      box.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 1) moved = false;
      if (pts.size === 2) startPinch();
    };
    const move = (e: PointerEvent) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch) {
        moved = true;
        const [a, b] = [...pts.values()];
        const ns = Math.min(maxS(), Math.max(minS(), (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        v.x = mx - ((pinch.mx - pinch.x) * ns) / pinch.s;
        v.y = my - ((pinch.my - pinch.y) * ns) / pinch.s;
        v.s = ns;
        apply();
      } else if (pts.size === 1) {
        moved ||= Math.hypot(p.x - prev.x, p.y - prev.y) > 2;
        v.x += p.x - prev.x;
        v.y += p.y - prev.y;
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (pts.size === 2) startPinch();
      else pinch = null;
      if (!p || moved || pts.size > 0) return;
      // 두 번 탭: 맞춤 상태면 그 지점을 2.5배로, 확대 상태면 다시 맞춤
      const now = performance.now();
      if (tap && now - tap.t < 300 && Math.hypot(p.x - tap.x, p.y - tap.y) < 30) {
        tap = null;
        if (v.s > v.fit * 1.05) fit();
        else zoomAt(v.fit * 2.5, p.x, p.y);
      } else tap = { t: now, ...p };
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      zoomAt(v.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), e.clientX - r.left, e.clientY - r.top);
    };
    const key = (e: KeyboardEvent) => {
      const { w, h } = size();
      if (e.key === '+' || e.key === '=') zoomAt(v.s * 1.25, w / 2, h / 2);
      else if (e.key === '-') zoomAt(v.s / 1.25, w / 2, h / 2);
      else if (e.key === '0') fit();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('keydown', key);
    return () => {
      ro.disconnect();
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
      box.removeEventListener('wheel', wheel);
      document.removeEventListener('keydown', key);
    };
  }, [data]);

  return (
    <div ref={boxRef} className="relative min-h-0 flex-1 touch-none overflow-hidden select-none">
      <div ref={innerRef} className="absolute top-0 left-0 will-change-transform">
        {children}
      </div>
      <button
        type="button"
        className="btn btn-sm absolute right-3 bottom-3 min-h-11"
        onClick={() => fitRef.current()}
      >
        {fitLabel}
      </button>
    </div>
  );
}
