# 계정 인증·연동 시나리오 전수표

> 근거: [ADR-0042](../adr/0042-account-linking-unified-path-migration.md) ·
> 원본 계약: `chatic-sockets-api` `docs/specs/relay-server-invite/05-client-guide.md` (Rev 2026-07-31) ·
> 정책 원본: `chatic-backend-api` `feat/relay-server-user-invite-v2` `docs/specs/relay-server-user-invite/account-linking-design.md`

`dev-2_implement` Phase A 스펙의 입력이다. 결정의 근거는 ADR-0042에 있고, 이 문서는 그 결정을
**시나리오 · 단계 · 응답 · 에러**로 펼친 대조표다.

## 0. 축 세 개

요청 하나를 정하는 것은 셋이다.

| 축     | 값                                       | 무엇을 가르나             |
| ------ | ---------------------------------------- | ------------------------- |
| `type` | `phone` · `email` · `social`             | **무엇으로** 증명하나     |
| `mode` | `link` · `login`                         | 증명 **뒤에** 무엇을 하나 |
| `step` | `send` · `resend` · `verify` · `confirm` | 증명의 **어느 지점**인가  |

`mode`는 **세션 역할이 고른다** — 응답을 열어 보고 분기하지 않는다.

| 세션                      | 고르는 `mode`                    | 어긋나면                                       |
| ------------------------- | -------------------------------- | ---------------------------------------------- |
| 디바이스 유저 (`isGuest`) | `login` — 세션을 연다            | `link`를 부르면 **403** (자격 없음)            |
| 메인유저                  | `link` — 지금 세션에 수단을 단다 | `login`을 부르면 **400** (요청을 잘못 만든 것) |

지금 `login`을 받는 수단은 **번호뿐**이다. 소셜에는 `send`·`resend` 가지가 없고, 이메일 발송은
서버가 `501`이다.

## 1. 단계 × 모드 → 응답

| `step`            | `mode`  | 응답 뷰             | 담기는 것                                                  | 상태가 바뀌나            |
| ----------------- | ------- | ------------------- | ---------------------------------------------------------- | ------------------------ |
| `send` · `resend` | 둘 다   | `LinkSentView`      | `{ step, sent: true, expiredAt }`                          | 코드를 보냈다            |
| `verify`          | `link`  | `LinkVerifiedView`  | `{ step, linkable, reason?, hint?, provider? }`            | **아무것도 안 바뀐다**   |
| `verify`          | `login` | `LoginVerifiedView` | `{ step, mode, verified: true }`                           | **아무것도 안 바뀐다**   |
| `confirm`         | `link`  | `LinkedView`        | `{ step, linked: true, hint?, provider? }` — **토큰 없음** | 연동이 생긴다. 세션 불변 |
| `confirm`         | `login` | `LoggedInView`      | `{ step, mode, loggedIn: true, isNew, $token }`            | **세션이 바뀐다**        |

- `$token`이 실리는 자리는 **마지막 하나뿐**이다.
- `verify`가 정상 응답을 냈다는 것 자체가 코드가 유효하다는 뜻이다 — 유효 여부를 따로 담지 않는다.
- `linkable`은 **힌트**다. `confirm`이 같은 판정을 다시 한다.
- `isNew`로 첫 화면을 고른다 — 참이면 가입, 거짓이면 복귀.

### `linkable: false`의 이유 둘

| `reason`      | 뜻                                       | `confirm`은 |
| ------------- | ---------------------------------------- | ----------- |
| `occupied`    | 그 계정이 **다른 유저** 것이다           | **409**     |
| `type-linked` | 그 수단을 **이미 다른 값으로** 달아 뒀다 | **403**     |

**`confirm`은 같은 상황을 에러로만 답한다.** 그래서 연동 화면은 `verify`로 먼저 물어보고
확정 버튼을 끄는 쪽이 낫다(ADR-0042 §4).

---

## 2. 시나리오

### A. 번호 로그인 — 게스트가 메인유저가 된다 (`mode: 'login'`)

세션이 바뀌는 유일한 번호 경로다. 앱의 두 진입점이 모두 여기다.

| #       | 맥락                            | 화면                                                             | 단계                            | 갈라짐 안내                |
| ------- | ------------------------------- | ---------------------------------------------------------------- | ------------------------------- | -------------------------- |
| **A-1** | 게스트가 **초대를 발급**하려 함 | `ContactInvitePage` → `InviterVerifyPrompt` → `PhoneVerifySheet` | `send` → `confirm`              | 없음 (ADR-0034 결정 4)     |
| **A-2** | 게스트가 **초대를 수락**하려 함 | `RelayInviteAccept` → `PhoneVerifyScreen`                        | `send`(**+`code`**) → `confirm` | `PhoneVerifyBanner` (이동) |
| **A-3** | 게스트가 **그냥 로그인**하려 함 | `LoginPage` — 소셜 아래 나란히                                   | `send` → `confirm`              | 인라인 문구 (이동 없음)    |

