import { useConfig } from "../lib/queries";
import { closeSubscribePrompt, useSubscribePrompt } from "../lib/subscribe-prompt";
import { Button, Dialog } from "./ui";

/**
 * "앱에서 구독" 안내 (docs/work-plan.md ⑧). 웹에는 결제 화면이 없다 — 스토어 링크만 보여준다(docs/decisions.md D-010).
 * 웹은 Apple·Google 규칙 밖이라 안내 문구는 자유롭게 쓸 수 있다.
 */
export function SubscribePrompt() {
  const reason = useSubscribePrompt();
  const config = useConfig();
  const app = config.data?.appStoreUrl;
  const play = config.data?.playStoreUrl;
  const support = config.data?.supportEmail;
  return (
    <Dialog open={!!reason} onClose={closeSubscribePrompt} title={reason?.ownerExpired ? "지금은 올릴 수 없어요" : "nuvo 구독"}>
      <div className="flex flex-col gap-4 text-sm" data-testid="subscribe-prompt">
        {reason?.ownerExpired ? (
          <p className="leading-relaxed text-muted">
            이 Space를 만든 분의 구독이 끝나서 새 사진을 올릴 수 없어요. 지금까지의 사진은 그대로 볼 수 있어요. Space 소유자에게 알려 주세요.
          </p>
        ) : (
          <>
            <p className="leading-relaxed text-muted">
              구독하면 사진을 nuvo에 백업하고(10GB), 가족 Space를 만들어 초대할 수 있어요. 초대받은 가족은 구독 없이 함께 보고 올려요.
            </p>
            <p className="leading-relaxed text-muted">구독은 nuvo 앱에서 할 수 있어요. 앱에서 구독하면 이 웹에서도 바로 쓸 수 있어요.</p>
            {app || play ? (
              <div className="flex flex-wrap gap-2">
                {app && (
                  <a href={app} target="_blank" rel="noreferrer">
                    <Button variant="primary">App Store</Button>
                  </a>
                )}
                {play && (
                  <a href={play} target="_blank" rel="noreferrer">
                    <Button variant="primary">Google Play</Button>
                  </a>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-surface px-3 py-2 text-xs text-faint">
                앱은 준비 중이에요.
                {support && (
                  <>
                    {" "}
                    먼저 써 보고 싶다면 <a className="underline" href={`mailto:${support}`}>{support}</a>로 알려 주세요.
                  </>
                )}
              </p>
            )}
          </>
        )}
        <Button variant="ghost" onClick={closeSubscribePrompt}>닫기</Button>
      </div>
    </Dialog>
  );
}
