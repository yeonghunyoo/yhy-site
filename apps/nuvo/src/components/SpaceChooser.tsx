import type { SpaceSummary } from "@nuvo/shared";
import { Link } from "react-router";
import { Icon } from "./icons";
import { Dialog } from "./ui";

export function SpaceChooser({
  open,
  onClose,
  spaces,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  spaces: SpaceSummary[];
  onChoose: (s: SpaceSummary) => void;
}) {
  const writable = spaces.filter((s) => s.role !== "viewer");
  return (
    <Dialog open={open} onClose={onClose} title="어느 Space에 추가할까요?">
      {writable.length === 0 ? (
        <p className="text-sm text-muted">
          사진을 올릴 수 있는 Space가 없어요. <Link to="/spaces" className="text-accent">Space 만들기</Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {writable.map((s) => (
            <li key={s.id}>
              <button
                className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-bg"
                onClick={() => {
                  onChoose(s);
                  onClose();
                }}
              >
                <span className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-bg text-faint">
                  {s.cover ? <img src={s.cover} alt="" className="size-full object-cover" /> : <Icon name="users" />}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-faint">
                    {s.memberCount}명 · {s.assetCount}장
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
