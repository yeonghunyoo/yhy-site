import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { useConfig, useMe } from "../lib/queries";
import { toast, toastError } from "../lib/toast";

/**
 * 계정 삭제 안내·요청 (docs/work-plan.md ⑦).
 * Google Play는 앱을 지운 사람도 앱 밖에서 삭제를 요청할 수 있는 웹 페이지를 요구한다 — 스토어 등록정보에 이 주소(/account/delete)를 넣는다.
 * 로그인되어 있으면 여기서 바로 지우고, 로그인할 수 없으면 요청을 남긴다.
 */
export function AccountDeletePage() {
  const me = useMe();
  const config = useConfig();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const del = useMutation({
    mutationFn: () => unwrap(api.me.$delete()),
    onSuccess: () => {
      qc.clear();
      toast("계정을 삭제했어요");
      navigate("/");
    },
    onError: toastError,
  });
  const request = useMutation({
    mutationFn: () => unwrap(api["account-deletion-requests"].$post({ json: { email, note: note.trim() || undefined } })),
    onSuccess: () => setSent(true),
    onError: toastError,
  });

  return (
    <div className="mx-auto max-w-xl py-10" data-testid="account-delete">
      <h1 className="text-2xl font-light tracking-tight">nuvo 계정 삭제</h1>
      <p className="mt-2 text-sm text-muted">nuvo(가족 사진 서비스) 계정과 데이터를 지우는 방법이에요.</p>

      <section className="mt-8 flex flex-col gap-2 text-sm leading-relaxed">
        <h2 className="font-medium">지워지는 것</h2>
        <ul className="list-disc pl-5 text-muted">
          <li>계정 정보(이름·이메일·프로필 사진)와 로그인 기록</li>
          <li>내 사진함의 사진·동영상과 썸네일, 촬영 정보(시각·위치·카메라)</li>
          <li>나 혼자 있는 Space와 그 사진</li>
        </ul>
        <h2 className="mt-4 font-medium">남는 것</h2>
        <ul className="list-disc pl-5 text-muted">
          <li>다른 가족이 있는 Space에 올린 사진은 그 Space에 남아요 (올린 사람 표시는 "떠난 멤버")</li>
          <li>다른 멤버가 있는 Space의 소유자라면 먼저 소유권을 넘겨야 해요</li>
          <li>신고 기록은 안전을 위해 사진 없이 남을 수 있어요</li>
        </ul>
        <p className="mt-4 text-xs text-faint">
          구독은 계정을 지워도 자동으로 해지되지 않아요. 결제한 App Store·Google Play에서 먼저 해지해 주세요. 이 브라우저에 저장된 PC 폴더 목록·썸네일은 설정에서 폴더 연결을 해제하면 지워져요.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-line p-5">
        {me.sessionPending ? null : me.signedIn ? (
          <>
            <p className="text-sm">
              <span className="font-medium">{me.data?.user.email}</span> 계정으로 로그인되어 있어요.
            </p>
            <Button
              className="mt-4"
              variant="danger"
              disabled={del.isPending}
              onClick={() => confirm("계정을 삭제할까요? 되돌릴 수 없어요.") && del.mutate()}
              data-testid="delete-account"
            >
              계정 삭제
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm">로그인하면 바로 지울 수 있어요.</p>
            <Link to="/signin?next=/account/delete" className="mt-3 inline-block">
              <Button variant="primary">로그인하고 삭제</Button>
            </Link>

            <h2 className="mt-8 text-sm font-medium">로그인할 수 없나요?</h2>
            {sent ? (
              <p className="mt-2 text-sm text-muted" data-testid="deletion-request-sent">
                요청을 받았어요. 입력한 이메일로 본인 확인 메일을 보낸 뒤 처리해요(보통 7일 안).
              </p>
            ) : (
              <form
                className="mt-3 flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (email.trim()) request.mutate();
                }}
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="가입한 이메일"
                  aria-label="가입한 이메일"
                  className="h-10 rounded-xl border border-line bg-bg px-3 text-sm"
                />
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  placeholder="로그인 방법(Google·카카오·이메일)이나 남길 말 (선택)"
                  className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"
                />
                <Button type="submit" disabled={request.isPending}>삭제 요청 보내기</Button>
              </form>
            )}
          </>
        )}
      </section>

      {config.data?.supportEmail && (
        <p className="mt-6 text-xs text-faint">
          문의: <a className="underline" href={`mailto:${config.data.supportEmail}`}>{config.data.supportEmail}</a>
        </p>
      )}
    </div>
  );
}
