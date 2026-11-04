# Resend 설정 가이드 (메일 열기)

작성 2026-11-01. 도메인을 사고 사이트에 연결한 뒤 진행한다. 이 작업이 끝나면 방문자 이메일 매직링크 로그인, 레터의 내 메일 전달, 어드민 답장 메일이 열린다. 설계는 [02-auth.md](../02-auth.md)·[03-letters.md](../03-letters.md), 비밀값 목록은 [common.md](../common.md).

코드는 이미 준비돼 있다(`src/lib/server/mail.ts`). `RESEND_API_KEY`가 비어 있으면 메일을 로그로만 남기고, 채우면 Resend API로 보낸다. 그래서 이 가이드는 **계정·DNS·비밀값 작업만** 다룬다.

## 도메인 전: 테스트 발신으로 나만 먼저 (선택)

도메인 없이도 Resend 테스트 발신 주소 `onboarding@resend.dev`로 **Resend 가입 이메일 한 곳에만** 보낼 수 있다. 가입 이메일이 `ADMIN_EMAILS`·`LETTER_TO`와 같으므로, 이것만으로 관리자 본인 이메일 로그인과 새 레터 알림 메일이 열린다. 방문자에게는 아직 못 보낸다(Resend 403 → 방문자는 "문제가 생겼어요" 안내, 나에게는 Telegram `⚠️ Resend 실패`). 방문자는 그동안 Google 로그인을 쓴다.

1. 아래 2의 1번(가입)과 3(API 키, 도메인 제한 없이 Sending access)만 한다
2. `.prod.vars`(로컬에서 보려면 `.dev.vars`도)에 넣고 배포 — `.dev.vars`를 바꾸면 `pnpm preview`를 다시 켠다
   ```
   RESEND_API_KEY=re_...
   MAIL_FROM=onboarding@resend.dev
   ```
3. 가입 이메일로 로그인 링크 요청 → `[yhy] 로그인 링크` 도착 → 로그인돼서 원래 자리로 복귀하면 성공

도메인이 생기면 아래 0부터 진행하고 `MAIL_FROM`만 바꾼다. 도메인 제한 키를 새로 만들었다면 `RESEND_API_KEY`도 교체한다.

## 0. 먼저 끝나 있어야 하는 것

- [ ] 도메인 구매, Cloudflare DNS에 연결(네임서버를 Cloudflare로)
- [ ] Worker에 커스텀 도메인 연결, `wrangler.jsonc`의 `BETTER_AUTH_URL`을 새 주소로
- [ ] Google OAuth 리디렉션 URI에 `https://{도메인}/auth/callback/google` 추가

## 1. 발신 주소 정하기

Resend는 루트 도메인 대신 **보내기 전용 하위 도메인**을 권한다. 발송 평판이 분리되고, 나중에 루트 도메인으로 메일함(Google Workspace 등)을 쓰더라도 MX가 겹치지 않는다.

| 안 | 발신 주소(`MAIL_FROM`) | 메모 |
| --- | --- | --- |
| **하위 도메인 (추천)** | `letters@mail.{도메인}` | Resend 권장. 설계 문서의 `letters@{도메인}`을 이 형태로 바꾼다(정하면 `common.md`·`03-letters.md` 갱신) |
| 루트 도메인 | `letters@{도메인}` | 지금 설계 문서 그대로. 루트로 메일함을 쓸 계획이 없을 때 |

받는 메일(Resend Receiving)은 켜지 않는다. 레터는 `LETTER_TO`(내 개인 메일)로 가고 `reply_to`가 방문자라, 답장은 내 메일함에서 바로 하거나 어드민에서 보낸다.

## 2. Resend 계정과 도메인 (직접)

