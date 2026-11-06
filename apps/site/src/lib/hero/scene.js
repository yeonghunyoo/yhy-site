// 히어로 3D 장면 — 픽셀화(저해상도 격자 + 흑백 계조 + 디더링) · 블러 · 스크롤 카메라.
// 설계: docs/guides/3d-hero.md. 사이트 홈(src/lib/hero/hero.ts)·프레임 렌더(scripts/hero/frames.mjs)·프로토타입이 이 파일 하나를 같이 쓴다.
// 'three'는 사이트에서는 Vite가 묶고(동적 import), 로컬 셸(scripts/hero/scene.html)·프로토타입에서는 import map으로 푼다.
import * as THREE from 'three';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** 1스텝이 끝나는 진행도. 0~STEP1 = 1스텝, STEP1~1 = 2스텝 */
export const STEP1 = 0.55;

/** 픽셀이 다 맺히는 진행도. 처음 조금만 스크롤해도 최대 해상도까지 부드럽게 올라가고 그 뒤로 유지한다(11/05) */
export const RESOLVE = 0.08;

/** 스크롤 진행도(0~1)에 따른 픽셀 연출. 프레임 렌더와 실시간이 같은 곡선을 쓴다. cols = 가장 고운 격자 */
export function look(p, cols) {
  const min = Math.max(12, Math.round(cols * 0.3)); // 시작은 고운 격자의 30%(최소 12칸)
  const t = smooth(0, RESOLVE, p);
  // 거친 픽셀·약한 블러 → 최대 해상도(cell 기준, 1280px에서 80칸)로 맺힌 뒤 끝까지 유지 — 카메라 앵글이 잘 보이게
  return { cols: Math.round(lerp(min, cols, t)), blur: 0.55 * (1 - t) };
}

/** 인물이 바라보는 방향(도). 0 = 화면 정면, − = 화면 왼쪽. 11/05: 시작 때 화면 왼쪽 대각선을 본다 */
export const FACE = -35;

/**
 * 카메라 키프레임(11/05 사용자 동선). 대상점 주위 구면 좌표(화면 기준): az(도, 0 = 화면 정면, − = 화면 왼쪽), el(도), r(거리), fov,
 * 그리고 카메라 자체 회전 roll(z축, 화면이 기우는 각) · pitch(x축, 고개 끄덕임) — 도.
 * 인물은 FACE(−35°)를 보고 있으므로 az = FACE − 45 ≈ −80이 인물의 오른쪽 대각, FACE + 45 ≈ +10이 왼쪽 대각이다.
 * 1스텝: 정면 멀리(인물은 화면 왼쪽 대각을 봄) → 다가가며 인물의 오른쪽 대각 → 반대로 돌아 왼쪽 대각 쪽에서 인물의 오른쪽 눈 클로즈업
 * 2스텝: 인물의 왼쪽 눈 클로즈업에서 시작(컷) → 줌아웃해 상반신. 끝은 수평(문구가 읽히게)
 */
