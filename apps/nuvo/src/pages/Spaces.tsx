import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Icon } from "../components/icons";
import { Button, Dialog, Empty, Field, inputClass, Spinner } from "../components/ui";
import { api, unwrap } from "../lib/api";
import { useMe } from "../lib/queries";
import { toastError } from "../lib/toast";

export function SpacesPage() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const spaces = me.data?.spaces ?? [];

  return (
    <div className="pt-8">
      <div className="flex items-end gap-3">
        <div>
          <h1 className="text-2xl font-light tracking-tight">Space</h1>
          <p className="mt-1 text-sm text-faint">가족·친구와 함께 쌓아가는 사진 보관함</p>
        </div>
        <Button variant="primary" icon="plus" className="ml-auto" onClick={() => setOpen(true)}>
          새 Space
        </Button>
      </div>

      {me.isPending ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : spaces.length === 0 ? (
        <Empty icon="users" title="첫 Space를 만들어 보세요">
          ‘우리 가족’처럼 Space를 만들고 초대 링크를 보내면,
          <br />
          모두가 함께 사진을 올리고 볼 수 있어요.
        </Empty>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {spaces.map((s) => (
            <li key={s.id}>
              <Link to={`/spaces/${s.id}`} className="group block" data-testid="space-card">
                <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-surface">
                  {s.cover ? (
                    <img src={s.cover} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-faint"><Icon name="users" size={28} /></div>
                  )}
                </div>
                <p className="mt-2.5 text-sm font-medium">{s.name}</p>
                <p className="text-xs text-faint">{s.memberCount}명 · {s.assetCount.toLocaleString()}장</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateSpaceDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateSpaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => unwrap(api.spaces.$post({ json: { name } })),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["me"] });
      onClose();
      setName("");
      navigate(`/spaces/${s.id}`);
    },
    onError: toastError,
  });
  return (
    <Dialog open={open} onClose={onClose} title="새 Space">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create.mutate();
        }}
      >
        <Field label="이름">
          <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="우리 가족" maxLength={40} />
        </Field>
        <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending}>만들기</Button>
      </form>
    </Dialog>
  );
}