```ts
// A-1 · A-3 — 초대와 무관한 번호 로그인
await auth.linkAccount({ type: 'phone', mode: 'login', step: 'send', phone });
await auth.linkAccount({ type: 'phone', mode: 'login', step: 'confirm', phone, otp });

// A-2 — 초대 코드를 발송에 함께 보낸다
await auth.linkAccount({ type: 'phone', mode: 'login', step: 'send', phone, code });
await auth.linkAccount({ type: 'phone', mode: 'login', step: 'confirm', phone, otp });
```

**A-3만 브라우저에서도 동작한다**(ADR-0042 §9). 소셜(D)이 네이티브 전용이라 지금 브라우저
빌드는 로그인이 불가능한데, A-3이 그 경로를 처음 연다. 그래서 A-3에는 `isNative()` 가드를
걸지 않고, `LoginPage`의 `mobileOnly` 문구를 소셜 전용으로 좁힌다.

- **`verify`를 건너뛴다**(ADR-0042 §4). `login`의 `verify`는 `{ verified: true }`뿐이라 얻는
  것이 없다. 6자리에 닿으면 자동 `confirm` 단발 — 현행 유지.
- **`code`는 `send`에서만 읽힌다.** 초대받은 번호와 어긋나면 **문자가 아예 안 나가고 400**이다.
- **A-2는 발송 전에 `last4`로 먼저 대조한다**(ADR-0042 §8). 어긋나면 서버를 부르지 않는다.
- `confirm` 성공 → `$token` → `applySessionToken` → `loginRelayByToken` +
  `reauthenticateActiveSocket`. `useRuntimeProfile`이 `useSyncExternalStore` 기반이라
  게스트→메인유저가 **자동으로 뒤집힌다**(ADR-0034).
- `countryCode`는 **발송과 증명에 같은 값**을 보내야 같은 계정을 본다.

### B. 번호 연동 — 메인유저가 번호를 단다 (`mode: 'link'`)

**앱에 없던 자리다.** 소셜로만 가입해 번호가 없는 메인유저가 대상이다.

| #       | 맥락                            | 화면                               | 단계                          |
| ------- | ------------------------------- | ---------------------------------- | ----------------------------- |
| **B-1** | 마이페이지에서 자발적으로       | `AccountInfoPage` → 계정 연동 섹션 | `send` → `verify` → `confirm` |
| **B-2** | 초대를 발급하려는데 번호가 없음 | `ContactInvitePage` (발급 게이트)  | 같음                          |

```ts
await auth.linkAccount({ type: 'phone', mode: 'link', step: 'send', phone });
await auth.linkAccount({ type: 'phone', mode: 'link', step: 'verify', phone, otp }); // linkable?
await auth.linkAccount({ type: 'phone', mode: 'link', step: 'confirm', phone, otp });
```

- **`verify`를 반드시 거친다**(ADR-0042 §4). `linkable: false`면 확정 버튼을 끄고 `reason`을
  안내한다.
- **`confirm`이 토큰을 주지 않는다** — 세션 불변. `applySessionToken.ts:48`이 빈 `$token`을
  연동 전용 no-op으로 이미 처리한다.
- 이미 자기 것인 계정을 다시 확정해도 **무해하다**(멱등).
- B-2의 게이트는 **클라 전용**이다 — 서버는 번호 없는 유저의 발급을 여전히 허용한다.
  `ContactInvitePage.tsx:126`의 403 폴백이 안전망이다(ADR-0042 §6).

### C. 소셜 연동 — 메인유저가 소셜을 단다 (`mode: 'link'`, `type: 'social'`)

**발송 단계가 없다.** 증명 주체가 Apple·Google이라 `verify`·`confirm` 둘로 끝난다.

| #       | 맥락                     | 화면                | 단계                 |
| ------- | ------------------------ | ------------------- | -------------------- |
| **C-1** | 마이페이지에서 소셜 추가 | `SocialLinkSection` | `verify` → `confirm` |

```ts
await auth.linkAccount({ type: 'social', mode: 'link', step: 'verify', provider: 'apple', identityToken });
await auth.linkAccount({ type: 'social', mode: 'link', step: 'confirm', provider: 'apple', identityToken });
```

