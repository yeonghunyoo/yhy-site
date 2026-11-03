import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button, Field, inputClass, Spinner } from "../components/ui";
import { signIn, signUp } from "../lib/auth";
import { useAuthConfig } from "../lib/queries";

export function SignInPage() {
  const cfg = useAuthConfig();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/library";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = async () => {
    await qc.invalidateQueries();
    navigate(next, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r =
      mode === "up"
        ? await signUp.email({ name: form.name || form.email.split("@")[0]!, email: form.email, password: form.password })
        : await signIn.email({ email: form.email, password: form.password });
    setBusy(false);
    if (r.error) setError(r.error.message ?? "로그인에 실패했어요");
    else await done();
  };

  const social = (provider: "google" | "kakao") =>
    void signIn.social({ provider, callbackURL: next });

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-5">
        <Link to="/" className="text-lg font-light tracking-[0.25em]">nuvo</Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-light tracking-tight">{mode === "in" ? "다시 오셨네요" : "nuvo 시작하기"}</h1>
          <p className="mt-2 text-sm text-muted">흩어진 사진을 모으고, 가족과 함께 쌓아가세요.</p>

          {cfg.isPending ? (
            <div className="py-10"><Spinner /></div>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              {cfg.data?.kakao && (
                <button onClick={() => social("kakao")} className="h-11 rounded-xl bg-[#FEE500] text-sm font-medium text-[#191600] hover:opacity-90">
                  카카오로 계속하기
                </button>
              )}
              {cfg.data?.google && (
                <Button className="h-11 rounded-xl" onClick={() => social("google")}>Google로 계속하기</Button>
              )}
              {!cfg.data?.kakao && !cfg.data?.google && !cfg.data?.password && (
                <p className="text-sm text-muted">로그인 방법이 아직 설정되지 않았어요. (개발자 가이드 6·7단계)</p>
              )}

              {cfg.data?.password && (
                <>
                  {(cfg.data.kakao || cfg.data.google) && (
                    <div className="my-2 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />또는<span className="h-px flex-1 bg-line" /></div>
                  )}
                  <form className="flex flex-col gap-3" onSubmit={submit}>
                    {mode === "up" && (
                      <Field label="이름">
                        <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="가족에게 보일 이름" autoComplete="nickname" />
                      </Field>
                    )}
                    <Field label="이메일">
                      <input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                    </Field>
                    <Field label="비밀번호">
                      <input className={inputClass} type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={mode === "up" ? "new-password" : "current-password"} />
                    </Field>
                    {error && <p className="text-sm text-danger" role="alert">{error}</p>}
                    <Button variant="primary" type="submit" className="mt-1 h-11 rounded-xl" disabled={busy}>
                      {mode === "in" ? "로그인" : "가입하기"}
                    </Button>
                  </form>
                  <button className="text-center text-xs text-muted hover:text-text" onClick={() => setMode(mode === "in" ? "up" : "in")}>
                    {mode === "in" ? "처음이신가요? 가입하기" : "이미 계정이 있어요"}
                  </button>
                  <p className="text-center text-[11px] text-faint">이메일 로그인은 개발 환경에서만 켜져 있어요</p>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
