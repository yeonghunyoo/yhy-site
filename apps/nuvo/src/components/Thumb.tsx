import { decode } from "blurhash";
import { memo, useEffect, useState, type ReactNode } from "react";
import { localThumbUrl } from "../lib/local/store";
import type { TItem } from "../lib/timeline";

const placeholderCache = new Map<string, string>();

/** blurhash → 아주 작은 data URL (사진이 뜨기 전 색감만 먼저 보여준다) */
function placeholder(hash: string | null | undefined) {
  if (!hash) return undefined;
  let url = placeholderCache.get(hash);
  if (url) return url;
  try {
    const px = decode(hash, 16, 16);
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(16, 16);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
    url = c.toDataURL();
    placeholderCache.set(hash, url);
    if (placeholderCache.size > 3000) placeholderCache.delete(placeholderCache.keys().next().value!);
    return url;
  } catch {
    return undefined;
  }
}

export function useThumbSrc(item: TItem) {
  const cloudSrc = item.cloud?.urls.thumb;
  const [localSrc, setLocalSrc] = useState<string | null>(null);
  const localKey = !cloudSrc ? item.local?.key : undefined;
  useEffect(() => {
    if (!localKey) return;
    let alive = true;
    void localThumbUrl(localKey).then((u) => alive && setLocalSrc(u));
    return () => {
      alive = false;
    };
  }, [localKey]);
  return cloudSrc ?? localSrc;
}

export const Thumb = memo(function Thumb({ item, badge, className = "" }: { item: TItem; badge?: ReactNode; className?: string }) {
  const src = useThumbSrc(item);
  const [loaded, setLoaded] = useState(false);
  const ph = placeholder(item.cloud?.blurhash ?? item.local?.blurhash);
  return (
    <div className={`relative overflow-hidden bg-surface ${className}`}>
      {ph && <img src={ph} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover blur-md" />}
      {src && (
        <img
          src={src}
          alt={item.cloud?.filename ?? item.local?.name ?? ""}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
      {badge}
    </div>
  );
});
