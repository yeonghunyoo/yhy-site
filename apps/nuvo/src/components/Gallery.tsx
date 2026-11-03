import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { canUseWebGL, prefersReducedMotion } from "../three/support";
import type { TItem } from "../lib/timeline";
import { PhotoGrid } from "./PhotoGrid";
import { Button, IconButton, Segmented, Spinner } from "./ui";
import { Viewer } from "./Viewer";

const Timeline3D = lazy(() => import("../three/Timeline3D"));

export type ViewMode = "grid" | "3d";

/** 그리드/3D 보기 + 선택 + 사진 보기를 묶은 공통 갤러리 (라이브러리·Space가 함께 쓴다) */
export function Gallery({
  items,
  toolbar,
  selectionActions,
  viewerActions,
  badge,
  uploaderName,
  empty,
  loading,
}: {
  items: TItem[];
  toolbar?: ReactNode;
  selectionActions?: (selected: TItem[], clear: () => void) => ReactNode;
  viewerActions?: (item: TItem) => ReactNode;
  badge?: (item: TItem) => ReactNode;
  uploaderName?: (id: string | null) => string | null;
  empty?: ReactNode;
  loading?: boolean;
}) {
  const [mode, setMode] = useState<ViewMode>("grid");
  const [open, setOpen] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const threeOk = useMemo(() => canUseWebGL() && !prefersReducedMotion(), []);

  const toggle = useCallback((key: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const selectedItems = useMemo(() => items.filter((i) => selected.has(i.key)), [items, selected]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 py-4">
        {toolbar}
        <div className="ml-auto">
          {threeOk && items.length > 0 && (
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "grid", label: "그리드", icon: "grid" },
                { value: "3d", label: "3D", icon: "cube" },
              ]}
            />
          )}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-24">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        empty
      ) : mode === "3d" ? (
        <Suspense fallback={<div className="flex h-[70vh] items-center justify-center"><Spinner /></div>}>
          <Timeline3D items={items} onOpen={setOpen} />
        </Suspense>
      ) : (
        <PhotoGrid items={items} selected={selected} onToggle={toggle} onOpen={setOpen} badge={badge} />
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-3" data-testid="selection-bar">
          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1.5 shadow-xl">
            <IconButton icon="close" label="선택 해제" onClick={clear} />
            <span className="px-2 text-sm font-medium whitespace-nowrap">{selected.size}장 선택</span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(items.map((i) => i.key)))}>
              전체
            </Button>
            {selectionActions?.(selectedItems, clear)}
          </div>
        </div>
      )}

      {open != null && items[open] && (
        <Viewer
          items={items}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          actions={viewerActions}
          uploaderName={uploaderName}
        />
      )}
    </>
  );
}