1. [resend.com](https://resend.com/)에 `yeonghun.yoo@gmail.com`으로 가입
2. **Domains → Add Domain** → 1에서 정한 도메인(예: `mail.{도메인}`) 입력
   - 지역(Region)은 방문자가 한국이 많으니 **도쿄(ap-northeast-1)** 를 고른다. 나중에 바꾸려면 도메인을 다시 등록해야 한다
3. DNS 등록 — Cloudflare를 쓰니 **Sign in to Cloudflare**(자동 설정)를 누르면 레코드가 알아서 들어간다. 직접 넣는다면 Cloudflare DNS에 아래 3개(값은 Resend 화면에서 복사):

   | 종류 | 이름 | 값 | 우선순위 | 프록시 |
   | --- | --- | --- | --- | --- |
   | MX | `send.mail` (루트면 `send`) | Resend의 Mail Server 값 | 10 | — |
   | TXT (SPF) | `send.mail` (루트면 `send`) | `v=spf1 include:...` | — | — |
   | TXT (DKIM) | `resend._domainkey.mail` (루트면 `resend._domainkey`) | Resend의 긴 값 | — | **DNS only** |

   이름 칸에는 도메인을 뺀 앞부분만 쓴다. 우선순위 10이 이미 쓰이고 있으면 20.
4. DMARC 추가(권장, 받은편지함 도착률이 좋아진다): Cloudflare DNS에 TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:yeonghun.yoo@gmail.com`. 하위 도메인으로 보내도 루트의 `_dmarc`가 적용된다. 몇 주 문제없으면 `p=quarantine`으로 올린다
5. **Verify DNS Records** → 보통 몇 분, 길면 72시간. 상태가 Verified가 될 때까지 기다린다
6. 도메인 설정에서 **Open Tracking·Click Tracking을 끈다.** 클릭 추적은 링크를 추적 주소로 바꿔서 매직링크(1회용)가 망가지거나 스팸으로 보일 수 있다. Resend도 로그인·비밀번호 재설정 같은 거래성 메일은 끄라고 권한다

## 3. API 키

1. **API Keys → Create API Key**
   - 이름: `portfolio-web-prod`
   - 권한: **Sending access** (Full access 아님)
   - 도메인: 2에서 만든 도메인 하나로 제한
2. 키는 만들 때 한 번만 보인다. 바로 `.prod.vars`에 넣는다(채팅·커밋 금지):

   ```
   RESEND_API_KEY=re_...
   MAIL_FROM=letters@mail.{도메인}
   ```

   `LETTER_TO`는 10/29에 이미 운영 비밀로 들어가 있다.
3. 로컬(`.dev.vars`)은 비워 두는 것을 기본으로 한다 — 로컬에서 실제 메일이 나가지 않고 링크가 로그에 찍힌다. 로컬에서도 실제 발송을 보고 싶으면 키를 하나 더(`portfolio-web-dev`) 만들어 넣는다

## 4. 배포

```bash
pnpm check && pnpm run deploy
./node_modules/.bin/wrangler secret list   # RESEND_API_KEY, MAIL_FROM 이름이 보이면 된다
```

`pnpm run deploy`는 `.prod.vars`에 빈 값이 있으면 멈춘다. 아직 없는 값은 줄을 지우거나 주석 처리한다.

## 5. 확인

운영 사이트에서, 내 Gmail이 **아닌** 주소(다른 메일 계정)로 확인해야 도메인 인증이 실제로 된 것이다. 도메인 인증 전에는 Resend가 계정 본인 메일로만 보내기 때문이다.

- [ ] 이메일 로그인: 다른 주소로 매직링크 요청 → 1분 안에 도착(스팸함도 확인) → 링크로 로그인 → 같은 링크 재사용 시 "이미 쓰였어요" 안내
- [ ] 레터: 로그인 후 레터 보내기 → `LETTER_TO`에 `[Letter] ...` 도착, 답장 누르면 받는 사람이 방문자 주소
- [ ] 어드민 답장: `/admin`에서 답장 → 방문자 주소에 도착, 답장 누르면 받는 사람이 내 개인 메일
- [ ] Telegram: 새 레터마다 📮, 실패하면 ⚠️ Resend 실패
- [ ] Gmail에서 받은 메일 → 점 3개 → **원본 보기**: SPF·DKIM·DMARC 모두 `PASS`
- [ ] 한/영: `/en`에서 요청한 매직링크는 영어 메일

## 문제가 생기면

매직링크 발송이 실패하면 Resend가 준 사유가 `./node_modules/.bin/wrangler tail`에 `[mail] magic link failed: …`로, Telegram에 `⚠️ Resend 실패`로 그대로 나온다(11/01부터). 실패한 요청은 같은 이메일 10분 제한을 되돌려서 고친 뒤 바로 다시 시도할 수 있다(IP당 10분 3회는 유지).

| 증상 | 원인·해결 |
| --- | --- |
| 403 `You can only send testing emails to your own email` | 도메인이 아직 Verified가 아니거나 `MAIL_FROM`의 도메인이 등록한 도메인과 다르다 |
| 403 `domain is not verified` | DNS 전파 대기 중. Resend 도메인 화면에서 빨간 레코드를 확인. Cloudflare에서 DKIM이 프록시(주황 구름)면 DNS only로 |
| 422 `Invalid from` | `MAIL_FROM`에 따옴표·공백이 들어갔다. 발신 이름은 코드가 `SITE_NAME`으로 붙인다 |
| 401 | 키가 틀렸거나 지워졌다. 새 키를 만들어 `.prod.vars` 교체 후 재배포 |
| 스팸함으로 감 | DMARC 추가, 클릭 추적 끄기 확인. 새 도메인은 처음 며칠 평판이 낮다 |
| 매직링크 클릭하면 바로 만료 | 메일 보안 스캐너가 링크를 먼저 열었을 수 있다(회사 메일). 클릭 추적이 꺼져 있는지 확인 |

레터 메일이 실패해도 레터는 D1에 `status = failed`로 남고 어드민에서 재전송할 수 있다. 무료 한도는 하루 100통·월 3,000통이고, 코드의 매직링크 제한(IP당 10분 3회, 이메일당 10분 1회)과 레터 제한(하루 3통)이 그 안에서 막는다.
