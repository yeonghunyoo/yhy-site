import { formatBytes } from "@nuvo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { AddFolderButton } from "../components/LocalFolders";
import { Icon } from "../components/icons";
import { Avatar, Button, IconButton, Progress, Segmented } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { signOut } from "../lib/auth";
import { toastError } from "../lib/toast";
import { initLocal, removeFolder, scanFolder, useLocal } from "../lib/local/store";
import { useMe } from "../lib/queries";
import { setAccent, setThemePref, useTheme, type Accent } from "../theme/theme";

const ACCENTS: { value: Accent; label: string; light: string; dark: string }[] = [
  { value: "clay", label: "클레이", light: "oklch(0.545 0.095 45)", dark: "oklch(0.75 0.075 55)" },
  { value: "sage", label: "세이지", light: "oklch(0.53 0.065 150)", dark: "oklch(0.76 0.055 150)" },
  { value: "slate", label: "슬레이트", light: "oklch(0.52 0.075 255)", dark: "oklch(0.75 0.055 250)" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-7 last:border-0">
      <h2 className="mb-4 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const theme = useTheme();
  const me = useMe();
  const local = useLocal();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => void initLocal(), []);
  const p = me.data?.personal;

  return (
    <div className="mx-auto max-w-xl pt-8">
      <h1 className="text-2xl font-light tracking-tight">설정</h1>

      <Section title="화면">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">테마</span>
            <Segmented
              value={theme.pref}
              onChange={setThemePref}
              options={[
                { value: "system", label: "시스템", icon: "monitor" },
                { value: "light", label: "밝게", icon: "sun" },
                { value: "dark", label: "어둡게", icon: "moon" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">강조색</span>
            <div className="flex gap-2" role="radiogroup">
              {ACCENTS.map((a) => (
                <button
                  key={a.value}
                  role="radio"
                  aria-checked={theme.accent === a.value}
                  onClick={() => setAccent(a.value)}
                  className={`flex h-8 items-center gap-2 rounded-full border px-3 text-xs ${theme.accent === a.value ? "border-text" : "border-line text-muted"}`}
                >
                  <span className="size-3 rounded-full" style={{ background: theme.resolved === "dark" ? a.dark : a.light }} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <Link to="/design" className="text-xs text-faint hover:text-muted">색상 체계 자세히 보기 →</Link>
        </div>
      </Section>

      <Section title="이 PC 폴더">
        {local.folders.length === 0 ? (
          <p className="mb-4 text-sm text-muted">연결된 폴더가 없어요. 폴더를 연결하면 업로드 없이 라이브러리에서 함께 볼 수 있어요.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {local.folders.map((f) => (
              <li key={f.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
                <Icon name="folder" className="text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{f.name}</p>
                  <p className="text-xs text-faint">
                    {f.count.toLocaleString()}장 · {f.mode === "handle" ? "연결됨" : "1회 스캔 (이 브라우저는 폴더를 기억하지 못해요)"}
                  </p>
                </div>
                {f.mode === "handle" && <IconButton icon="refresh" label="다시 읽기" onClick={() => void scanFolder(f.id)} />}
                <IconButton icon="trash" label="연결 해제" onClick={() => confirm(`‘${f.name}’ 연결을 해제할까요? PC의 파일은 그대로 남아요.`) && void removeFolder(f.id)} />
              </li>
            ))}
          </ul>
        )}
        <AddFolderButton />
        <p className="mt-3 text-xs leading-relaxed text-faint">
          폴더 사진의 목록과 썸네일은 이 브라우저에만 저장되고, 서버로 보내지 않아요.
        </p>
      </Section>

      {me.signedIn && me.data && (
        <>
          {p && (
            <Section title="저장 공간">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted">내 라이브러리</span>
                <span>{formatBytes(p.usedBytes)} / {formatBytes(p.quotaBytes)}</span>
              </div>
              <Progress value={p.usedBytes / p.quotaBytes} />
              <p className="mt-3 text-xs text-faint">Space 사진은 각 Space의 공간을 사용해요. 유료 플랜은 준비 중이에요.</p>
            </Section>
          )}
          <Section title="계정">
            <div className="flex items-center gap-3">
              <Avatar name={me.data.user.name} image={me.data.user.image} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{me.data.user.name}</p>
                <p className="truncate text-xs text-faint">{me.data.user.email}</p>
              </div>
              <Button
                size="sm"
                icon="logout"
                onClick={async () => {
                  await signOut();
                  qc.clear();
                  navigate("/");
                }}
              >
                로그아웃
              </Button>
            </div>
            <button
              className="mt-6 text-xs text-faint underline-offset-2 hover:text-danger hover:underline"
              onClick={async () => {
                if (!confirm("계정을 삭제할까요? 내 라이브러리 사진이 모두 지워지고 되돌릴 수 없어요.\n(Space에 올린 사진은 그 Space에 남아요)")) return;
                try {
                  await unwrap(api.me.$delete());
                  qc.clear();
                  navigate("/");
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              계정 삭제
            </button>
          </Section>
        </>
      )}
    </div>
  );
}
