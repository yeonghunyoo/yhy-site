import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Icon } from "../components/icons";
import { Button, Spinner } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { useMe } from "../lib/queries";
import { toastError } from "../lib/toast";
import { ROLE_LABEL } from "@nuvo/shared";

export function InvitePage() {
  const { token = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inv = useQuery({
    queryKey: ["invite", token, me.signedIn],
    queryFn: () => unwrap(api.invites[":token"].$get({ param: { token } })),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => unwrap(api.invites[":token"].accept.$post({ param: { token } })),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      navigate(`/spaces/${r.spaceId}`);
    },
    onError: toastError,
  });

  if (inv.isPending || me.sessionPending) return <div className="flex justify-center py-32"><Spinner /></div>;
  const d = inv.data;

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-24 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-surface text-accent"><Icon name="users" size={24} /></span>
      {!d ? (
        <>
          <h1 className="mt-6 text-xl font-light">초대 링크를 찾을 수 없어요</h1>
          <p className="mt-2 text-sm text-muted">링크가 정확한지 확인하거나, 새 링크를 요청해 주세요.</p>
        </>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted">{d.inviterName ?? "누군가"}님이 초대했어요</p>
          <h1 className="mt-1 text-2xl font-light" data-testid="invite-space">{d.spaceName}</h1>
          <p className="mt-2 text-xs text-faint">{d.memberCount}명 참여 중 · {ROLE_LABEL[d.role]}로 참여</p>
          <div className="mt-8 w-full">
            {d.alreadyMember ? (
              <Button variant="primary" className="w-full" onClick={() => navigate(`/spaces/${d.spaceId}`)}>Space로 가기</Button>
            ) : !d.valid ? (
              <p className="text-sm text-danger">만료된 초대 링크예요. 새 링크를 요청해 주세요.</p>
            ) : me.signedIn ? (
              <Button variant="primary" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>참여하기</Button>
            ) : (
              <Link to={`/signin?next=/invite/${token}`}><Button variant="primary" className="w-full">로그인하고 참여하기</Button></Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
