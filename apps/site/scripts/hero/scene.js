// 히어로 3D 장면 — 픽셀화(저해상도 격자 + 흑백 계조 + 디더링) · 블러 · 스크롤 카메라.
// 설계: docs/guides/3d-hero.md. 프로토타입(아티팩트)·프레임 렌더(frames.mjs)·사이트가 이 파일 하나를 같이 쓴다.
// 'three'와 'three/addons/'는 import map으로 푼다(브라우저 ES 모듈, 빌드 도구 없이 동작).
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** 1스텝이 끝나는 진행도. 0~STEP1 = 1스텝, STEP1~1 = 2스텝 */
export const STEP1 = 0.55;

/** 스크롤 진행도(0~1)에 따른 픽셀 연출. 프레임 렌더와 실시간이 같은 곡선을 쓴다. cols = 가장 고운 격자 */
export function look(p, cols) {
  const min = Math.max(12, Math.round(cols * 0.3)); // 시작은 고운 격자의 30%(최소 12칸 — 형체는 보이게)
  const s1 = p / STEP1;
  let c = lerp(min, cols, smooth(0, 1, s1)); // 1스텝: 거친 픽셀 → 고운 픽셀
  if (p > STEP1) c = lerp(cols * 0.6, cols, smooth(STEP1, STEP1 + 0.12, p)); // 2스텝 컷: 잠깐 거칠어졌다 다시 맺힘
  return { cols: Math.round(c), blur: 0.55 * (1 - smooth(0, 0.8, s1)) }; // 시작 블러를 줄여 처음부터 형체가 보이게
}

/**
 * 카메라 키프레임(11/05 사용자 동선). 대상점 주위 구면 좌표: az(도, 0 = 정면, − = 화면 왼쪽), el(도), r(거리), fov,
 * 그리고 카메라 자체 회전 roll(z축, 화면이 기우는 각) · pitch(x축, 고개 끄덕임) — 도.
 * 1스텝: 왼쪽으로 돌며 다가감(처음 25%) → 방향을 바꿔 오른쪽으로 돌며 인물의 오른쪽 눈(화면 왼쪽) 클로즈업
 * 2스텝: 인물의 왼쪽 눈(화면 오른쪽) 클로즈업에서 시작(컷) → 줌아웃해 상반신. 끝은 수평(문구가 읽히게)
 */
const SHOTS = [
  [ // 1스텝
    { t: 0, at: 'head', az: -35, el: 10, r: 9, fov: 35, roll: 0, pitch: 0 },
    { t: 0.25, at: 'head', az: -75, el: 6, r: 5.2, fov: 34, roll: -9, pitch: 4 },
    { t: 1, at: 'eyeL', az: -6, el: 2, r: 0.6, fov: 30, roll: 7, pitch: -3 },
  ],
  [ // 2스텝
    { t: 0, at: 'eyeR', az: 18, el: 2, r: 0.5, fov: 30, roll: -8, pitch: 3 },
    { t: 1, at: 'bust', az: 0, el: 4, r: 7.5, fov: 32, roll: 0, pitch: 0 },
  ],
];

/** 진행도 → 카메라 위치·대상·화각·회전. points: 대상점(head·eyeL·eyeR·bust) */
export function cameraAt(p, points) {
  const step = p <= STEP1 ? 0 : 1;
  const u = step === 0 ? p / STEP1 : (p - STEP1) / (1 - STEP1);
  const keys = SHOTS[step];
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = smooth(a.t, b.t, u);
  const target = new THREE.Vector3().lerpVectors(points[a.at], points[b.at], t);
  const az = THREE.MathUtils.degToRad(lerp(a.az, b.az, t));
  const el = THREE.MathUtils.degToRad(lerp(a.el, b.el, t));
  const r = Math.exp(lerp(Math.log(a.r), Math.log(b.r), t)); // 거리는 로그로 — 다가가는 속도가 고르게 느껴진다
  const pos = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(r).add(target);
  // 좌우로 흔드는 움직임: 키프레임 각에 잔물결을 더한다(구간 끝에서 0이라 컷·마지막 정지 화면은 그대로)
  const sway = Math.sin(u * Math.PI * 3) * Math.sin(u * Math.PI);
  const roll = THREE.MathUtils.degToRad(lerp(a.roll, b.roll, t) + sway * 4);
  const pitch = THREE.MathUtils.degToRad(lerp(a.pitch, b.pitch, t) + sway * 1.5);
  return { pos, target, fov: lerp(a.fov, b.fov, t), roll, pitch };
}

