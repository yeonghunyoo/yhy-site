import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router";
import { Icon } from "../components/icons";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button } from "../components/ui";
import { useConfig, useMe } from "../lib/queries";
import { canUseWebGL, isLowEnd, prefersReducedMotion } from "../three/support";
import { LANDING } from "./landing-copy";

const LandingField = lazy(() => import("../three/LandingField"));

export function LandingPage() {
  const me = useMe();
  const config = useConfig();
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
            <Button size="sm" variant="ghost">{me.signedIn ? "내 라이브러리" : LANDING.cta.signIn}</Button>
          </Link>
        </div>
      </header>

      <main>
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
            {LANDING.heading.lead} <span className="text-accent">{LANDING.heading.accent}</span>
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            {LANDING.lead}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to={me.signedIn ? "/library" : "/signin"}>
              <Button variant="primary" className="h-11 px-6">{me.signedIn ? "라이브러리로" : LANDING.cta.start}</Button>
            </Link>
            {!me.signedIn && (
              <Link to="/library">
                <Button className="h-11 px-6" icon="laptop">{LANDING.cta.localOnly}</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-24 sm:grid-cols-3">
        {LANDING.features.map((f) => (
          <div key={f.title}>
            <span className="flex size-10 items-center justify-center rounded-full bg-surface text-accent"><Icon name={f.icon} /></span>
            <h2 className="mt-4 text-base font-medium">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>
      </main>

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-faint">
        {LANDING.footer}
        {config.data?.supportEmail && (
          <>
            {" · "}
            <a className="underline underline-offset-2" href={`mailto:${config.data.supportEmail}`}>문의 {config.data.supportEmail}</a>
          </>
        )}
      </footer>
    </div>
  );
}
