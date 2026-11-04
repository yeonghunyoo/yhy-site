/** 64bit dHash(hex 16자) 사이의 해밍 거리 */
export function hamming(a: string, b: string) {
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/**
 * 유사 이미지 묶기. 64bit를 16bit 밴드 4개로 나눠, 같은 밴드 값을 가진 것끼리만 비교한다.
 * 비둘기집 원리: 거리 ≤ 3 이면 적어도 한 밴드는 반드시 같다 → 놓치는 쌍 없음.
 */
export function groupSimilar<T>(items: T[], hashOf: (t: T) => string | null, maxDistance = 3): T[][] {
  const withHash = items.map((it, i) => ({ it, i, h: hashOf(it) })).filter((x): x is { it: T; i: number; h: string } => !!x.h);
  const parent = withHash.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x]!)));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (let band = 0; band < 4; band++) {
    const buckets = new Map<string, number[]>();
    withHash.forEach((x, idx) => {
      const k = x.h.slice(band * 4, band * 4 + 4);
      const arr = buckets.get(k);
      if (arr) arr.push(idx);
      else buckets.set(k, [idx]);
    });
    for (const idxs of buckets.values()) {
      if (idxs.length < 2 || idxs.length > 500) continue; // 단색 이미지 등 퇴화 버킷은 건너뜀
      for (let a = 0; a < idxs.length; a++)
        for (let b = a + 1; b < idxs.length; b++) {
          const ia = idxs[a]!;
          const ib = idxs[b]!;
          if (find(ia) !== find(ib) && hamming(withHash[ia]!.h, withHash[ib]!.h) <= maxDistance) union(ia, ib);
        }
    }
  }

  const groups = new Map<number, T[]>();
  withHash.forEach((x, idx) => {
    const r = find(idx);
    const g = groups.get(r);
    if (g) g.push(x.it);
    else groups.set(r, [x.it]);
  });
  return [...groups.values()].filter((g) => g.length > 1);
}
