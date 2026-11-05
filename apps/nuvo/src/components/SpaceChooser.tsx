import type { SpaceSummary } from "@nuvo/shared";
import { useState } from "react";
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
  /** shareLocation: "위치도 공유"를 골랐는지 (기본 false, docs/decisions.md D-016) */
  onChoose: (s: SpaceSummary, shareLocation: boolean) => void;
}) {
  const writable = spaces.filter((s) => s.role !== "viewer");
  const [shareLocation, setShareLocation] = useState(false);
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
                  onChoose(s, shareLocation);
                  setShareLocation(false);
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
      {writable.length > 0 && (
        <label className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-xs text-muted">
          <input type="checkbox" className="mt-0.5" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} data-testid="share-location" />
          <span>
            찍은 장소도 함께 보내기
            <span className="block text-faint">
              끄면 Space 화면에 장소가 나오지 않아요. 내 사진함에는 그대로 남아요. 원본 파일 안의 위치 정보는 지우지 않아서, 원본을 받으면 볼 수 있어요.
            </span>
          </span>
        </label>
      )}
    </Dialog>
  );
}