const SHOTS = [
  [ // 1스텝
    { t: 0, at: 'head', az: 0, el: 8, r: 6.5, fov: 35, roll: 0, pitch: 0 },
    { t: 0.3, at: 'head', az: -80, el: 5, r: 4.8, fov: 34, roll: -9, pitch: 4 },
    { t: 1, at: 'eyeR', az: 8, el: 2, r: 0.6, fov: 30, roll: 7, pitch: -3 },
  ],
  [ // 2스텝
    { t: 0, at: 'eyeL', az: 12, el: 2, r: 0.5, fov: 30, roll: -8, pitch: 3 },
    { t: 1, at: 'bust', az: -15, el: 4, r: 4.4, fov: 32, roll: 0, pitch: 0 },
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

/**
 * 흉상 기준 대상점(모델 좌표: 정수리 y=2.15, 얼굴 +Z, 회전 전). 스캔 모델은 opts.points로 눈 위치를 맞춘다.
 * eyeR = 인물의 오른쪽 눈(모델 −X), eyeL = 인물의 왼쪽 눈(모델 +X). 장면에서는 FACE만큼 돌려 쓴다
 */
const POINTS = {
  head: [0, 1.6, 0],
  bust: [0, 1.35, 0], // 가슴 위가 화면에 들어오는 높이(11/05)
  eyeR: [-0.26, 1.8, 0.74],
  eyeL: [0.26, 1.8, 0.74],
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
  // 'pixel' = 칸을 계조 색으로 채움 / 'ascii' = 칸마다 글자(11/05, Codrops 모양 인식 ASCII를 가볍게): 밝기 → ramp, 윤곽 → - / | \
  mode: 'pixel',
  ramp: ' .:-=+*#%@',
  edge: 0.16, // 이웃 칸 밝기 차가 이보다 크면 윤곽 글자
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
uniform float uMode;     // 0 = pixel, 1 = ascii(색 대신 글자 정보를 담는다: r 밝기 단계, g 윤곽 방향, b 강조)
uniform float uGlyphs;   // ascii ramp 글자 수
uniform float uEdge;
uniform float uOutro;    // 0~1: 마지막 문장 뒤 — 장면이 가운데로 줄어들며 칸이 흩어져 사라진다
uniform vec3 uDark, uLight, uAccent;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }

vec3 sampleCell(vec2 cell) {
  vec2 uv = (cell + 0.5) / uGrid;
  // outro: 가운데를 향해 줄어든다(화면 밖을 샘플하면 비어 있음)
  uv = 0.5 + (uv - 0.5) / max(0.001, 1.0 - uOutro * 0.85);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  return pow(texture2D(tScene, uv).rgb, vec3(1.0 / 2.2));
}

float lumAt(vec2 cell) {
  vec3 c = sampleCell(cell);
  return clamp((dot(c, vec3(0.299, 0.587, 0.114)) - 0.06) * 1.2, 0.0, 1.0);
}

void main() {
  vec2 cell = floor(vUv * uGrid);
  bool gone = uOutro > 0.0 && hash(cell) < uOutro * uOutro; // 칸이 하나씩 꺼진다
  vec3 c = sampleCell(cell);
  if (uBlur > 0.001) { // 칸 단위 상자 블러(반경 최대 3칸)
    float r = uBlur * 3.0;
    vec3 acc = vec3(0.0);
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) acc += sampleCell(cell + vec2(float(x), float(y)) * r * 0.5);
    c = mix(c, acc / 25.0, uBlur);
  }
  // 강조색 표식: 마젠타 계열 재질(넥타이)만 강조색으로 남긴다
  bool accent = c.r > c.g * 1.6 && c.b > c.g * 1.6 && c.r > 0.12;
  // 눈 표식(청록, 11/05): pixel 모드에서 눈 칸만 ASCII 숫자(0·1)로 — 화면 패스가 알파로 알아본다
  bool eye = c.g > 0.45 && c.b > 0.45 && c.r < c.g * 0.5;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  if (accent) lum = max(c.r, c.b);
  lum = clamp((lum - 0.06) * 1.2, 0.0, 1.0); // 검은 바탕은 계조 0에 붙여 디더 잡음이 없게
  if (uMode > 0.5) {
    // 윤곽: 이웃 칸 밝기 기울기(Sobel 간이) → 윤곽선 방향(기울기에 수직)을 4방향으로
    float gx = lumAt(cell + vec2(1.0, 0.0)) - lumAt(cell - vec2(1.0, 0.0));
    float gy = lumAt(cell + vec2(0.0, 1.0)) - lumAt(cell - vec2(0.0, 1.0));
    float code = 0.0;
    if (length(vec2(gx, gy)) > uEdge && lum > 0.02) {
      float phi = mod(atan(gy, gx) + 1.5707963 + 0.3926991, 3.1415926);
      code = floor(phi / 0.7853982) + 1.0; // 1 '-', 2 '/', 3 '|', 4 '\'
    }
    float level = floor(lum * (uGlyphs - 1.0) + 0.5) / (uGlyphs - 1.0);
    if (gone) { level = 0.0; code = 0.0; }
    gl_FragColor = vec4(level, code / 4.0, accent ? 1.0 : 0.0, 1.0);
    return;
  }
  float d = mix(0.5, bayer4(cell), uDither);
  float q = clamp(floor(lum * (uLevels - 1.0) + d) / (uLevels - 1.0), 0.0, 1.0);
  vec3 col = accent ? mix(uDark, uAccent, q) : mix(uDark, uLight, q);
  // 알파 1 = 보통 픽셀, 0.5 = 눈 칸(숫자는 화면 패스가 칸을 2×2로 쪼개 찍는다)
  if (eye && !gone) { gl_FragColor = vec4(uAccent, 0.5); return; }
  gl_FragColor = vec4(gone ? uDark : col, 1.0);
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
  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), skin);
  earL.scale.set(0.5, 1, 0.8);
  earL.position.set(-0.74, 1.58, 0);
  const earR = earL.clone();
  earR.position.x = 0.74;
  // 눈(11/05 임시): 기계처럼 — 가로로 긴 발광 슬릿. 마젠타 표식 재질이라 화면에서는 강조색으로 빛난다
  // 청록 표식 재질: 화면에서는 눈 칸만 ASCII 숫자(강조색)로 그린다(11/05)
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 1, roughness: 0.3 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.09, 0.06), eyeMat); // 11/05 조금 크게(0.24×0.07 →)
  eyeL.position.set(-0.26, 1.8, 0.77); // 머리 표면(타원체) 바로 바깥, 11/05 조금 위로(1.72 → 1.8)
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
  // 11/05: 코·손·눈썹은 뺐다(코가 입처럼 읽혀서, 손은 안 보이게). 가슴 위로만 화면에 들어오게 카메라를 맞춘다(SHOTS)
  g.add(head, cap, earL, earR, eyeL, eyeR, neck, torso, front, tie);
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
  subject.rotation.y = THREE.MathUtils.degToRad(FACE); // 인물이 화면 왼쪽 대각을 본다
  scene.add(subject);

  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.05, 100);
  const faceRad = THREE.MathUtils.degToRad(FACE);
  const yAxis = new THREE.Vector3(0, 1, 0);
  const points = Object.fromEntries(
    Object.entries({ ...POINTS, ...(opts.points ?? {}) }).map(([k, v]) => [k, new THREE.Vector3(...v).applyAxisAngle(yAxis, faceRad)]),
  );

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
      uMode: { value: opts.mode === 'ascii' ? 1 : 0 },
      uGlyphs: { value: opts.ramp.length },
      uEdge: { value: opts.edge },
      uOutro: { value: 0 },
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
  // ascii: 글자 아틀라스(ramp + 윤곽 4글자)를 캔버스로 만든다. 글꼴이 늦게 오면 다시 만든다
  const GLYPH = 64;
  const atlasCanvas = document.createElement('canvas');
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.minFilter = THREE.LinearFilter;
  atlas.generateMipmaps = false;
  function drawAtlas() {
    const chars = [...opts.ramp, '-', '/', '|', '\\', '0', '1']; // 끝의 0·1은 pixel 모드 눈 글자
    atlasCanvas.width = GLYPH * chars.length;
    atlasCanvas.height = GLYPH;
    const ctx = atlasCanvas.getContext('2d');
    ctx.clearRect(0, 0, atlasCanvas.width, GLYPH);
    ctx.fillStyle = '#fff';
    ctx.font = `600 ${GLYPH * 0.82}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    chars.forEach((ch, i) => ctx.fillText(ch, i * GLYPH + GLYPH / 2, GLYPH * 0.54));
    atlas.needsUpdate = true;
    return chars.length;
  }
  const glyphTotal = drawAtlas();
  document.fonts?.load(`600 ${GLYPH * 0.82}px "IBM Plex Mono"`).then(() => { drawAtlas(); drawn = ''; render(); }, () => {});

  const blit = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
precision highp float;
uniform sampler2D tPixel, tAtlas;
uniform vec2 uGrid;
uniform float uMode, uGlyphs, uTotal;
uniform float uTick;     // 눈 숫자 박자(정수, 11/05) — 칸마다 다른 박자로 0·1이 계속 바뀐다
uniform vec3 uDark, uLight, uAccent;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (uMode < 0.5) {
    vec4 px = texture2D(tPixel, vUv);
    if (px.a > 0.95) { gl_FragColor = vec4(px.rgb, 1.0); return; }
    // 눈 칸: 픽셀 4×4칸에 숫자 5×5 — 숫자 한 개가 픽셀 한 칸의 가로·세로 4/5(넓이 약 2/3, 11/06 조금 키움.
    // 11/05: 2×2로 쪼갠 1/4은 너무 작았고 → 2×2칸에 3×3, 넓이 약 1/2). 4칸마다 격자가 맞물린다.
    // 작은 칸마다 2~4박자 주기·어긋난 위상으로 다시 뽑는다
    vec2 g = vUv * uGrid * 1.25;
    vec2 sc = floor(g);
    vec2 inCellP = fract(g);
    float beat = floor(uTick / (2.0 + floor(hash(sc + 5.0) * 3.0)) + hash(sc + 9.0) * 4.0);
    float digit = hash(sc + 17.0 + beat * 1.37) < 0.5 ? 0.0 : 1.0;
    float ga = texture2D(tAtlas, vec2((uGlyphs + 4.0 + digit + inCellP.x) / uTotal, inCellP.y)).r;
    // 눈 칸 바탕은 강조색을 아주 옅게 — 숫자 사이도 은은히 빛나 보이게
    gl_FragColor = vec4(mix(mix(uDark, px.rgb, 0.14), px.rgb, ga), 1.0);
    return;
  }
  vec2 cell = floor(vUv * uGrid);
  vec2 inCell = fract(vUv * uGrid);
  vec4 d = texture2D(tPixel, (cell + 0.5) / uGrid);
  float code = floor(d.g * 4.0 + 0.5);
  float idx = code > 0.5 ? uGlyphs + code - 1.0 : floor(d.r * (uGlyphs - 1.0) + 0.5);
  float a = texture2D(tAtlas, vec2((idx + inCell.x) / uTotal, inCell.y)).r;
  vec3 ink = d.b > 0.5 ? uAccent : (code > 0.5 ? uLight : mix(uLight * 0.5, uLight, d.r));
  gl_FragColor = vec4(mix(uDark, ink, a), 1.0);
}`,
    uniforms: {
      tPixel: { value: pixelRT.texture },
      tAtlas: { value: atlas },
      uGrid: { value: new THREE.Vector2(64, 36) },
      uMode: { value: opts.mode === 'ascii' ? 1 : 0 },
      uGlyphs: { value: opts.ramp.length },
      uTotal: { value: glyphTotal },
      uTick: { value: 0 },
      uDark: { value: hex(opts.palette.dark) },
      uLight: { value: hex(opts.palette.light) },
      uAccent: { value: hex(opts.palette.accent) },
    },
    depthTest: false,
  });
  const blitScene = new THREE.Scene();
  blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blit));

  let progress = 0;
  let outro = 0;
  let tick = 0; // 눈 숫자 박자(setTick)
  let drawn = ''; // 마지막으로 그린 상태(진행도·outro·눈 박자) — 같으면 다시 그리지 않는다
  let painted = ''; // 3D·후처리를 마지막으로 그린 상태 — 눈 박자만 바뀌면 화면 패스만 다시 돈다
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
    drawn = painted = '';
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
    post.uniforms.uOutro.value = outro;
    blit.uniforms.uGrid.value.set(l.cols, rows);
    renderer.setRenderTarget(pixelRT);
    renderer.render(postScene, postCam);
    renderer.setRenderTarget(null);
    return { cols, fineRows };
  }

  function render() {
    const key = `${progress}:${outro}:${tick}`;
    if (drawn === key) return;
    drawn = key;
    const scene3d = `${progress}:${outro}`;
    if (painted !== scene3d) paint();
    painted = scene3d;
    renderer.render(blitScene, postCam);
  }

  /** 프레임 캡처: 격자 크기 결과를 픽셀 배열로(frames.mjs). pixel 모드 전용 — ascii는 글자 정보가 담겨 그림이 아니다 */
  function snapshot() {
    const { cols, fineRows } = paint();
    const data = new Uint8Array(cols * fineRows * 4);
    renderer.readRenderTargetPixels(pixelRT, 0, 0, cols, fineRows, data);
    for (let i = 3; i < data.length; i += 4) data[i] = 255; // 눈 글자 표식(알파)은 그림으로는 불투명하게
    return { width: cols, height: fineRows, data: Array.from(data) };
  }

  async function loadModel(url) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { MeshoptDecoder } = await import('three/addons/libs/meshopt_decoder.module.js');
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    scene.remove(subject);
    subject = new THREE.Group().add(fitModel(gltf.scene, accentMat));
    subject.rotation.y = THREE.MathUtils.degToRad(FACE);
    scene.add(subject);
    drawn = painted = '';
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
    /** 마지막 문장 뒤 정리(0~1): 픽셀이 가운데로 모여 사라진다 */
    setOutro(o) {
      outro = Math.min(1, Math.max(0, o));
      render();
    },
    /** 눈 숫자 박자(정수). 바꿀 때마다 눈 칸의 0·1이 칸마다 다른 주기로 다시 뽑힌다 */
    setTick(n) {
      tick = n;
      blit.uniforms.uTick.value = n;
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
      const ascii = opts.mode === 'ascii' ? 1 : 0;
      post.uniforms.uMode.value = ascii;
      post.uniforms.uEdge.value = opts.edge;
      blit.uniforms.uMode.value = ascii;
      blit.uniforms.uDark.value.copy(post.uniforms.uDark.value);
      blit.uniforms.uLight.value.copy(post.uniforms.uLight.value);
      blit.uniforms.uAccent.value.copy(post.uniforms.uAccent.value);
      drawn = painted = '';
      render();
    },
    dispose() {
      rt.dispose();
      pixelRT.dispose();
      atlas.dispose();
      renderer.dispose();
    },
  };
}
