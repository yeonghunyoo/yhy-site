import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button, Field, inputClass, Spinner } from "../components/ui";
import { authErrorMessage, requestPasswordReset, sendVerificationEmail, signIn, signUp } from "../lib/auth";

const TITLE = { in: "다시 오셨네요", up: "nuvo 시작하기", forgot: "비밀번호 재설정", check: "메일함을 확인해 주세요" } as const;
import { useAuthConfig } from "../lib/queries";

type Mode = "in" | "up" | "forgot" | "check";

export function SignInPage() {
  const cfg = useAuthConfig();
  const [params] = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/library";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("in");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get("reset") === "1" ? "비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요." : null);
  const [busy, setBusy] = useState(false);
  // 인증 메일의 링크를 누르면 /verified 로 돌아온다 (거기서 next 로 이동)
  const verifyCallback = `/verified?next=${encodeURIComponent(next)}`;

  const go = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "forgot") {
        await requestPasswordReset({ email: form.email, redirectTo: "/reset-password" });
        // 가입 여부와 상관없이 같은 안내 (이메일 존재 여부를 알려주지 않음)
        setMode("check");
        setNotice("가입된 이메일이면 비밀번호 재설정 링크를 보냈어요.");
        return;
      }
      if (mode === "up") {
        const r = await signUp.email({
          name: form.name.trim() || form.email.split("@")[0]!,
          email: form.email,
          password: form.password,
          callbackURL: verifyCallback,
        });
        if (r.error) return setError(authErrorMessage(r.error));
        setMode("check");
        setNotice("인증 메일을 보냈어요. 메일의 버튼을 누르면 가입이 끝나요.");
        return;
      }
      const r = await signIn.email({ email: form.email, password: form.password, callbackURL: verifyCallback });
      if (r.error) {
        if (r.error.code === "EMAIL_NOT_VERIFIED") {
          setMode("check");
          setNotice("이메일 인증이 아직 안 됐어요. 인증 메일을 다시 보냈어요.");
        } else setError(authErrorMessage(r.error));
        return;
      }
      await qc.invalidateQueries();
      navigate(next, { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    const r = await sendVerificationEmail({ email: form.email, callbackURL: verifyCallback });
    setBusy(false);
    setNotice(r.error ? authErrorMessage(r.error) : "인증 메일을 다시 보냈어요.");
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
          <h1 className="text-2xl font-light tracking-tight">{TITLE[mode]}</h1>
          <p className="mt-2 text-sm text-muted">흩어진 사진을 모으고, 가족과 함께 쌓아가세요.</p>

          {cfg.isPending ? (
            <div className="py-10"><Spinner /></div>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              {(mode === "in" || mode === "up") && cfg.data?.kakao && (
                <button onClick={() => social("kakao")} className="h-11 rounded-xl bg-[#FEE500] text-sm font-medium text-[#191600] hover:opacity-90">
                  카카오로 계속하기
                </button>
              )}
              {(mode === "in" || mode === "up") && cfg.data?.google && (
                <Button className="h-11 rounded-xl" onClick={() => social("google")}>Google로 계속하기</Button>
              )}
              {!cfg.data?.kakao && !cfg.data?.google && !cfg.data?.password && (
                <p className="text-sm text-muted">지금은 로그인을 준비하고 있어요. 조금만 기다려 주세요.</p>
              )}

              {cfg.data?.password && (
                <>
                  {(mode === "in" || mode === "up") && (cfg.data.kakao || cfg.data.google) && (
                    <div className="my-2 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />또는<span className="h-px flex-1 bg-line" /></div>
                  )}
                  {mode === "check" ? (
                    <div className="flex flex-col gap-3" data-testid="check-email">
                      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm leading-relaxed">
                        {notice}
                        <br />
                        <span className="text-muted">{form.email}</span>
                      </p>
                      <p className="text-xs text-faint">메일이 안 보이면 스팸함을 확인해 주세요. 링크는 1시간 동안 유효해요.</p>
                      {notice?.includes("인증") && (
                        <Button className="h-11 rounded-xl" onClick={resend} disabled={busy}>인증 메일 다시 보내기</Button>
                      )}
                      <button className="text-center text-xs text-muted hover:text-text" onClick={() => go("in")}>로그인으로 돌아가기</button>
                    </div>
                  ) : (
                    <form className="flex flex-col gap-3" onSubmit={submit}>
                      {mode === "up" && (
                        <Field label="이름">
                          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="가족에게 보일 이름" autoComplete="nickname" maxLength={40} />
                        </Field>
                      )}
                      <Field label="이메일">
                        <input className={inputClass} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
                      </Field>
                      {mode !== "forgot" && (
                        <Field label="비밀번호">
                          <input className={inputClass} type="password" required minLength={8} maxLength={128} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete={mode === "up" ? "new-password" : "current-password"} />
                        </Field>
                      )}
                      {mode === "up" && <p className="text-xs text-faint">비밀번호는 8자 이상. 가입하면 인증 메일을 보내드려요.</p>}
                      {notice && <p className="text-sm text-muted" role="status">{notice}</p>}
                      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
                      <Button variant="primary" type="submit" className="mt-1 h-11 rounded-xl" disabled={busy}>
                        {mode === "in" ? "로그인" : mode === "up" ? "가입하기" : "재설정 링크 받기"}
                      </Button>
                    </form>
                  )}
                  {mode !== "check" && (
                    <div className="flex justify-center gap-4 text-xs text-muted">
                      {mode !== "in" && <button className="hover:text-text" onClick={() => go("in")}>로그인</button>}
                      {mode !== "up" && <button className="hover:text-text" onClick={() => go("up")}>처음이신가요? 가입하기</button>}
                      {mode === "in" && <button className="hover:text-text" onClick={() => go("forgot")}>비밀번호를 잊었어요</button>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
