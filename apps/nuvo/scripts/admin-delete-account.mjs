// 운영자용 계정 삭제 (docs/developer-guide.md "계정 삭제 요청").
// 로그인할 수 없는 사람의 삭제 요청을, 그 이메일로 본인 확인을 마친 뒤 처리한다.
//
//   ADMIN_TOKEN="$(cat apps/nuvo/.admin-token.local)" BASE_URL=https://도메인 node apps/nuvo/scripts/admin-delete-account.mjs someone@example.com
//     → 미리보기만 (지워질 사진 수, 함께 지워질 Space, 소유권이 넘어갈 Space)
//   ... --yes              → 실제로 지움
//   ... --yes --transfer   → 다른 멤버가 있는 Space의 소유권을 넘기고 지움 (없으면 409)
//
// 토큰은 채팅·커밋에 남기지 않는다. 운영 값은 wrangler secret(ADMIN_TOKEN)과 git 제외 파일(.admin-token.local)에만.

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const yes = args.includes("--yes");
const transferShared = args.includes("--transfer");
const base = process.env.BASE_URL ?? "http://localhost:5173";
const token = process.env.ADMIN_TOKEN;
if (!email || !token) {
  console.error("사용: ADMIN_TOKEN=... [BASE_URL=...] node admin-delete-account.mjs <이메일> [--yes] [--transfer]");
  process.exit(2);
}

const call = (dryRun) =>
  fetch(`${base}/api/admin/delete-account`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, dryRun, transferShared }),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const show = (p) => {
  console.log(`사용자 id: ${p.userId}`);
  console.log(`내 사진함 사진: ${p.personalAssets}장 (지워짐)`);
  console.log(`함께 지워질 Space: ${p.deletedSpaces.map((s) => s.name).join(", ") || "없음"}`);
  for (const s of p.sharedSpaces) console.log(`공유 Space ‘${s.name}’: 소유권 → ${s.newOwner ? s.newOwner.name : "넘길 사람 없음"}`);
  console.log(`멤버로 있던 Space: ${p.joinedSpaces}곳 (올린 사진은 남음)`);
};

const preview = await call(true);
if (preview.status === 404) {
  console.error(preview.data.found === false ? "그 이메일로 가입한 계정이 없어요" : "관리 경로가 꺼져 있거나 토큰이 맞지 않아요");
  process.exit(1);
}
if (preview.status !== 200) {
  console.error(`실패 (${preview.status})`, preview.data);
  process.exit(1);
}
console.log(`[미리보기] ${email} (${preview.data.name})`);
show(preview.data.plan);
if (!yes) {
  console.log("\n지우려면 --yes를 붙여 다시 실행하세요.");
  process.exit(0);
}
if (preview.data.plan.sharedSpaces.length && !transferShared) {
  console.error("\n다른 멤버가 있는 Space의 소유자예요. 소유권을 넘기려면 --transfer를 붙이세요.");
  process.exit(1);
}
const done = await call(false);
console.log(done.status === 200 ? "\n삭제했어요." : `\n실패 (${done.status}) ${JSON.stringify(done.data)}`);
process.exit(done.status === 200 ? 0 : 1);
