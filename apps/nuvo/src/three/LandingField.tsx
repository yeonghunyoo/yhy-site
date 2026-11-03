import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useTheme } from "../theme/theme";
import { tokenRgb } from "./color";

const vertex = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uPixelRatio;
  uniform float uMotion;
  attribute vec3 aStart;
  attribute float aRand;
  varying float vRand;
  varying float vGather;

  float ease(float t) { return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }

  void main() {
    // 흩어진 위치(aStart) → 사진 틀(position)로 모인다. 입자마다 출발 시점이 조금씩 다르다.
    float t = ease(clamp(uProgress * 1.5 - aRand * 0.5, 0.0, 1.0));
    vec3 p = mix(aStart, position, t);
    p += uMotion * vec3(
      sin(uTime * 0.6 + aRand * 40.0),
      cos(uTime * 0.5 + aRand * 30.0),
      0.0) * mix(0.25, 0.015, t);

    // 마우스 근처 입자는 살짝 밀려난다
    vec2 d = p.xy - uMouse;
    float dist = length(d);
    p.xy += normalize(d + 1e-4) * smoothstep(1.1, 0.0, dist) * 0.35 * uMotion;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aRand * 1.8) * uPixelRatio * (9.0 / -mv.z);
    vRand = aRand;
    vGather = t;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uAccent;
  varying float vRand;
  varying float vGather;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    if (r > 0.5) discard;
    float a = smoothstep(0.5, 0.1, r);
    vec3 col = mix(uColor, uAccent, step(0.93, vRand) * vGather);
    gl_FragColor = vec4(col, a * mix(0.35, 0.85, vGather));
  }
`;

const OFFSET_Y = 0.95;

/** 사진 틀 3×2 격자의 테두리·면 위에 점을 뿌린다 (= "모인 사진들") */
function frameTargets(count: number) {
  const out = new Float32Array(count * 3);
  const cols = 3;
  const rows = 2;
  const fw = 1.5;
  const fh = 1.1;
  const gap = 0.28;
  const totalW = cols * fw + (cols - 1) * gap;
  const totalH = rows * fh + (rows - 1) * gap;
  for (let i = 0; i < count; i++) {
    const cell = i % (cols * rows);
    const cx = (cell % cols) * (fw + gap) - totalW / 2 + fw / 2;
    const cy = Math.floor(cell / cols) * (fh + gap) - totalH / 2 + fh / 2;
    let x: number;
    let y: number;
    if (Math.random() < 0.55) {
      // 테두리
      const s = Math.random() * 2 * (fw + fh);
      if (s < fw) [x, y] = [s - fw / 2, -fh / 2];
      else if (s < fw + fh) [x, y] = [fw / 2, s - fw - fh / 2];
      else if (s < 2 * fw + fh) [x, y] = [fw / 2 - (s - fw - fh), fh / 2];
      else [x, y] = [-fw / 2, fh / 2 - (s - 2 * fw - fh)];
    } else {
      // 면 (사진 속 풍경처럼 아래쪽이 조금 더 촘촘하게)
      x = (Math.random() - 0.5) * fw * 0.9;
      y = (Math.pow(Math.random(), 1.4) - 0.5) * fh * 0.9;
    }
    out[i * 3] = cx + x;
    out[i * 3 + 1] = cy + y;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
  }
  return out;
}

function Field({ count, motion }: { count: number; motion: boolean }) {
  const { size, viewport } = useThree();
  const { resolved, accent } = useTheme();
  const mouse = useRef(new THREE.Vector2(99, 99));
  // 실제로 마우스를 움직이기 전에는 밀어내기 효과를 끈다 (R3F 포인터 초기값이 화면 중앙이라 구멍이 생겼다)
  const pointerActive = useRef(false);
  useEffect(() => {
    const on = () => (pointerActive.current = true);
    window.addEventListener("pointermove", on, { once: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const start = new Float32Array(count * 3);
    const rand = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = 3 + Math.random() * 5;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      start[i * 3] = r * Math.sin(ph) * Math.cos(th) * 1.4;
      start[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      start[i * 3 + 2] = r * Math.cos(ph) * 0.6 - 1;
      rand[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(frameTargets(count), 3));
    g.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(rand, 1));
    return g;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uProgress: { value: motion ? 0 : 1 },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(99, 99) },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uMotion: { value: motion ? 1 : 0 },
      uColor: { value: new THREE.Color() },
      uAccent: { value: new THREE.Color() },
    }),
    [motion],
  );

  // 테마가 바뀌면 점 색도 바꾼다
  useMemo(() => {
    uniforms.uColor.value.setRGB(...tokenRgb("--text"));
    uniforms.uAccent.value.setRGB(...tokenRgb("--accent"));
  }, [uniforms, resolved, accent]);

  useFrame((state, dt) => {
    const u = uniforms;
    u.uTime.value += dt;
    if (motion) u.uProgress.value = Math.min(1, u.uProgress.value + dt * 0.4);
    if (pointerActive.current) {
      const p = state.pointer;
      const s = Math.min(1, size.width / 760) * 0.9;
      // 화면 좌표 → 점 구름의 로컬 좌표 (아래 group의 scale/offset을 되돌림)
      const target = new THREE.Vector2((p.x * viewport.width) / 2 / s, ((p.y * viewport.height) / 2 - OFFSET_Y) / s);
      mouse.current.lerp(target, 0.15);
      u.uMouse.value.copy(mouse.current);
    }
  });

  // 재질을 직접 만든다: JSX prop으로 넘기면 uniforms 객체가 재질에 그대로 연결되지 않아 애니메이션이 멈췄다
  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // 사진 틀은 제목 위쪽에 놓는다
  const scale = Math.min(1, size.width / 760) * 0.9;
  return <points geometry={geometry} material={material} scale={[scale, scale, 1]} position={[0, OFFSET_Y, 0]} />;
}

export default function LandingField({ motion, lowEnd }: { motion: boolean; lowEnd: boolean }) {
  return (
    <Canvas dpr={[1, lowEnd ? 1 : 2]} camera={{ position: [0, 0, 6], fov: 50 }} gl={{ antialias: false, alpha: true }} frameloop={motion ? "always" : "demand"}>
      <Field count={lowEnd ? 1800 : window.innerWidth < 640 ? 2600 : 5200} motion={motion} />
    </Canvas>
  );
}
