import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ThemeToggle } from "../components/ThemeToggle";
import { Button, Field, inputClass, Spinner } from "../components/ui";
import { authErrorMessage, resetPassword } from "../lib/auth";

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-5">
        <Link to="/" className="text-lg font-light tracking-[0.25em]">nuvo</Link>
        <ThemeToggle />
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-light tracking-tight">{title}</h1>
          <div className="mt-8 flex flex-col gap-3">{children}</div>
        </div>
      </main>
    </div>
  );
}

/** 인증 메일 링크를 누른 뒤 돌아오는 곳. 성공하면 이미 로그인된 상태라 바로 다음 화면으로 */
export function VerifiedPage() {
  const [params] = useSearchParams();
  const error = params.get("error");
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/library";
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (error) return;
    void qc.invalidateQueries().then(() => navigate(next, { replace: true }));
  }, [error, next, navigate, qc]);

  if (!error) return <AuthLayout title="인증하는 중"><Spinner /></AuthLayout>;
  return (
    <AuthLayout title="인증 링크를 쓸 수 없어요">
      <p className="text-sm text-muted">링크가 만료됐거나 이미 사용됐어요. 다시 로그인하면 새 인증 메일을 보내드려요.</p>
      <Link to="/signin"><Button variant="primary" className="h-11 w-full rounded-xl">로그인하기</Button></Link>
    </AuthLayout>
  );
}

/** 비밀번호 재설정 메일 링크 → /reset-password?token=... */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const invalid = !token || params.get("error") === "INVALID_TOKEN";
  const navigate = useNavigate();
  const [pw, setPw] = useState({ a: "", b: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (invalid) {
    return (
      <AuthLayout title="재설정 링크를 쓸 수 없어요">
        <p className="text-sm text-muted">링크가 만료됐거나 이미 사용됐어요. 로그인 화면에서 다시 요청해 주세요.</p>
        <Link to="/signin"><Button variant="primary" className="h-11 w-full rounded-xl">로그인 화면으로</Button></Link>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.a !== pw.b) return setError("두 비밀번호가 달라요");
    setBusy(true);
    setError(null);
    const r = await resetPassword({ newPassword: pw.a, token });
    setBusy(false);
    if (r.error) return setError(authErrorMessage(r.error));
    navigate("/signin?reset=1", { replace: true });
  };

  return (
    <AuthLayout title="새 비밀번호">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field label="새 비밀번호">
          <input className={inputClass} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
        </Field>
        <Field label="한 번 더">
          <input className={inputClass} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
        </Field>
        <p className="text-xs text-faint">바꾸면 다른 기기의 로그인도 모두 풀려요.</p>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <Button variant="primary" type="submit" className="mt-1 h-11 rounded-xl" disabled={busy}>비밀번호 바꾸기</Button>
      </form>
    </AuthLayout>
  );
}
