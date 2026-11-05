// 히어로 3D 장면 — 픽셀화(저해상도 격자 + 흑백 계조 + 디더링) · 블러 · 스크롤 카메라.
// 설계: docs/guides/3d-hero.md. 프로토타입(아티팩트)·프레임 렌더(frames.mjs)·사이트가 이 파일 하나를 같이 쓴다.
// 'three'와 'three/addons/'는 import map으로 푼다(브라우저 ES 모듈, 빌드 도구 없이 동작).
import * as THREE from 'three';

/** 스크롤 진행도(0~1)에 따른 연출 값. 프레임 렌더와 실시간이 같은 곡선을 쓴다 */
export function look(p, opts) {
  const s = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return {
    cols: Math.round(opts.minCols + (opts.cols - opts.minCols) * s(0, 0.55, p)), // 거친 픽셀 → 고운 픽셀
    blur: 1 - s(0, 0.45, p), // 흐림 → 선명
    zoom: s(0.82, 1, p) ** 3, // 마지막에 확 줌인(밈의 순간)
  };
}

const DEFAULTS = {
  cols: 104, // 가장 고운 격자의 가로 칸 수(11/05: 160 → 104, 칸을 키움)
  minCols: 20, // 시작 격자
  levels: 6, // 흑백 계조 단계(11/05: 12 → 6)
  dither: true,
  aspect: null, // 프레임 비율(null = 캔버스 비율)
  palette: { dark: '#17191c', light: '#e9ebe6', accent: '#8c98ff' },
  modelUrl: null, // 없으면 임시 흉상
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
  g.add(head, cap, nose, earL, earR, brow, brow2, neck, torso, front, tie, fist, finger, sleeve);
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

  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100);
  const target = new THREE.Vector3(0, 1.55, 0);
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(3.2, 2.6, 10),
    new THREE.Vector3(-2.6, 2.0, 7),
    new THREE.Vector3(-1.6, 1.7, 4.6),
    new THREE.Vector3(0, 1.6, 3.4),
  ]);

  const rt = new THREE.WebGLRenderTarget(opts.cols, 90, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const post = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      tScene: { value: rt.texture },
      uGrid: { value: new THREE.Vector2(opts.cols, 90) },
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

  let progress = 0;
  let width = 1;
  let height = 1;

  function aspect() {
    return opts.aspect ?? width / height;
  }

  function resize(w = canvas.clientWidth, h = canvas.clientHeight) {
    width = Math.max(1, w);
    height = Math.max(1, h);
    renderer.setSize(width, height, false);
    render();
  }

  function render() {
    const a = aspect();
    const l = look(progress, opts);
    const cols = l.cols;
    const rows = Math.max(1, Math.round(cols / a));
    // 장면은 가장 고운 격자 크기로 한 번 그리고, 지금 격자로 칸을 맞춰 뽑는다
    const fineRows = Math.max(1, Math.round(opts.cols / a));
    if (rt.width !== opts.cols || rt.height !== fineRows) rt.setSize(opts.cols, fineRows);

    const pos = path.getPointAt(Math.min(1, progress));
    camera.position.copy(pos).lerp(new THREE.Vector3(0.05, 1.6, 2.9), l.zoom); // 얼굴이 화면을 채우는 거리
    camera.fov = 35 - 17 * l.zoom;
    camera.aspect = a;
    camera.updateProjectionMatrix();
    camera.lookAt(target);

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    post.uniforms.uGrid.value.set(cols, rows);
    post.uniforms.uBlur.value = l.blur;
    renderer.render(postScene, postCam);
  }

  /** 프레임 캡처: 가장 고운 격자 크기의 결과를 픽셀 배열로 돌려준다(frames.mjs) */
  function snapshot() {
    const a = aspect();
    const fineRows = Math.max(1, Math.round(opts.cols / a));
    const out = new THREE.WebGLRenderTarget(opts.cols, fineRows);
    const w = width;
    const h = height;
    resize(opts.cols, fineRows);
    renderer.setRenderTarget(out);
    const l = look(progress, opts);
    post.uniforms.uGrid.value.set(l.cols, Math.max(1, Math.round(l.cols / a)));
    post.uniforms.uBlur.value = l.blur;
    renderer.render(postScene, postCam);
    const data = new Uint8Array(opts.cols * fineRows * 4);
    renderer.readRenderTargetPixels(out, 0, 0, opts.cols, fineRows, data);
    renderer.setRenderTarget(null);
    out.dispose();
    resize(w, h);
    return { width: opts.cols, height: fineRows, data: Array.from(data) };
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
      render();
    },
    dispose() {
      rt.dispose();
      renderer.dispose();
    },
  };
}
