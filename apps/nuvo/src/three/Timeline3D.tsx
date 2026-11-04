import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { localThumbUrl } from "../lib/local/store";
import { formatMonth, type TItem } from "../lib/timeline";
import { useTheme } from "../theme/theme";
import { tokenRgb } from "./color";

const MAX = 240;
const RADIUS = 4.2;
const ANGLE = 0.42; // 사진 사이 회전 각
const STEP_Y = 0.16; // 사진 사이 높이 차
const loader = new THREE.TextureLoader();

/**
 * 나선형 시간 터널: 최신 사진부터 원통 벽을 따라 내려간다.
 * 스크롤/드래그로 과거로 이동, 클릭하면 사진 보기.
 */
export default function Timeline3D({ items, onOpen }: { items: TItem[]; onOpen: (index: number) => void }) {
  const list = useMemo(() => items.slice(0, MAX), [items]);
  const [front, setFront] = useState(0);
  const { resolved } = useTheme();
  // 토큰 값은 sRGB → three.js 작업 색공간(linear)으로 변환해서 넣어야 화면 색이 CSS와 같다
  const bg = useMemo(() => new THREE.Color().setRGB(...tokenRgb("--bg"), THREE.SRGBColorSpace), [resolved]);

  return (
    <div className="relative h-[calc(100dvh-150px)] min-h-[420px] touch-none overflow-hidden rounded-2xl border border-line" data-testid="timeline-3d">
      <Canvas dpr={[1, 2]} camera={{ fov: 58, near: 0.1, far: 40, position: [0, 0, 0] }} gl={{ antialias: true }}>
        <SceneColors bg={bg} />
        <Helix items={list} onOpen={onOpen} onFront={setFront} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5">
        <div>
          <p className="text-2xl font-light tracking-tight">{list[front] ? formatMonth(list[front]!.takenAt) : ""}</p>
          <p className="mt-1 text-xs text-faint">
            {front + 1} / {list.length}
            {items.length > MAX && ` · 최근 ${MAX}장`}
          </p>
        </div>
        <p className="text-xs text-faint max-sm:hidden">스크롤·드래그로 시간 여행 · 클릭해서 보기</p>
      </div>
    </div>
  );
}

/** 배경·안개 색을 장면에 직접 설정 (테마가 바뀌면 다시) */
function SceneColors({ bg }: { bg: THREE.Color }) {
  const { scene, invalidate } = useThree();
  useEffect(() => {
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 3, 11);
    invalidate();
  }, [bg, scene, invalidate]);
  return null;
}

function Helix({ items, onOpen, onFront }: { items: TItem[]; onOpen: (i: number) => void; onFront: (i: number) => void }) {
  const { camera, gl } = useThree();
  const target = useRef(0);
  const current = useRef(0);
  const lastFront = useRef(-1);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);
  const moved = useRef(0);

  useEffect(() => {
    const el = gl.domElement;
    const clamp = (v: number) => Math.max(0, Math.min(items.length - 1, v));
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      target.current = clamp(target.current + e.deltaY * 0.006);
    };
    const down = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
      moved.current = 0;
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      moved.current = d.moved;
      target.current = clamp(target.current - dx * 0.012 - dy * 0.012);
    };
    const up = () => (drag.current = null);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl, items.length]);

  useFrame((_, dt) => {
    current.current += (target.current - current.current) * Math.min(1, dt * 6);
    const t = current.current;
    camera.position.set(0, -t * STEP_Y, 0);
    camera.rotation.set(0, -t * ANGLE, 0);
    const f = Math.round(t);
    if (f !== lastFront.current) {
      lastFront.current = f;
      onFront(f);
    }
  });

  return (
    <>
      {items.map((it, i) => (
        <PhotoPlane
          key={it.key}
          item={it}
          index={i}
          onClick={(e) => {
            e.stopPropagation();
            if (moved.current < 6) onOpen(i);
          }}
        />
      ))}
    </>
  );
}

function PhotoPlane({ item, index, onClick }: { item: TItem; index: number; onClick: (e: ThreeEvent<MouseEvent>) => void }) {
  const mesh = useRef<THREE.Mesh>(null);
  const hover = useRef(false);
  const aspect = item.width && item.height ? item.width / item.height : 1;
  const w = aspect >= 1 ? 1.5 : 1.5 * aspect;
  const h = aspect >= 1 ? 1.5 / aspect : 1.5;
  const theta = index * ANGLE;
  const pos = useMemo(
    () => new THREE.Vector3(Math.sin(theta) * RADIUS, -index * STEP_Y, -Math.cos(theta) * RADIUS),
    [theta, index],
  );
  // 재질·도형을 직접 만들고, 썸네일이 오면 재질에 바로 붙인다 (JSX로 재질을 바꾸면 화면에 반영되지 않았다)
  const geometry = useMemo(() => new THREE.PlaneGeometry(w, h), [w, h]);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.15, toneMapped: false }), []);

  useEffect(() => {
    let alive = true;
    let t: THREE.Texture | null = null;
    void (async () => {
      const url = item.cloud?.urls.thumb ?? (item.local ? await localThumbUrl(item.local.key) : null);
      if (!url || !alive) return;
      loader.load(url, (loaded) => {
        if (!alive) return loaded.dispose();
        loaded.colorSpace = THREE.SRGBColorSpace;
        t = loaded;
        material.map = loaded;
        material.color.set(0xffffff);
        material.opacity = 1;
        material.transparent = false;
        material.needsUpdate = true;
      });
    })();
    return () => {
      alive = false;
      t?.dispose();
    };
  }, [item, material]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useEffect(() => {
    mesh.current?.position.copy(pos);
    mesh.current?.lookAt(0, pos.y, 0);
  }, [pos]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const s = hover.current ? 1.08 : 1;
    m.scale.x += (s - m.scale.x) * Math.min(1, dt * 10);
    m.scale.y = m.scale.x;
  });

  return (
    <mesh
      ref={mesh}
      geometry={geometry}
      material={material}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover.current = true;
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        hover.current = false;
        document.body.style.cursor = "";
      }}
    />
  );
}
