import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Diagram } from '../../../lib/diagram';
import { layout, type Layout } from './layout';

// 챗 답 아래 흐름도(docs/05-06-chat-rag.md "흐름도 에이전트"). ChatDock이 import()로 필요할 때만 불러 초기 JS에 들어가지 않는다.
// 색은 SVG 요소의 Tailwind 클래스(토큰)만 쓴다 — style=""·<style> 없음(CSP). 묶음(group)은 새 색을 만들지 않고 채움·테두리 굵기·점선으로 구분한다.

interface Props {
  diagram: Diagram;
  labels: { title: string; expand: string; close: string; connections: string };
}

const GROUP_STYLES = [
  'fill-surface stroke-border',
  'fill-bg stroke-fg',
  'fill-fg/5 stroke-muted [stroke-dasharray:5_3]',
  'fill-accent/10 stroke-accent stroke-2',
];

const MIN_SCALE = 0.7; // 글자가 약 9px 아래로 작아지지 않게. 더 넓으면 가로 스크롤(가운데에서 시작) + 크게 보기

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

  // 칸 폭(테두리 안쪽 여백 8px 제외)에 맞춘다. 70%보다 작아져야 하면 70%로 두고 자기 상자 안에서 가로로 스크롤한다
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
  const width = box ? Math.max(data.width * MIN_SCALE, Math.min(data.width, box)) : data.width;
  // 넓어서 스크롤이 생기면 가운데에서 시작한다 — 흐름도는 가운데 정렬이라 줄기와 갈래 가운데가 먼저 보인다
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, [width]);
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
      <div ref={boxRef} data-scroll-allow className="overflow-x-auto overscroll-contain rounded-[var(--radius)] border border-border bg-bg p-1">
        <Svg data={data} groups={groups} width={width} label={label} />
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
      {zoom && (
        <div role="dialog" aria-modal="true" aria-label={labels.title} className="fixed inset-0 z-[60] flex flex-col bg-surface">
          <div className="flex shrink-0 items-center justify-between border-b border-border pt-[env(safe-area-inset-top)] pr-2 pl-4">
            <span className="font-semibold">{labels.title}</span>
            <button type="button" className="grid size-11 place-items-center text-xl" aria-label={labels.close} onClick={() => setZoom(false)}>
              ×
            </button>
          </div>
          <div data-scroll-allow className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Svg data={data} groups={groups} width={data.width} label={label} />
          </div>
        </div>
      )}
    </figure>
  );
}
