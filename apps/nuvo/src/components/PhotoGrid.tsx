import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildRows, type TItem } from "../lib/timeline";
import { Icon } from "./icons";
import { Thumb } from "./Thumb";

const GAP = 3;
const HEADER = 56;

function columnsFor(width: number) {
  if (width < 480) return 3;
  if (width < 768) return 4;
  return Math.min(10, Math.max(5, Math.round(width / 200)));
}

export function PhotoGrid({
  items,
  selected,
  onOpen,
  onToggle,
  badge,
}: {
  items: TItem[];
  selected: Set<string>;
  onOpen: (index: number) => void;
  onToggle: (key: string) => void;
  badge?: (item: TItem) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setOffset(el.getBoundingClientRect().top + window.scrollY);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = columnsFor(width || 1024);
  const cell = width ? (width - GAP * (cols - 1)) / cols : 160;
  const rows = useMemo(() => buildRows(items, cols), [items, cols]);
  const selecting = selected.size > 0;

  const v = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (i) => (rows[i]!.type === "header" ? HEADER : cell + GAP),
    overscan: 6,
    scrollMargin: offset,
    getItemKey: (i) => rows[i]!.key,
  });

  // 칸 크기가 바뀌면 높이 다시 계산
  useLayoutEffect(() => v.measure(), [cell, v]);

  const press = useRef<{ t: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const startPress = (key: string) => {
    const p = { fired: false, t: setTimeout(() => {
      p.fired = true;
      onToggle(key);
      navigator.vibrate?.(10);
    }, 450) };
    press.current = p;
  };
  const cancelPress = () => press.current && clearTimeout(press.current.t);

  return (
    <div ref={ref} className="relative w-full" style={{ height: v.getTotalSize() }}>
      {v.getVirtualItems().map((vi) => {
        const row = rows[vi.index]!;
        const top = vi.start - v.options.scrollMargin;
        if (row.type === "header") {
          return (
            <div key={vi.key} className="absolute inset-x-0 flex items-end gap-2 px-1 pb-3" style={{ top, height: HEADER }}>
              <h3 className="text-sm font-medium">{row.label}</h3>
              <span className="text-xs text-faint">{row.sub}</span>
            </div>
          );
        }
        return (
          <div key={vi.key} className="absolute inset-x-0 flex" style={{ top, height: cell, gap: GAP }}>
            {row.items.map((item, j) => {
              const index = row.startIndex + j;
              const isSel = selected.has(item.key);
              return (
                <button
                  key={item.key}
                  data-testid="photo"
                  className="group relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  style={{ width: cell, height: cell }}
                  onPointerDown={(e) => e.pointerType === "touch" && startPress(item.key)}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerMove={cancelPress}
                  onContextMenu={(e) => press.current && e.preventDefault()}
                  onClick={(e) => {
                    if (press.current?.fired) {
                      press.current = null;
                      return;
                    }
                    if (selecting || e.metaKey || e.ctrlKey || e.shiftKey) onToggle(item.key);
                    else onOpen(index);
                  }}
                  aria-label={item.cloud?.filename ?? item.local?.name ?? "사진"}
                  aria-pressed={selecting ? isSel : undefined}
                >
                  <Thumb
                    item={item}
                    className={`size-full transition-transform duration-200 ${isSel ? "scale-[0.88] rounded-lg" : ""}`}
                    badge={badge?.(item)}
                  />
                  <span
                    role="checkbox"
                    aria-checked={isSel}
                    aria-label="선택"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(item.key);
                    }}
                    className={`absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border transition-opacity ${
                      isSel
                        ? "border-accent bg-accent text-accent-ink opacity-100"
                        : "border-white/80 bg-black/20 text-transparent opacity-0 group-hover:opacity-100"
                    } ${selecting ? "opacity-100" : ""}`}
                  >
                    <Icon name="check" size={14} strokeWidth={2.2} />
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
