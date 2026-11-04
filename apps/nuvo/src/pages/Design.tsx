import { useEffect, useState } from "react";
import { Button, Progress, Segmented } from "../components/ui";
import { Icon } from "../components/icons";
import { cssColorToRgb } from "../three/color";
import { setAccent, useTheme, type Accent } from "../theme/theme";

const TOKENS = [
  ["--bg", "배경"],
  ["--surface", "면"],
  ["--line", "선"],
  ["--text", "본문"],
  ["--muted", "보조"],
  ["--faint", "흐림"],
  ["--accent", "강조"],
  ["--danger", "경고"],
] as const;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a: string, b: string) => {
  const la = lum(cssColorToRgb(a));
  const lb = lum(cssColorToRgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

function Panel({ theme }: { theme: "light" | "dark" }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const { accent } = useTheme();
  const ref = (el: HTMLDivElement | null) => {
    if (!el) return;
    const cs = getComputedStyle(el);
    const next = Object.fromEntries(TOKENS.map(([t]) => [t, cs.getPropertyValue(t).trim()]));
    if (JSON.stringify(next) !== JSON.stringify(vals)) setVals(next);
  };
  useEffect(() => setVals({}), [accent]);
  return (
    <div ref={ref} data-theme={theme} className="flex-1 rounded-3xl border border-line bg-bg p-6 text-text">
      <p className="mb-5 text-xs uppercase tracking-[0.2em] text-faint">{theme === "light" ? "밝은 테마" : "어두운 테마"}</p>
      <div className="grid grid-cols-4 gap-3">
        {TOKENS.map(([t, label]) => (
          <div key={t}>
            <div className="aspect-square rounded-2xl border border-line" style={{ background: `var(${t})` }} />
            <p className="mt-1.5 text-xs">{label}</p>
            <p className="text-[10px] text-faint">
              {vals[t] && vals["--bg"] && !["--bg", "--surface", "--line"].includes(t) ? `대비 ${contrast(vals[t]!, vals["--bg"]!).toFixed(1)}:1` : t}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-surface p-5">
        <p className="text-base font-medium">사진 위주, UI는 조용하게</p>
        <p className="text-sm leading-relaxed text-muted">
          본문은 순수 검정·흰색 대신 따뜻한 무채색을 써서 눈부심을 줄였어요. 강조색은 주요 버튼과 선택 상태에만 써요.
        </p>
        <Progress value={0.62} />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="upload" size="sm">올리기</Button>
          <Button size="sm" icon="folder">폴더 연결</Button>
          <Button size="sm" variant="ghost">취소</Button>
          <Button size="sm" variant="danger" icon="trash">삭제</Button>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-faint"><Icon name="laptop" size={14} /> 이 PC에만 있음 · 백업 안 됨</p>
      </div>
    </div>
  );
}

export function DesignPage() {
  const { accent } = useTheme();
  return (
    <div className="pt-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-light tracking-tight">색상 체계</h1>
          <p className="mt-1 text-sm text-faint">무채색 6단계 + 강조색 1개. 대비는 WCAG 기준으로 계산했어요 (본문 ≥ 7:1, 나머지 글자색 ≥ 4.5:1).</p>
        </div>
        <div className="ml-auto">
          <Segmented<Accent>
            value={accent}
            onChange={setAccent}
            options={[
              { value: "clay", label: "클레이" },
              { value: "sage", label: "세이지" },
              { value: "slate", label: "슬레이트" },
            ]}
          />
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-6 lg:flex-row">
        <Panel theme="light" />
        <Panel theme="dark" />
      </div>
    </div>
  );
}
