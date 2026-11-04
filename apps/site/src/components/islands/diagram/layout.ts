// 흐름도 배치 — 작은 계층 배치(docs/05-06-chat-rag.md "흐름도 에이전트"). 외부 라이브러리 없이 노드 ≤14개 규모만 다룬다.
// 1) 되돌아가는 화살표(순환)는 배치에서만 뒤집는다 2) 가장 긴 경로로 층을 정한다 3) 이웃의 평균 위치(무게중심)로 층 안 순서를 몇 번 고친다
// 4) 글자를 줄바꿈해 상자 크기를 정하고 좌표를 매긴다. TB는 층이 위→아래, LR은 왼쪽→오른쪽.

import type { Diagram } from '../../../lib/diagram';

export interface PlacedNode {
  id: string;
  label: string;
  lines: string[];
  group?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedEdge {
  from: string;
  to: string;
  label?: string;
  /** SVG path d */
  d: string;
  /** 화살표 글자 위치 */
  lx: number;
  ly: number;
}

export interface Layout {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

const FONT = 13;
const LINE = 17;
const PAD_X = 12;
const PAD_Y = 10;
const NODE_W = 148;
const GAP_IN_LAYER = 20;
const GAP_LAYER_TB = 64;
const GAP_LAYER_LR = 72;
const MARGIN = 12;

/** 대략적인 글자 폭(한글·전각은 넓게, 영문은 좁게). 측정 없이 쓰는 근사값 */
const charWidth = (c: string) => (/[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(c) ? FONT : FONT * 0.58);

/** 상자 폭 안에 들어가게 낱말 단위로 줄바꿈(긴 낱말은 글자 단위로 자른다), 최대 3줄 */
export function wrap(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  let width = 0;
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
    width = 0;
  };
  for (const word of text.split(/(\s+)/)) {
    const ww = [...word].reduce((n, c) => n + charWidth(c), 0);
    if (width + ww <= maxWidth || !line.trim()) {
      if (ww <= maxWidth) {
        line += word;
        width += ww;
        continue;
      }
      for (const c of word) {
        if (width + charWidth(c) > maxWidth) push();
        line += c;
        width += charWidth(c);
      }
      continue;
    }
    push();
    if (/^\s+$/.test(word)) continue;
    line = word;
    width = ww;
  }
  push();
  if (lines.length > 3) return [...lines.slice(0, 2), `${lines[2].slice(0, -1)}…`];
  return lines.length ? lines : [''];
}

export function layout(diagram: Diagram): Layout {
  const ids = diagram.nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));

  // 1) 순환 찾기: 처음 나온 순서로 DFS, 지금 방문 중인 노드로 가는 화살표는 배치용으로 뒤집는다
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of diagram.edges) out.get(e.from)?.push(e.to);
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) back.add(`${id}>${to}`);
      else if (!state.get(to)) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  const dag = diagram.edges.map((e) => (back.has(`${e.from}>${e.to}`) ? { from: e.to, to: e.from } : { from: e.from, to: e.to }));

  // 2) 가장 긴 경로로 층
  const layer = new Map<string, number>(ids.map((id) => [id, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of dag) {
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0)) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const layers: string[][] = [];
  for (const id of ids) (layers[layer.get(id)!] ??= []).push(id);
  for (let i = 0; i < layers.length; i++) layers[i] ??= [];

  // 3) 무게중심으로 층 안 순서(위→아래, 아래→위 번갈아 4번)
  const pos = new Map<string, number>();
  const setPos = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  setPos();
  const parents = (id: string) => dag.filter((e) => e.to === id).map((e) => e.from);
  const children = (id: string) => dag.filter((e) => e.from === id).map((e) => e.to);
  for (let iter = 0; iter < 4; iter++) {
    const down = iter % 2 === 0;
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const l of order) {
      const score = (id: string) => {
        const ns = down ? parents(id) : children(id);
        return ns.length ? ns.reduce((n, x) => n + pos.get(x)!, 0) / ns.length : pos.get(id)!;
      };
      l.sort((a, b) => score(a) - score(b) || index.get(a)! - index.get(b)!);
      setPos();
    }
  }

  // 4) 크기와 좌표
  const lr = diagram.direction === 'LR';
  const size = new Map(
    diagram.nodes.map((n) => {
      const lines = wrap(n.label, NODE_W - PAD_X * 2);
      return [n.id, { lines, w: NODE_W, h: lines.length * LINE + PAD_Y * 2 }];
    }),
  );
  const span = (l: string[]) => l.reduce((n, id) => n + (lr ? size.get(id)!.h : size.get(id)!.w), 0) + Math.max(0, l.length - 1) * GAP_IN_LAYER;
  const widest = Math.max(...layers.map(span));
  const thick = layers.map((l) => Math.max(0, ...l.map((id) => (lr ? size.get(id)!.w : size.get(id)!.h))));
  const placed = new Map<string, PlacedNode>();
  let cursor = MARGIN;
  layers.forEach((l, li) => {
    let along = MARGIN + (widest - span(l)) / 2;
    for (const id of l) {
      const s = size.get(id)!;
      const node = diagram.nodes[index.get(id)!];
      const across = cursor + (thick[li] - (lr ? s.w : s.h)) / 2;
      placed.set(id, {
        id,
        label: node.label,
        lines: s.lines,
        group: node.group,
        w: s.w,
        h: s.h,
        x: lr ? across : along,
        y: lr ? along : across,
      });
      along += (lr ? s.h : s.w) + GAP_IN_LAYER;
    }
    cursor += thick[li] + (lr ? GAP_LAYER_LR : GAP_LAYER_TB);
  });
  const crossTotal = cursor - (lr ? GAP_LAYER_LR : GAP_LAYER_TB) + MARGIN;
  const width = lr ? crossTotal : widest + MARGIN * 2;
  const height = lr ? widest + MARGIN * 2 : crossTotal;

  // 화살표: 상자 가장자리 가운데끼리 부드러운 곡선. 같은 층이거나 거꾸로 가는 화살표는 옆으로 돌아간다
  const edges: PlacedEdge[] = diagram.edges.map((e) => {
    const a = placed.get(e.from)!;
    const b = placed.get(e.to)!;
    const forward = layer.get(e.to)! > layer.get(e.from)!;
    let d: string;
    let lx: number;
    let ly: number;
    if (!lr) {
      if (forward) {
        const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y];
        const my = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
        [lx, ly] = [(x1 + x2) / 2, my];
      } else {
        const [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x + b.w, b.y + b.h / 2];
        const bend = Math.max(x1, x2) + 36;
        d = `M${x1},${y1} C${bend},${y1} ${bend},${y2} ${x2},${y2}`;
        [lx, ly] = [bend - 8, (y1 + y2) / 2];
      }
    } else if (forward) {
      const [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2];
      const mx = (x1 + x2) / 2;
      d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      [lx, ly] = [mx, (y1 + y2) / 2];
    } else {
      const [x1, y1, x2, y2] = [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y + b.h];
      const bend = Math.max(y1, y2) + 32;
      d = `M${x1},${y1} C${x1},${bend} ${x2},${bend} ${x2},${y2}`;
      [lx, ly] = [(x1 + x2) / 2, bend - 6];
    }
    return { from: e.from, to: e.to, label: e.label, d, lx, ly };
  });
  // 옆으로 돌아가는 화살표가 그림 밖으로 나가지 않게 여유를 준다
  const extra = edges.some((e) => !(layer.get(e.to)! > layer.get(e.from)!)) ? 44 : 0;

  return { width: width + (lr ? 0 : extra), height: height + (lr ? extra : 0), nodes: [...placed.values()], edges };
}
