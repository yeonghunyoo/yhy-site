import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "../components/icons";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button } from "../components/ui";
import { useMe } from "../lib/queries";
import { canUseWebGL, isLowEnd, prefersReducedMotion } from "../three/support";

const LandingField = lazy(() => import("../three/LandingField"));

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "laptop", title: "PC 사진은 그대로", body: "폴더를 연결하면 업로드 없이 바로 모아 봐요. 원본은 PC를 떠나지 않아요." },
  { icon: "users", title: "가족과 함께 쌓기", body: "초대 링크 하나로 모두가 같은 앨범에 사진을 올리고, 새 사진은 바로 알려줘요." },
  { icon: "layers", title: "중복은 알아서", body: "카톡으로 돌고 돈 같은 사진을 찾아 가장 선명한 한 장만 남겨요." },
];

export function LandingPage() {
  const me = useMe();
  const gl = useMemo(() => canUseWebGL(), []);
  const motion = useMemo(() => !prefersReducedMotion(), []);
  const low = useMemo(() => isLowEnd(), []);

  return (
    <div className="min-h-dvh">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between px-5">
        <span className="text-lg font-light tracking-[0.25em]">nuvo</span>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link to={me.signedIn ? "/library" : "/signin"}>
            <Button size="sm" variant="ghost">{me.signedIn ? "내 라이브러리" : "로그인"}</Button>
          </Link>
        </div>
      </header>

      <section className="relative flex h-dvh min-h-[560px] flex-col items-center justify-end overflow-hidden pb-[12vh] text-center">
        <div className="absolute inset-0" aria-hidden="true">
          {gl ? (
            <Suspense fallback={null}>
              <LandingField motion={motion} lowEnd={low} />
            </Suspense>
          ) : (
            <div className="mx-auto mt-[18vh] grid w-[min(80vw,520px)] grid-cols-3 gap-3 opacity-40">
              {Array.from({ length: 6 }, (_, i) => <div key={i} className="aspect-[4/3] rounded-xl border border-line bg-surface" />)}
            </div>
          )}
        </div>
        <div className="relative px-6">
          <h1 className="text-[clamp(2rem,6vw,3.6rem)] font-light leading-tight tracking-tight">
            흩어진 사진을, <span className="text-accent">한곳에.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            PC, 클라우드, 가족의 휴대폰에 흩어진 사진을 모으고 함께 쌓아가세요.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={me.signedIn ? "/library" : "/signin"}>
              <Button variant="primary" className="h-11 px-6">{me.signedIn ? "라이브러리로" : "시작하기"}</Button>
            </Link>
            {!me.signedIn && (
              <Link to="/library">
                <Button className="h-11 px-6" icon="laptop">로그인 없이 내 PC 사진 보기</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-24 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title}>
            <span className="flex size-10 items-center justify-center rounded-full bg-surface text-accent"><Icon name={f.icon} /></span>
            <h2 className="mt-4 text-base font-medium">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-faint">
        nuvo · 사진은 비공개가 기본이에요. 초대받은 사람만 볼 수 있어요.
      </footer>
    </div>
  );
}
