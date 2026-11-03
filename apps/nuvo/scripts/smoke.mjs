// API 스모크 테스트: 개발 서버(pnpm dev)가 떠 있는 상태에서 `pnpm smoke`
// 가입 → 업로드 → 타임라인 → 미디어 → Space → 초대 → 두 번째 사용자 참여 → 권한 → 삭제
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
};

function client() {
  const jar = new Map();
  const call = async function call(path, { method = "GET", json, body, headers = {} } = {}) {
    const h = { origin: BASE, ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (json) {
      h["content-type"] = "application/json";
      body = JSON.stringify(json);
    }
    const res = await fetch(BASE + path, { method, headers: h, body, redirect: "manual" });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, res };
  };
  call.cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  return call;
}

async function signUp(call, name) {
  const email = `u${Date.now()}${Math.floor(Math.random() * 1e4)}@test.nuvo`;
  const r = await call("/api/auth/sign-up/email", { method: "POST", json: { email, password: "password1234", name } });
  ok(r.status === 200, `${name} 가입 (${r.status})`);
  return email;
}

function fakeImage() {
  const bytes = randomBytes(2048);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function upload(call, libraryId, img, takenAt = Date.now()) {
  const prep = await call("/api/uploads/prepare", {
    method: "POST",
    json: { libraryId, files: [{ sha256: img.sha256, size: img.bytes.length, mime: "image/jpeg" }] },
  });
  const action = prep.data.results?.[0]?.action;
  let receipt;
  if (action === "upload") {
    const put = await call(`/api/uploads/blob/${img.sha256}?libraryId=${libraryId}`, {
      method: "PUT", body: img.bytes, headers: { "content-type": "image/jpeg" },
    });
    receipt = put.data.receipt;
    for (const size of [512, 2048]) {
      await call(`/api/uploads/blob/${img.sha256}/thumb/${size}?receipt=${encodeURIComponent(receipt)}`, {
        method: "PUT", body: randomBytes(100), headers: { "content-type": "image/webp" },
      });
    }
  }
  const done = await call("/api/uploads/complete", {
    method: "POST",
    json: {
      libraryId,
      items: [{
        sha256: img.sha256, size: img.bytes.length, mime: "image/jpeg", width: 400, height: 300,
        filename: "test.jpg", takenAt, lat: null, lng: null, camera: null, dhash: "0123456789abcdef", blurhash: null, receipt,
      }],
    },
  });
  return { action, done };
}

const a = client();
const b = client();

ok((await a("/api/health")).data.ok, "health");
ok((await a("/api/health/db")).status === 200, "DB 연결");
ok((await a("/api/me")).status === 401, "비로그인 /me → 401");

await signUp(a, "엄마");
const meA = (await a("/api/me")).data;
ok(meA.personal?.id, "가입 시 개인 라이브러리 자동 생성");

// 업로드
const img = fakeImage();
const up = await upload(a, meA.personal.id, img);
ok(up.action === "upload", "새 사진 → upload");
ok(up.done.status === 200 && up.done.data.assets?.length === 1, `업로드 완료 (${up.done.status} ${JSON.stringify(up.done.data).slice(0, 120)})`);
const again = await upload(a, meA.personal.id, img);
ok(again.action === "skip", "같은 사진 다시 → skip (중복 업로드 안 함)");

// 타임라인 + 미디어
const tl = (await a(`/api/libraries/${meA.personal.id}/assets`)).data;
ok(tl.assets?.length === 1, "타임라인에 1장");
const asset = tl.assets[0];
const orig = await fetch(BASE + asset.urls.original);
const origBytes = Buffer.from(await orig.arrayBuffer());
ok(orig.status === 200 && origBytes.equals(img.bytes), "서명 URL로 원본 받기 (내용 일치)");
ok(orig.headers.get("cache-control")?.startsWith("private"), "미디어 응답은 private 캐시");
const tampered = asset.urls.original.replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAA");
ok((await fetch(BASE + tampered)).status === 403, "변조된 서명 → 403");

// 해시 위조 업로드 차단
const fake = fakeImage();
const bad = await a(`/api/uploads/blob/${fake.sha256}?libraryId=${meA.personal.id}`, {
  method: "PUT", body: randomBytes(2048), headers: { "content-type": "image/jpeg" },
});
ok(bad.status === 400, `해시와 내용이 다른 업로드 거부 (${bad.status})`);

// 이미지가 아닌 형식(HTML)은 원본으로 올릴 수 없다 (같은 도메인 XSS 방지)
const html = Buffer.from("<script>alert(1)</script>");
const htmlSha = createHash("sha256").update(html).digest("hex");
const xss = await a(`/api/uploads/blob/${htmlSha}?libraryId=${meA.personal.id}`, {
  method: "PUT", body: html, headers: { "content-type": "text/html" },
});
ok(xss.status === 415, `HTML 업로드 거부 (${xss.status})`);
ok(orig.headers.get("content-security-policy")?.includes("sandbox"), "미디어 응답에 CSP sandbox");

// Space
const sp = await a("/api/spaces", { method: "POST", json: { name: "우리 가족" } });
ok(sp.status === 201, "Space 생성");
const space = sp.data;
const copy = await a("/api/assets/copy", { method: "POST", json: { assetIds: [asset.id], targetLibraryId: space.libraryId } });
ok(copy.data.added === 1, "내 사진 → Space로 보내기 (복사 없이 참조)");

const inv = await a(`/api/spaces/${space.id}/invites`, { method: "POST", json: { role: "editor" } });
ok(inv.status === 201, "초대 링크 생성");
const token = inv.data.token;

await signUp(b, "동생");
const meB = (await b("/api/me")).data;
ok((await b(`/api/spaces/${space.id}`)).status === 404, "초대 전에는 Space 접근 불가");
// B가 A의 사진 해시를 알아도 link 불가 (존재 여부 비노출)
const probe = await b("/api/uploads/prepare", {
  method: "POST", json: { libraryId: meB.personal.id, files: [{ sha256: img.sha256, size: img.bytes.length, mime: "image/jpeg" }] },
});
ok(probe.data.results?.[0]?.action === "upload", "남의 사진 해시로는 link 안 됨 (존재 여부 비노출)");
const steal = await b("/api/uploads/complete", {
  method: "POST",
  json: { libraryId: meB.personal.id, items: [{ sha256: img.sha256, size: img.bytes.length, mime: "image/jpeg", width: 1, height: 1, filename: null, takenAt: Date.now(), lat: null, lng: null, camera: null, dhash: null, blurhash: null }] },
});
ok(steal.status === 403, `영수증 없이 남의 Blob 등록 시도 → 403 (${steal.status})`);

const preview = await b(`/api/invites/${token}`);
ok(preview.data.spaceName === "우리 가족" && preview.data.valid, "초대 미리보기");
const acc = await b(`/api/invites/${token}/accept`, { method: "POST" });
ok(acc.data.joined === true, "초대 수락");
const spB = (await b(`/api/spaces/${space.id}`)).data;
ok(spB.members?.length === 2 && spB.myRole === "editor", "멤버 2명, 동생은 참여자");

// 함께 업로드
const imgB = fakeImage();
const upB = await upload(b, space.libraryId, imgB, Date.now() - 86400_000);
ok(upB.done.data.assets?.length === 1, "동생이 Space에 업로드");
const spTl = (await a(`/api/libraries/${space.libraryId}/assets`)).data;
ok(spTl.assets?.length === 2, "엄마도 Space 타임라인에서 2장 확인");
const feed = (await a(`/api/spaces/${space.id}/activities`)).data;
ok(feed.activities?.some((x) => x.type === "assets_added" && x.actorName === "동생"), "피드: 동생이 사진 추가");
ok(feed.activities?.some((x) => x.type === "member_joined"), "피드: 멤버 참여");

// 권한: 동생은 엄마가 올린 사진 삭제 불가
const momAssetInSpace = spTl.assets.find((x) => x.uploadedBy === meA.user.id);
const denied = await b("/api/assets/delete", { method: "POST", json: { assetIds: [momAssetInSpace.id] } });
ok(denied.status === 403, "참여자는 남이 올린 사진 삭제 불가");

// 백업 상태 조회
const bs = await b("/api/backup-status", { method: "POST", json: { sha256s: [img.sha256, imgB.sha256, fake.sha256] } });
ok(bs.data.backedUp?.length === 2, "백업 상태: 접근 가능한 사진만 (2개)");

// 썸네일 업로드로 남의 사진 존재 여부를 알 수 없다 (영수증 없으면 무조건 403, 409 같은 단서 없음)
const thumbProbe = await b(`/api/uploads/blob/${img.sha256}/thumb/512`, {
  method: "PUT", body: randomBytes(10), headers: { "content-type": "image/webp" },
});
const thumbProbe2 = await b(`/api/uploads/blob/${fake.sha256}/thumb/512`, {
  method: "PUT", body: randomBytes(10), headers: { "content-type": "image/webp" },
});
ok(thumbProbe.status === 403 && thumbProbe2.status === 403, `영수증 없는 썸네일 → 있는 사진/없는 사진 모두 403 (${thumbProbe.status}, ${thumbProbe2.status})`);

// 잘못된 id 형식은 500이 아니라 404/400
const badIds = await Promise.all([
  a("/api/spaces/not-a-uuid"),
  a("/api/libraries/not-a-uuid/assets"),
  a(`/api/libraries/${meA.personal.id}/assets?cursor=123_abc`),
  a(`/api/uploads/blob/${img.sha256}?libraryId=`, { method: "PUT", body: img.bytes, headers: { "content-type": "image/jpeg" } }),
]);
ok(badIds.map((r) => r.status).join() === "404,404,400,404", `잘못된 id → 404/400 (${badIds.map((r) => r.status).join()})`);

// 지운 사진은 피드 썸네일에서도 빠지고, 마지막 사본이면 저장소에서도 지워진다
const imgC = fakeImage();
const upC = await upload(b, space.libraryId, imgC);
const cAsset = upC.done.data.assets?.[0];
const feedHas = async () =>
  (await a(`/api/spaces/${space.id}/activities`)).data.activities.some((x) => x.data.thumbs.some((t) => t.includes(imgC.sha256)));
ok(cAsset && (await feedHas()), "피드에 방금 올린 사진 썸네일");
await b("/api/assets/delete", { method: "POST", json: { assetIds: [cAsset.id] } });
ok(!(await feedHas()), "지운 사진은 피드 썸네일에서 빠짐");
ok((await fetch(BASE + cAsset.urls.original)).status === 404, "마지막 사본을 지우면 원본도 저장소에서 삭제");

// 역할 권한: 별도 Space에서 관리자 둘(아빠, 삼촌)로 검사
const c = client();
const d = client();
await signUp(c, "아빠");
await signUp(d, "삼촌");
const meC = (await c("/api/me")).data;
const meD = (await d("/api/me")).data;
const s2 = (await a("/api/spaces", { method: "POST", json: { name: "역할 테스트" } })).data;
const inv2 = (await a(`/api/spaces/${s2.id}/invites`, { method: "POST", json: { role: "editor" } })).data;
await c(`/api/invites/${inv2.token}/accept`, { method: "POST" });
await d(`/api/invites/${inv2.token}/accept`, { method: "POST" });
for (const u of [meC, meD]) await a(`/api/spaces/${s2.id}/members/${u.user.id}`, { method: "PATCH", json: { role: "admin" } });
const demote = await c(`/api/spaces/${s2.id}/members/${meD.user.id}`, { method: "PATCH", json: { role: "viewer" } });
const kickAdmin = await c(`/api/spaces/${s2.id}/members/${meD.user.id}`, { method: "DELETE" });
ok(demote.status === 403 && kickAdmin.status === 403, `관리자는 다른 관리자를 강등·내보내기 불가 (${demote.status}, ${kickAdmin.status})`);

// 내보낸 사람의 실시간 연결은 바로 끊기고, 이후 Space 소식은 받지 못한다
const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/api/spaces/${s2.id}/live`, {
  headers: { cookie: c.cookieHeader(), origin: BASE },
});
const got = [];
ws.onmessage = (e) => got.push(JSON.parse(e.data).type);
const opened = await new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false); setTimeout(() => r(false), 5000); });
const kicked = await a(`/api/spaces/${s2.id}/members/${meC.user.id}`, { method: "DELETE" });
await new Promise((r) => setTimeout(r, 500));
await upload(a, s2.libraryId, fakeImage());
await new Promise((r) => setTimeout(r, 1000));
ws.close();
ok(opened && kicked.status === 200 && got[0] === "removed" && !got.includes("assets_changed"),
  `내보낸 멤버의 실시간 연결 종료, 이후 소식 차단 (받은 것: ${got.join(",") || "없음"})`);

// 동시에 두 번 소유권 이전 → 소유자는 정확히 한 명
const inv3 = (await a(`/api/spaces/${s2.id}/invites`, { method: "POST", json: { role: "editor" } })).data;
await c(`/api/invites/${inv3.token}/accept`, { method: "POST" });
await Promise.all([meC, meD].map((u) => a(`/api/spaces/${s2.id}/members/${u.user.id}`, { method: "PATCH", json: { role: "owner" } })));
const s2Members = (await d(`/api/spaces/${s2.id}`)).data.members;
const owners = s2Members.filter((m) => m.role === "owner");
ok(owners.length === 1, `동시 소유권 이전 후 소유자 1명 (${s2Members.map((m) => `${m.name}:${m.role}`).join(", ")})`);
const ownerCall = owners[0]?.id === meC.user.id ? c : d;
ok((await ownerCall(`/api/spaces/${s2.id}`, { method: "DELETE" })).status === 200, "새 소유자가 Space 삭제");
await c("/api/me", { method: "DELETE" });
await d("/api/me", { method: "DELETE" });

// 삭제와 Blob 정리: 개인 라이브러리에서 지워도 Space 사본은 남는다
const delAsset = await a("/api/assets/delete", { method: "POST", json: { assetIds: [asset.id] } });
ok(delAsset.data.removed === 1, "개인 라이브러리에서 삭제");
const stillThere = await fetch(BASE + momAssetInSpace.urls.original);
ok(stillThere.status === 200, "Space의 같은 사진은 그대로 (Blob 참조 유지)");

// 용량 반영
const meA2 = (await a("/api/me")).data;
ok(meA2.personal.usedBytes === 0, `개인 사용량 0으로 복귀 (${meA2.personal.usedBytes})`);
ok(meA2.spaces?.[0]?.assetCount === 2, "Space 사진 수 2");

// 소유자는 그냥 못 나감
const leave = await a(`/api/spaces/${space.id}/members/${meA.user.id}`, { method: "DELETE" });
ok(leave.status === 400, "소유자는 소유권 이전 없이 나갈 수 없음");

// 계정 삭제: 다른 멤버가 있는 Space의 소유자는 먼저 소유권을 넘겨야 한다
const blocked = await a("/api/me", { method: "DELETE" });
ok(blocked.status === 409, `공유 Space 소유자는 바로 탈퇴 불가 (${blocked.status})`);
const delB = await b("/api/me", { method: "DELETE" });
ok(delB.status === 200, "동생 계정 삭제");
ok((await b("/api/me")).status === 401, "삭제 후 세션 무효");
const spAfter = (await a(`/api/spaces/${space.id}`)).data;
ok(spAfter.members?.length === 1, "Space 멤버에서 빠짐");
const spTlAfter = (await a(`/api/libraries/${space.libraryId}/assets`)).data;
ok(spTlAfter.assets?.length === 2, "탈퇴한 멤버가 올린 사진은 Space에 남음");
const delA = await a("/api/me", { method: "DELETE" });
ok(delA.status === 200, "엄마 계정 삭제 (혼자 남은 Space는 함께 삭제)");

console.log(failures ? `\n${failures}개 실패` : "\n모두 통과");
process.exit(failures ? 1 : 0);