/** 흉상 기준 대상점(정수리 y=2.15, 얼굴 +Z). 스캔 모델은 opts.points로 눈 위치를 맞춘다 */
const POINTS = {
  head: [0, 1.6, 0],
  bust: [0, 1.15, 0],
  eyeL: [-0.26, 1.72, 0.74], // 화면 왼쪽 눈 = 인물의 오른쪽 눈
  eyeR: [0.26, 1.72, 0.74], // 화면 오른쪽 눈 = 인물의 왼쪽 눈
};

const DEFAULTS = {
  // 기본 단위는 칸 크기(px)다(11/05). 가로 칸 수 = 화면 폭 ÷ cell, [minCols, maxCols]로 묶는다.
  // cols를 주면 그 칸 수로 고정(프레임 렌더처럼 화면 폭과 상관없을 때)
  cell: 16, // 11/05: 24 → 16 — 1280px에서 80칸(처음 104칸의 약 75%)
  minCols: 40, // 좁은 화면에서도 얼굴을 알아볼 최소(폰 390px ≈ 칸 10px)
  maxCols: 84, // 넓은 화면에서도 칸이 잘아지지 않게
  cols: null,
  levels: 6, // 흑백 계조 단계(11/05: 12 → 6)
  dither: true,
  aspect: null, // 프레임 비율(null = 캔버스 비율)
  palette: { dark: '#17191c', light: '#e9ebe6', accent: '#8c98ff' },
  modelUrl: null, // 없으면 임시 흉상
  points: null, // 대상점 덮어쓰기(스캔 모델의 눈 위치 등) — { eyeL: [x, y, z], … }
  preserve: false, // 프레임 캡처용
};

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uGrid;      // 지금 격자(칸 수)
uniform float uLevels;
uniform float uBlur;     // 0~1
uniform float uDither;   // 0/1
uniform vec3 uDark, uLight, uAccent;
varying vec2 vUv;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 sampleCell(vec2 cell) {
  vec2 uv = (cell + 0.5) / uGrid;
  return pow(texture2D(tScene, uv).rgb, vec3(1.0 / 2.2));
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  vec3 c = sampleCell(cell);
  if (uBlur > 0.001) { // 칸 단위 상자 블러(반경 최대 3칸)
    float r = uBlur * 3.0;
    vec3 acc = vec3(0.0);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) acc += sampleCell(cell + vec2(float(x), float(y)) * r * 0.5);
    c = mix(c, acc / 25.0, uBlur);
  }
  // 강조색 표식: 마젠타 계열 재질(넥타이)만 강조색으로 남긴다
  bool accent = c.r > c.g * 1.6 && c.b > c.g * 1.6 && c.r > 0.12;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  if (accent) lum = max(c.r, c.b);
  lum = clamp((lum - 0.06) * 1.2, 0.0, 1.0); // 검은 바탕은 계조 0에 붙여 디더 잡음이 없게
  float d = mix(0.5, bayer4(cell), uDither);
  float q = clamp(floor(lum * (uLevels - 1.0) + d) / (uLevels - 1.0), 0.0, 1.0);
  vec3 col = accent ? mix(uDark, uAccent, q) : mix(uDark, uLight, q);
  gl_FragColor = vec4(col, 1.0);
}`;

const hex = (h) => new THREE.Color(h);

function placeholderBust(accentMat) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xb9b2a8, roughness: 0.62 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x34383e, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.7 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin);
  head.scale.set(0.74, 0.96, 0.84);
  head.position.y = 1.62;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.02, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42), hair);
  cap.scale.copy(head.scale);
  cap.position.set(0, 1.66, -0.04);
  cap.rotation.x = -0.25;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 16), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.55, 0.86);
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
  earL.scale.set(0.5, 1, 0.8);
  earL.position.set(-0.74, 1.58, 0);
  const earR = earL.clone();
  earR.position.x = 0.74;
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), hair);
  brow.position.set(-0.26, 1.86, 0.74);
  brow.rotation.z = 0.18;
  const brow2 = brow.clone();
  brow2.position.set(0.26, 1.9, 0.74);
  brow2.rotation.z = -0.32; // 한쪽 눈썹만 올린 표정
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), eyeMat);
  eyeL.position.set(-0.26, 1.72, 0.7);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.26;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.55, 24), skin);
  neck.position.y = 0.82;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 0.7, 8, 24), suit);
  torso.scale.set(1.45, 1, 0.62);
  torso.position.y = -0.25;
  const front = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 3), shirt);
  front.rotation.set(Math.PI, 0, 0);
  front.scale.set(1, 1, 0.2);
  front.position.set(0, 0.32, 0.5);
  const tie = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.78, 0.05), accentMat);
  tie.position.set(0, 0.2, 0.56);
  // 가리키는 손: 주먹 + 검지(카메라 쪽)
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.3), skin);
  fist.position.set(0.95, 0.9, 0.9);
  fist.rotation.y = -0.3;
  const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 12), skin);
  finger.rotation.x = Math.PI / 2;
  finger.position.set(0.9, 0.98, 1.2);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 16), suit);
  sleeve.rotation.x = Math.PI / 2.6;
  sleeve.position.set(1.05, 0.62, 0.45);
  g.add(head, cap, nose, earL, earR, brow, brow2, eyeL, eyeR, neck, torso, front, tie, fist, finger, sleeve);
  return g;
}

/** GLB 모델을 흉상 크기·위치로 맞춘다. 이름에 'tie'가 든 메시는 강조색 표식 재질로 바꾼다 */
function fitModel(root, accentMat) {
  root.traverse((o) => {
    if (o.isMesh && /tie/i.test(o.name)) o.material = accentMat;
  });
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const scale = 3.0 / size.y; // 흉상 높이 3(어깨 아래 ~ 정수리)
  root.scale.setScalar(scale);
  const b2 = new THREE.Box3().setFromObject(root);
  const c = b2.getCenter(new THREE.Vector3());
  root.position.set(-c.x, 2.15 - b2.max.y, -c.z); // 정수리 y=2.15
  return root;
}

export function createHero(canvas, options = {}) {
  const opts = { ...DEFAULTS, ...options, palette: { ...DEFAULTS.palette, ...(options.palette ?? {}) } };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: opts.preserve });
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // 바탕은 계조 0(= palette.dark)
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff00ff, roughness: 0.5 });
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3, 4, 4);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(3, 2.5, -4);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));

  let subject = placeholderBust(accentMat);
  scene.add(subject);

  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 100);
  const points = Object.fromEntries(Object.entries({ ...POINTS, ...(opts.points ?? {}) }).map(([k, v]) => [k, new THREE.Vector3(...v)]));

  const rt = new THREE.WebGLRenderTarget(64, 36, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tScene: { value: rt.texture },
      uGrid: { value: new THREE.Vector2(64, 36) },
      uLevels: { value: opts.levels },
      uBlur: { value: 0 },
      uDither: { value: opts.dither ? 1 : 0 },
      uDark: { value: hex(opts.palette.dark) },
      uLight: { value: hex(opts.palette.light) },
      uAccent: { value: hex(opts.palette.accent) },
    },
    depthTest: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 픽셀 결과는 격자 크기(예: 104×58)의 작은 타깃에 한 번만 계산하고, 화면에는 칸을 그대로 키워 옮긴다.
  // 셰이더(블러 25탭·디더)를 화면 픽셀마다 돌리지 않아 가볍다(11/05: 스크롤 버벅임)
  const pixelRT = new THREE.WebGLRenderTarget(64, 36, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const blit = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: 'uniform sampler2D tPixel; varying vec2 vUv; void main() { gl_FragColor = texture2D(tPixel, vUv); }',
    uniforms: { tPixel: { value: pixelRT.texture } },
    depthTest: false,
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit));

  let progress = 0;
  let drawn = -1; // 마지막으로 그린 진행도 — 같으면 다시 그리지 않는다
  let width = 1;
  let height = 1;

  function aspect() {
    return opts.aspect ?? width / height;
  }

  /** 가장 고운 격자의 가로 칸 수 */
  function gridCols() {
    return opts.cols ?? Math.min(opts.maxCols, Math.max(opts.minCols, Math.round(width / opts.cell)));
  }

  function resize(w = canvas.clientWidth, h = canvas.clientHeight) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    drawn = -1;
    render();
  }

  /** 장면 → 저해상도 → 픽셀(pixelRT). 화면에는 옮기지 않는다 */
  function paint() {
    const a = aspect();
    const cols = gridCols();
    const l = look(progress, cols);
    const rows = Math.max(1, Math.round(l.cols / a));
    const fineRows = Math.max(1, Math.round(cols / a));
    if (rt.width !== cols || rt.height !== fineRows) rt.setSize(cols, fineRows);
    if (pixelRT.width !== cols || pixelRT.height !== fineRows) pixelRT.setSize(cols, fineRows);

    const shot = cameraAt(progress, points);
    camera.position.copy(shot.pos);
    camera.fov = shot.fov;
    camera.aspect = a;
    camera.updateProjectionMatrix();
    camera.lookAt(shot.target);
    camera.rotateZ(shot.roll); // z축: 화면이 좌우로 기울어짐
    camera.rotateX(shot.pitch); // x축: 위아래로 끄덕임

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    post.uniforms.uGrid.value.set(l.cols, rows);
    post.uniforms.uBlur.value = l.blur;
    renderer.setRenderTarget(pixelRT);
    renderer.render(postScene, postCam);
    renderer.setRenderTarget(null);
    return { cols, fineRows };
  }

  function render() {
    if (drawn === progress) return;
    drawn = progress;
    paint();
    renderer.render(blitScene, postCam);
  }

  /** 프레임 캡처: 격자 크기 결과를 픽셀 배열로(frames.mjs) */
  function snapshot() {
    const { cols, fineRows } = paint();
    const data = new Uint8Array(cols * fineRows * 4);
    renderer.readRenderTargetPixels(pixelRT, 0, 0, cols, fineRows, data);
    return { width: cols, height: fineRows, data: Array.from(data) };
  }

  async function loadModel(url) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    scene.remove(subject);
    subject = fitModel(gltf.scene, accentMat);
    scene.add(subject);
    drawn = -1;
    render();
  }

  const ready = opts.modelUrl ? loadModel(opts.modelUrl) : Promise.resolve();

  return {
    ready,
    resize,
    render,
    snapshot,
    loadModel,
    setProgress(p) {
      progress = Math.min(1, Math.max(0, p));
      render();
    },
    setOptions(next) {
      // palette는 합친다 — 통째로 덮으면 dark·light가 사라져 바탕이 흰색이 된다(11/05 버그)
      const { palette, ...rest } = next;
      Object.assign(opts, rest);
      if (palette) opts.palette = { ...opts.palette, ...palette };
      post.uniforms.uLevels.value = opts.levels;
      post.uniforms.uDither.value = opts.dither ? 1 : 0;
      post.uniforms.uDark.value = hex(opts.palette.dark);
      post.uniforms.uLight.value = hex(opts.palette.light);
      post.uniforms.uAccent.value = hex(opts.palette.accent);
      drawn = -1;
      render();
    },
    dispose() {
      rt.dispose();
      pixelRT.dispose();
      renderer.dispose();
    },
  };
}