- **`mode: 'link'`만 받는다.** 세션이 바뀌지 않는다.
- **네이티브 브릿지 전용**이다(`useSocialLinks.ts:94` `isNative()` 가드). 브라우저 빌드는
  `mobileOnly` 토스트로 끝난다.
- `provider`는 소문자 알파벳으로 정규화된다. Apple은 `identityToken`, Google은 `idToken`.

### D. 소셜 로그인 — **소켓에 없다**

게스트가 소셜로 메인유저가 되는 길은 `auth.link-account`가 아니다. backend의 기존 소셜 경로를
**REST로** 부른다.

| 맥락                    | 경로                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `LoginPage`의 소셜 버튼 | `appBridge.oauthLogin` → `useLoginRelaySocial` (`LoginPage.tsx:28`)     |
| 브라우저 리다이렉트     | `useOAuthLogin` (`createCredentialsByProvider` + `refreshRelaySession`) |

**C와 혼동하지 않는다.** C는 이미 메인유저인 세션에 수단을 **더 다는** 것이고, D는 세션을 **여는**
것이다.

### E. 이메일 연동 — 자리만 있다

`type: 'email'`은 `mode: 'link'`만 받고, **발송이 서버에서 `501`로 끊긴다.** 계약 자리만 열려
있고 화면을 만들지 않는다(ADR-0042 범위 제외).

### F. 로그아웃 — 디바이스 유저로 돌아간다

| 단계           | 경로                                                                          |
| -------------- | ----------------------------------------------------------------------------- |
| 로그아웃       | `auth.logout` (소켓, 이번 배선 전부터 있음)                                   |
| 기기 등록 다시 | `POST /oauth/register-device` — **REST 직접**. 같은 기기면 같은 디바이스 유저 |

**`device.save`는 무관하다.** 이름이 비슷하지만 sockets-api 자체의 디바이스 레코드를 쓰는
패킷이고 backend 기기 등록이 아니다.

### G. 기기 변경 — A-2와 완전히 같다

새 기기에서 초대를 받아 번호를 인증하면 **기존 유저로 돌아온다.** 방과 데이터가 그대로 보인다.
`confirm` 응답의 `isNew`가 `false`로 온다. 앱이 따로 할 일은 없다.

**초대 없이 번호만으로 복구하는 길은 아직 없다.**

### H. 계정 갈라짐 — 막을 수 없다

소셜로 가입한 적이 있는 사용자가 새 기기에서 **소셜 로그인 없이 번호부터 인증하면 별개의 유저가
만들어지고 나중에 합칠 수 없다.** 서버가 미리 막지 못한다.

**유일한 방어는 안내 문구다.** 번호 입력보다 **위에** 보여준다. 자리마다 모양이 다르다.

| 자리                | 방어                                                           | 왜                                                                                                        |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **A-2** 수락 화면   | `PhoneVerifyBanner` — `ROUTES.mypage.login`(=D)으로 **보낸다** | 그 화면의 선택지가 번호 하나뿐이라 다른 길을 열어 줘야 한다                                               |
| **A-3** 로그인 화면 | **인라인 문구.** 이동 링크 없음                                | 소셜 버튼이 같은 화면 위에 이미 있다. 여기가 배너의 도착지이므로 자기 자신으로 보내는 배너를 달면 안 된다 |
| **A-1** 발급 시트   | 없음                                                           | ADR-0034 결정 4                                                                                           |

**A-3의 브라우저에서는 탈출구가 없다.** 소셜 로그인(D)이 네이티브 전용이라 "소셜로 먼저
로그인하세요"가 브라우저에서 실행 불가능한 안내가 된다. 브라우저에서는 **"기존 계정이 있다면
앱에서 소셜로 로그인해 주세요"**로 바꿔 안내에 그친다(ADR-0042 §9).

**같은 위험을 두 문구로 관리하게 되므로** A-2의 배너 카피와 A-3의 인라인 카피가 어긋나지 않게
묶어 둔다.

---

## 3. 발송 제한 — 안내가 필요한 자리

전부 `auth.link-account`의 `:error`로 오고 `errorCode`는 **429**다.

| 상황                     | 사용자에게                                      |
| ------------------------ | ----------------------------------------------- |
| 60초 안에 재발송         | "잠시 후 다시 시도해 주세요"                    |
| 한 번호로 하루 10회 초과 | "인증 요청이 너무 많습니다"                     |
| 한 기기로 하루 20회 초과 | 같음                                            |
| 인증번호 5회 틀림        | "인증번호를 다시 받아 주세요" — 재발송해야 한다 |

