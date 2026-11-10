설명과 코드를 단계마다 나란히 두는 작성 예시다. <b>단(2열) 블록 하나 = 한 단계</b>: 왼쪽에 소제목과 설명, 오른쪽에 코드. 탭 이름은 코드 위 이름표(파일명·패키지 매니저)가 된다. 이 글은 공개하지 않는다.

## 설치부터 미들웨어까지

<columns>
<column>
### SDK 설치

다음 명령으로 SDK를 설치한다. 패키지 매니저마다 탭으로 나눈다.
</column>
<column>
<tabs>
<tab>
npm

```bash
npm install @clerk/nextjs
```
</tab>
<tab>
pnpm

```bash
pnpm add @clerk/nextjs
```
</tab>
</tabs>
</column>
</columns>

<columns>
<column>
### 키 넣기

<code>.env</code>에 키를 넣는다. 탭이 하나면 그 이름이 파일명이 된다.
</column>
<column>
<tabs>
<tab>
.env

```bash
CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
```
</tab>
</tabs>
</column>
</columns>

<columns>
<column>
### 미들웨어 추가

<code>clerkMiddleware()</code>를 내보낸다. 기본은 모든 경로가 공개다.
</column>
<column>
<tabs>
<tab>
proxy.ts

```ts
import { clerkMiddleware } from '@clerk/nextjs/server'

export default clerkMiddleware()
```
</tab>
</tabs>
</column>
</columns>

## 단계 밖의 보통 코드

단에 넣지 않은 코드 블록은 본문 폭 그대로 나온다.

```ts
const ok = true
```
