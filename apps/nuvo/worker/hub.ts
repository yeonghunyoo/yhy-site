import { DurableObject } from "cloudflare:workers";

/** Worker가 권한을 확인한 뒤 붙여 주는 사용자 id 헤더 (클라이언트 값은 Worker가 덮어쓴다) */
export const HUB_USER_HEADER = "x-nuvo-user";
/** 멤버에서 빠져서 끊은 연결의 종료 코드. 클라이언트는 이 코드를 받으면 다시 연결하지 않는다. */
export const HUB_KICK_CODE = 4403;

/**
 * Space별 실시간 허브. 멤버 브라우저가 WebSocket으로 붙고,
 * API가 /broadcast로 이벤트를 보내면 모두에게 전달한다.
 * Hibernation API 사용 → 연결이 열려 있어도 유휴 시간에는 과금되지 않는다.
 * 연결마다 사용자 id 태그를 붙여서, 내보내기·나가기·Space 삭제 때 해당 연결을 끊는다.
 */
export class SpaceHub extends DurableObject<Env> {
  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get("upgrade") === "websocket") {
      const userId = req.headers.get(HUB_USER_HEADER);
      if (!userId) return new Response("forbidden", { status: 403 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1], [userId]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const path = new URL(req.url).pathname;
    if (req.method === "POST" && path === "/broadcast") {
      const msg = await req.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
          /* 끊긴 연결은 무시 */
        }
      }
      return new Response("ok");
    }
    if (req.method === "POST" && path === "/kick") {
      const { userId } = (await req.json()) as { userId: string | null };
      for (const ws of userId ? this.ctx.getWebSockets(userId) : this.ctx.getWebSockets()) {
        try {
          // 종료 직전에 알림을 한 번 보낸다. 받은 메시지가 없는 연결은 로컬 런타임(workerd)에서
          // close()만으로는 닫히지 않는 경우가 있어서, 클라이언트도 이 메시지를 받으면 스스로 닫는다.
          ws.send(JSON.stringify({ type: "removed" }));
          ws.close(HUB_KICK_CODE, "removed");
        } catch {
          /* 이미 닫힘 */
        }
      }
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  }

  override webSocketMessage(ws: WebSocket, msg: string | ArrayBuffer) {
    if (msg === "ping") ws.send("pong");
  }

  override webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, "bye");
    } catch {
      /* 이미 닫힘 */
    }
  }
}