**재발송해도 틀린 횟수는 초기화되지 않는다.** 상한에 닿으면 새 코드를 받아도 계속 막히므로 이
경우의 안내를 따로 준비한다.

`dryRun`이어도 쿨다운·상한·오답 카운터는 정상으로 돈다.

## 4. 에러 코드 → 분기

`errorCode`(HTTP status)로만 분기한다. **문구를 파싱하지 않는다.**

| 코드  | 언제                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400` | 입력·형식 오류, 없는 `type`·`mode`·`step` 조합, **메인유저가 `login`을 부름**, **초대 번호 불일치**, 인증번호 미발송·만료, 수락 시점의 만료                |
| `401` | 세션 없음 (소켓 가드)                                                                                                                                      |
| `403` | 메인유저 아님, **게스트가 `link`를 부름**, **그 수단을 이미 달아 둠**(`type-linked`), 탈퇴·정지, **인증번호 불일치**, 수락자 번호 불일치, 초대 코드 불일치 |
| `404` | 초대·유저 없음                                                                                                                                             |
| `409` | **계정이 이미 다른 유저 소유**(`occupied`), 초대 선점에 짐                                                                                                 |
| `429` | 발송 쿨다운·총량 초과, 시도 횟수 초과                                                                                                                      |
| `501` | 이메일 수단의 코드 발송                                                                                                                                    |

**주의:** lib이 `:error` 프레임의 `errorCode`를 Error에 붙이지 않는다. `getSocketErrorCode`
(`utils/errors.ts:20`)가 `errorCode`를 먼저 읽고 없으면 메시지 접두(`403 FORBIDDEN - …`)를
파싱한다. 0.4.9와 0.4.12의 거절 경로는 동일하므로 버전업이 이 동작을 바꾸지 않는다.

## 5. 초대 상태 — 에러가 아니라 상태로 온다

`invite.get` 응답으로 갈리는 화면. **에러 문구를 파싱하지 말고 `state`로 분기한다.**

| 응답                                     | 화면                       |
| ---------------------------------------- | -------------------------- |
| `state = pending` · `needVerify = true`  | 번호 인증으로 (A-2)        |
| `state = pending` · `needVerify = false` | 바로 수락 버튼             |
| `state = accepted`                       | "이미 수락된 초대입니다"   |
| `state = expired`                        | "만료된 초대입니다"        |
| `:error`                                 | "유효하지 않은 초대입니다" |

**`needVerify = false`는 "지금 세션 유저가 그 초대 번호의 주인"이라는 서버의 판정이다.**
사용자가 화면에 **입력한** 번호가 아니라 **세션의** 번호에 대한 답이다 — 입력값 대조는 `last4`
(4자리, ADR-0042 §8)와 서버의 발송 단계 대조가 담당한다.

## 6. `link$` — 연동 상태 읽기

`UserView.link$`가 유저가 어떤 수단을 달았는지 알려 준다.

```ts
link$?: {
    phone?:  { hint?: string; provider?: string; linkedAt?: number };  // hint = 번호 뒤 4자리
    email?:  { … };                                                    // hint = 주소 일부
    social?: { … };                                                    // provider = 'apple' | 'google'
}
```

읽기 경로는 `user.profile` → `UserProfile$.$user` → `toDomainUser` → IndexedDB →
`useMyUser`/`useRuntimeProfile`. 전 구간 spread라 런타임에 살아서 온다. **타입만 읽는 쪽에서
넓힌다**(ADR-0042 §5).

**규칙: 있으면 쓰고, 없으면 모른다로 취급한다.** 차단의 진실은 `link$`가 아니라 서버 에러
(403·409)와 `verify`의 `linkable`이다.

## 7. 서버에 확인할 것

| #   | 무엇                                           | 답이 "아니오"면                                                                                          |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | 기존 유저 `link$` **백필 패치**가 돌았나       | 기존 유저의 `link$`가 비어 B-2 게이트가 사실상 동작하지 않는다. 안전하게 `isGuest` 기준으로 물러난다     |
| 2   | `user.profile`이 `$user.link$`를 **실어 오나** | §6이 성립하지 않는다. `GET /users/0/profile`(`libs/web-core/src/api/auth.ts:128`, 죽은 코드)이 폴백 카드 |
| 3   | `invite.get`이 `last4`를 **실어 오나**         | ADR-0042 §8의 사전 대조를 건너뛰고 서버 400에 의존한다                                                   |

셋 다 착수를 막지 않는다 — 전부 "없으면 물러난다"로 설계했다.
