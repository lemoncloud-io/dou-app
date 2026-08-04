# ADR-0042: 계정 연동 통합 경로(`auth.link-account`)로 전면 이관

> 상태: Accepted · 결정일: 2026-08-03
> 선행: [ADR-0033](./0033-relay-dm-invite-and-auth-parallel-tracks.md) · [ADR-0034](./0034-inviter-phone-verification-guest-gate-and-sheet.md) · [ADR-0036](./0036-data-surface-unification-app-runtime-cleanup.md)

## 맥락 (Context)

서버가 계정 인증 경로를 하나로 모았다. 원본은 `chatic-sockets-api`
`docs/specs/relay-server-invite/`(Rev 2026-07-31, 05-client-guide.md가 앱용 정본)이고
정책 원본은 `chatic-backend-api` `feat/relay-server-user-invite-v2` 브랜치의
`docs/specs/relay-server-user-invite/account-linking-design.md`다.

바뀐 것은 셋이다.

1. **수단·모드·단계 하나로 통합.** 번호·이메일·소셜을 `auth.link-account` 한 패킷이 받는다.
   `type`(무엇으로 증명) · `mode`(증명 뒤에 무엇을 하나: `link`=지금 세션에 수단을 단다 /
   `login`=그 계정 주인으로 세션을 연다) · `step`(`send`·`resend`·`verify`·`confirm`)의
   판별 유니온이다.
2. **증명과 확정이 갈렸다.** `verify`는 코드가 맞는지까지만 답하고 아무것도 바꾸지 않는다.
   `mode: 'link'`의 `verify`만 `{ linkable, reason }`을 주고(`reason`: `'occupied'`=그 계정이
   남의 것 / `'type-linked'`=그 수단을 이미 다른 값으로 달아 둠), **`confirm`은 같은 상황을
   409·403 에러로 답한다.**
3. **`UserView.link$`가 생겼다.** 유저가 어떤 수단을 달았는지 서버가 알려 주는 자리다
   (`{ phone?, email?, social? }`, 각 항목이 `{ hint, provider, linkedAt }`).

구 경로 둘(`auth.verify-hash-alias` · `auth.attach-social`)은 동작을 유지하되 `@deprecated`가
달렸고, 백엔드는 *"앱이 옮기면 한 벌로 지운다"*고 대기 중이다. 이 작업이 그 제거의 전제다.

### 조사로 확인한 앱의 현재 상태

- **`auth.link-account`를 부를 수단이 없다.** `chatic-sockets-lib@0.4.9`의 `AuthGateway`는
  `verifyHashAlias`·`attachSocial`뿐이고 `linkAccount`는 **0.4.12**에서 처음 나온다.
- **`verify` 단계가 아예 없다.** `AuthRemoteDataSource.ts:68-92`가 구 경로의 `step: 'check'`
  하나만 쓰고, `usePhoneVerify.ts:270`이 6자리에 닿으면 자동으로 곧바로 확정한다.
- **"번호를 보유했나"라는 개념이 없다.** 가진 신호는 `isGuest`(`useRuntimeProfile.ts:60`),
  초대별 `needVerify`, 그리고 localStorage 추측(`chatic-linked-social-providers`,
  `useSocialLinks.ts:17`)뿐이다. `useSocialLinks.ts:64-70`이 그 추측을 "TODO(backend)
  request #6"으로 적어 뒀고 `link$`가 그 요청이다.
- **`link$`의 읽기 경로는 이미 열려 있다.** 앱은 이미 `user.profile`을 부르고
  (`useMyUser.ts:39` → `UserRepositoryV2.getMyProfile`), 파이프라인 전 구간이 spread
  기반이라(`UserRemoteDataSource.ts:71` → `mappers.ts:172` → `UserLocalDataSourceV2.ts:96`
  → IndexedDB) 모르는 필드가 버려지지 않는다. **막는 것은 타입뿐이다** — 경계 타입이
  `@lemoncloud/chatic-socials-api`의 `UserView`인데 페이로드는 backend-api의 `MyUserView`다.
- **두 초대 진입점은 둘 다 게스트 전용이라 항상 `login`이다.** `mode: 'link'`가 필요한
  자리(이미 메인유저인데 번호가 없는 소셜 가입자)가 아직 없다.

### 서버 확인이 필요한 미결 둘

이 ADR은 답을 기다리지 않고, **답이 어느 쪽이어도 화면이 깨지지 않는 쪽**을 고른다.

- **기존 유저 `link$` 백필.** 설계 문서는 "새 경로를 열기 전에 계정을 훑어 유저를 채우는
  일회성 패치"를 전제하는데 `account-linking-plan.md`의 구현 순서 7단계에 그 작업이 없다.
  백필 전이면 이미 소셜로 가입한 유저의 `link$.social`이, 번호로 가입한 유저의
  `link$.phone`이 비어 있다.
- **`user.profile`이 `link$`를 실어 오는지.** 타입으로는 `UserProfile$.$user: UserView`라
  온다. 하지만 설계 문서가 "응답으로 낼 때는 저장 객체를 그대로 싣지 않고 표시 자리만 골라
  새로 짓는다"고 적어 뒀으므로 뷰를 짓는 코드가 경로마다 따로 있고, `/profile` 경로가 그
  자리를 짓는지는 문서에 없다.

## 결정 (Decision)

### 1. 라이브러리 3종을 올린다 — 하드 전제조건

| 패키지                           | 현재                   | 올릴 값     | 이유                                                                                 |
| -------------------------------- | ---------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `@lemoncloud/chatic-sockets-lib` | `0.4.9` (고정)         | `0.4.12`    | `AuthGateway.linkAccount` · `AuthLinkAccountInput` 판별 유니온                       |
| `@lemoncloud/chatic-backend-api` | `^0.26.704` (설치 705) | `^0.26.706` | `LinkAccountBody`/`LinkAccountView` 유니온 · `LoggedInView.isNew` · `UserView.link$` |
| `@lemoncloud/chatic-sockets-api` | `0.26.704` (고정)      | `0.26.709`  | `auth.link-account` + 초대 4개 패킷 배선                                             |

버전 없이는 이 ADR의 어떤 항목도 착수할 수 없다. 세 개를 한 커밋으로 올리고
`npx tsc --noEmit` 초록을 먼저 확인한다.

**에러 코드 처리는 이 버전업에 영향받지 않는다.** 0.4.9와 0.4.12의 거절 경로
(`pending-request-store.js`)는 바이트 단위로 동일하고, 둘 다 `:error` 프레임의 `errorCode`를
버리고 `message.error` 문자열만 남긴다. `getSocketErrorCode`(`utils/errors.ts:20`)는 이미
`errorCode`를 먼저 읽고 접두 파싱으로 폴백하도록 방어돼 있어 그대로 산다.

### 2. 구 경로를 전면 이관한다 — 호출부 0개까지

`verifyHashAlias`·`attachSocial` 호출부를 남기지 않는다. 이관 지점:

- `AuthDomainGateway`(`libs/data/src/data/remote/gateways/index.ts:21`)의 `Pick`에 `linkAccount`를
  더하고, `remoteFactory.ts:58-62`에서 **relay 스코프 클라이언트로 핀**한다(구 둘과 동일).
- `AuthRemoteDataSource`가 `type`·`mode`·`step` 조립을 소유한다. 지금 `step` 파생이 이 층에
  있으므로(`:68-92`) 자리를 옮기지 않는다.
- 앱 훅 `useVerifyHashAlias`·`useAttachSocial`을 `linkAccount` 기반으로 교체한다.

이관이 끝나면 백엔드가 대기 중인 구 경로 삭제가 풀린다.

### 3. 모드는 세션 역할이 고른다 — 응답을 열어 보고 분기하지 않는다

`isGuest`면 `mode: 'login'`, 메인유저면 `mode: 'link'`. 어긋나면 에러다(메인유저가 `login`을
부르면 **400**, 게스트가 `link`를 부르면 **403**) — 역할로 미리 고르면 이 둘을 만나지 않는다.
ADR-0034가 이미 `isGuest` 게이트를 깔아 뒀으므로 자리를 새로 만들지 않는다.

### 4. `verify`/`confirm`은 `link`에서만 나눈다

| 모드                              | 흐름                                                    | 이유                                                                                                                           |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `link` (번호·소셜 연동)           | `verify` → `linkable`을 눈으로 보여줌 → CTA로 `confirm` | `linkable: false`면 확정 버튼을 끄고 `reason`을 안내한다. `confirm`은 같은 상황을 409·403 에러로만 답하므로 물어보는 쪽이 낫다 |
| `login` (초대 흐름의 번호 로그인) | 자동 `confirm` 단발 (현행 유지)                         | `login`의 `verify`는 `{ verified: true }`만 답해 얻는 것이 없다. 기존 초대 두 흐름의 UX를 건드리지 않는다                      |

`usePhoneVerify.ts:270`의 자동 제출과 `pendingToken` 재시도 구조는 `login` 경로에서 그대로 산다.

### 5. `link$`는 "있으면 쓰고 없으면 모른다"로 취급한다

**차단의 진실은 `link$`가 아니다.** 서버 에러(403 `type-linked` / 409 `occupied`)와
`mode: 'link'`의 `verify`가 주는 `linkable`이 계약이고, `link$`는 **화면을 미리 고르는 힌트**다.

- `link$.phone`이 있으면 → "인증됨 `****{hint}`"를 보여주고 인증을 요구하지 않는다.
- `link$.phone`이 **없거나 `link$` 자체가 없으면** → 판정하지 않고 지금까지의 기준
  (`isGuest`)으로 물러난다. 백필 전이라 비어 있는 것과 정말 번호가 없는 것을 구별하지 않는다.

이렇게 하면 백필이 나중에 와도 화면을 다시 짜지 않고, 정밀도만 올라간다.

읽는 자리는 `useMyUser`·`useRuntimeProfile`이며, **타입은 읽는 쪽에서 넓힌다** —
`MyUser = DomainUser & { photo?, email? }`(`useMyUser.ts:14`)와
`SessionUserView`(`useRuntimeProfile.ts:12`)가 이미 쓰는 기법 그대로다. 경계 타입
(socials-api `UserView`)을 backend-api로 바꾸지 않는다. 그건 이 작업의 범위를 넘는다.

### 6. 초대 발급 자격을 "번호 보유"로 좁힌다 — 클라 게이트

가이드 §A-1이 *"나중에 번호 인증을 요구하도록 좁힐 수 있다"*고 열어 둔 지점이다.
`ContactInvitePage`의 게이트를 `isGuest`에서 다음으로 넓힌다:

- 게스트 → 번호 **로그인**(`mode: 'login'`) — 현행 `PhoneVerifySheet` 그대로.
- 메인유저인데 `link$.phone`이 **명시적으로 없다고 읽힌 경우** → 번호 **연동**(`mode: 'link'`).
- 그 외(메인유저 + 번호 있음, 또는 `link$`를 못 읽음) → 발급 폼.

**서버는 이 정책을 지키지 않는다** — 소셜만 가진 유저의 발급을 여전히 허용한다. ADR-0034가
잡은 구도와 같다: **클라 게이트는 UX이고 서버 403이 계약이다.** `ContactInvitePage.tsx:126`의
403 폴백을 안전망으로 그대로 남긴다.

`mode: 'link'`의 `confirm`은 **토큰을 주지 않는다**(세션 불변). `applySessionToken.ts:48`이
빈 `$token`을 연동 전용 no-op으로 이미 처리하므로 세션 층을 건드리지 않는다.

### 7. 마이페이지 계정 연동 섹션을 번호·소셜 둘 다 연다

- `SOCIAL_LINK_ENABLED`(`features/mypage/flags.ts:29`) 전제를 해제한다.
- **localStorage 추측(`chatic-linked-social-providers`)을 폐기하고** 표시를 `link$`로 바꾼다.
  `link$`를 못 읽으면 상태를 단정하지 않고 섹션을 접는다 — 틀린 상태를 보여주는 것보다 낫다.
- 번호 연동 자리를 신설한다(`mode: 'link'`, §4의 2단 흐름).
- `attachSocial` 호출을 `linkAccount({ type: 'social', mode: 'link' })`로 옮긴다.
  네이티브 브릿지 전용 제약(`useSocialLinks.ts:94` `isNative()` 가드)은 그대로다.

### 8. 초대 수락에서 번호를 발송 **전에** `last4`로 대조한다

"입력한 번호가 초대받은 번호인가"를 앱이 알 수 있는 최대치는 **뒷 4자리**다. 서버가 번호
원문을 저장하지 않고(해시만) 응답에도 싣지 않으므로 이보다 정밀한 비교는 원천적으로 불가능하다.

지금은 그 4자리조차 쓰지 않는다 — `usePhoneVerify`가 `inviteCode`만 받고(`:38`, `:102`),
번호가 어긋나면 **서버 왕복을 한 번 한 뒤에야** 안내가 뜬다(`:163`의 400 분기).

`PhoneVerifyScreen`에 `last4`를 내려 발송 버튼에서 먼저 대조한다. 어긋나면 서버를 부르지 않고
그 자리에서 `phoneVerify.inviteMismatch`를 띄운다.

- 값은 이미 손에 있다. `flow.invite`가 상태로 노출돼 있고(`useRelayInviteFlow.ts:91,239`)
  타입이 `RelayInviteView & …`(`:25`)라 `last4`가 붙어 있다. `RelayInviteAccept.tsx:59`가
  `PhoneVerifyScreen`을 마운트하는 자리에서 그대로 읽힌다.
- **서버 400 분기를 그대로 남긴다.** 4자리 일치는 확정 판정이 아니고(국가코드가 다르면 꼬리가
  같아도 다른 번호다), 전체 대조는 서버가 해시로 한다. §6과 같은 구도다 — 클라 대조는 UX,
  서버가 계약.
- **`last4`가 안 오면 대조를 건너뛴다.** `invite.get`(수락 쪽)이 `last4`를 싣는다는 보장이
  문서에 없다 — 앱이 지금 `last4`를 읽는 자리(`InviteChannelRow.tsx:38`)는 발급자의
  `invite.list`다. §5와 같은 규칙으로 물러난다.

얻는 것은 왕복 0회의 즉시 피드백과, 오타로 발송 상한(하루 10회/번호 · 20회/기기)을 태우지
않는 것이다. 틀린 번호 시도가 그 카운터를 도는지는 스펙에 나오지 않으므로 안 태우는 쪽이 안전하다.

**발급 흐름의 재초대 대조는 하지 않는다.** `useSentInviteLog.ts:64`가 같은 지점을 주석으로
적어 뒀지만 별건이다.

### 9. 마이페이지 로그인 화면에 번호 로그인을 나란히 둔다

지금 번호로 메인유저가 되는 길은 **초대 흐름밖에 없다**(§A-1·A-2). `LoginPage`에 번호 로그인을
더해 초대와 무관한 로그인 경로를 만든다(`mode: 'login'`, 초대 코드 없음).

**한 화면에 나란히 둔다.** 소셜 버튼이 위, 그 아래 "또는 휴대폰 번호로 로그인".

- **계정 갈라짐 경고를 번호 섹션 바로 위에 인라인으로 둔다.** `PhoneVerifyBanner`는 쓰지
  않는다 — 그건 `ROUTES.mypage.login`으로 **보내는** 컴포넌트이고, 여기가 그 도착지다
  (`PhoneVerifyBanner.tsx:26`). 자기 자신으로 보내는 배너를 달면 안 된다.
- **방어의 성격이 바뀐다.** 지금까지는 "번호 화면에서 소셜 화면으로 보낸다"였고, 이제는 "두
  선택지를 같은 화면에 소셜 먼저로 보여준다"다. 스펙이 요구하는 것은 막는 것이 아니라
  알리는 것이므로(_"서버가 미리 막지 못하므로… 이 안내가 유일한 방어다"_) 이 쪽이 더 이르게
  닿는다. 초대 흐름의 `PhoneVerifyBanner`는 그대로 남는다 — 거기는 선택지가 하나뿐이다.
- **`isNew`로 성공 후 첫 화면을 고른다** — 참이면 가입, 거짓이면 복귀.
- 성공 후 히스토리 정리(`LoginPage.tsx:43-51`의 `window.history.go(-stepsBack)`)를 번호
  경로와 공유한다.

**번호 로그인은 `isNative()` 가드를 걸지 않는다 — 브라우저 로그인을 개방한다.**
소켓 호출이라 네이티브가 필요 없다. 지금 `LoginPage`는 소셜을 네이티브에서만 보여주고
브라우저에는 `mobileOnly`만 띄우므로(`:107-111`) **브라우저 빌드는 로그인이 아예 불가능하다.**
그 문구를 소셜 전용으로 좁히고 번호 섹션은 항상 보여준다.

**브라우저에서는 갈라짐 경고의 탈출구가 없다.** 소셜 로그인이 네이티브 전용이라(D)
"소셜로 먼저 로그인하세요"가 브라우저에서 실행 불가능한 안내가 된다. 브라우저에서는 문구를
**"기존 계정이 있다면 앱에서 소셜로 로그인해 주세요"**로 바꿔 안내에 그친다 — 이동 링크를
주지 않는다.

#### 9-a. 보강: 번호 로그인은 운영에서 노출하지 않는다 (2026-08-03)

위 §9를 구현한 뒤 **구독이 소셜 연동에 걸려 있다는 사실**이 확인됐다 — 구독은 클라우드에 붙고,
클라우드 소유는 소셜 계정 기반이다. 즉 번호만으로 가입한 유저는 결제해도 멤버십이 붙을 자리가 없다.

그래서 번호 로그인 진입점을 `isDevBuild()`(`VITE_ENV` DEV/LOCAL) 뒤로 두고 **운영은 소셜을 유일한
로그인으로 유지한다.** §9의 판단(자리·순서·경고 문구)은 그대로 유효하고, 배선과 테스트도 남아 있다 —
바뀐 것은 노출 시점뿐이다. 그 커플링과 갈라짐 안내가 정리되면 스위치 한 줄로 연다.

브라우저 문구도 이 스위치를 따른다: 번호 로그인이 숨겨져 있으면 "앱에서 로그인해 주세요"가 사실이고,
보이는 빌드에서는 **소셜만** 앱 전용이라 문구가 갈린다.

#### 9-b. 구독 호출은 소셜 부재를 스토어 앞에서 거절한다

`validateMembership`은 **구매 뒤에** 돌기 때문에 거기서 실패하면 돈은 나가고 구독은 안 붙는다.
`useSubscriptionIap.purchaseAndValidate`가 스토어를 열기 전에 거절한다.

**`link$.social`이 `'absent'`일 때만 막는다.** `'unknown'`(프로필 미도착 · 백필 안 된 기존 계정)을
"소셜 없음"으로 읽으면 **기존 유료 사용자의 갱신을 막는다** — §5의 규칙이 여기서 특히 값을 한다.
복구(`restorePurchases`)는 막지 않는다: 이미 존재하는 결제는 누군가의 것이고, 각 건이 서버 검증을
거쳐 실패 시 건너뛰므로 최악이 0건이다.

### 범위에서 빼는 것

- **이메일 수단.** 서버가 발송을 `501`로 끊는다. 타입 자리만 지나가게 두고 화면을 만들지 않는다.
- **연동 해제.** 서버 미결정 항목이다. `SOCIAL_UNLINK_ENABLED = false`를 유지한다.
- **번호 변경 · 수단당 여러 계정 · 소셜/이메일의 `login` 모드.** 전부 서버 미결정이다.
- **경계 타입을 backend-api로 통일하는 일.** `link$`만 읽는 쪽에서 넓힌다.
- **`errorCode`를 프레임에서 꺼내 Error에 붙이는 일.** lib 쪽 숙제다.
- **`user.profile`을 REST `GET /users/0/profile`로 옮기는 일.** `fetchProfile`
  (`libs/web-core/src/api/auth.ts:128`)이 죽은 코드로 이미 있어 폴백 카드로만 남긴다.

## 대안 (Alternatives)

**신규 자리만 `linkAccount`, 기존 초대 흐름은 구 경로 유지.** 가장 작지만 두 경로가 병존하고
이관이 숙제로 남는다. 백엔드의 구 경로 삭제가 계속 막히고, 서버가 "판정은 갈리지 않는다"고
보장해도 앱 안에 같은 일을 하는 코드가 둘이 된다. 버렸다.

**`verify`/`confirm`을 두 모드 모두 나누기.** 일관되지만 `login`의 `verify`는 `{ verified: true }`
뿐이라 사용자가 얻는 것이 없고, 초대 수락에 왕복 한 번이 더 든다. 버렸다.

**`link$`를 쓰지 않고 `verify`의 `linkable`만으로 판정.** 읽기 의존이 사라져 백필 미결이 아예
문제가 안 된다. 하지만 사용자가 번호를 입력하고 OTP를 받은 **뒤에야** "이미 달려 있다"를 알게
되고, 마이페이지 연동 상태 표시는 localStorage 추측을 계속 써야 한다. 버렸다.

**백엔드 답(백필·`user.profile` 뷰)을 기다린 뒤 착수.** 확실하지만, §5처럼 짜면 답이 어느
쪽이어도 화면을 다시 짜지 않는다. 기다릴 이유가 없다. 버렸다.

**`link$`를 못 읽을 때 localStorage 추측으로 폴백.** 두 진실을 섞으면 어느 쪽이 틀렸는지
추적할 수 없다. 못 읽으면 단정하지 않는 쪽(§7)을 골랐다.

## 결과 (Consequences)

얻는 것:

- 계정 수단을 증명하는 자리가 앱에도 하나가 된다. 수단이 늘어도 호출부가 늘지 않는다.
- 백엔드가 대기 중인 구 경로(`verify-hash-alias`·`attach-social`) 삭제가 풀린다.
- 연동 상태의 진실이 서버로 옮겨간다 — localStorage 추측과 `hasAnyLinked` 프록시가 사라지고
  `useSocialLinks.ts:64-70`의 TODO(backend) request #6이 닫힌다.
- 연동 화면이 "버튼 눌렀는데 에러" 대신 `linkable`로 미리 막는다.
- 소셜만 가진 유저에게도 번호를 요구할 수 있게 되어, 계정이 갈라지는 사고 표면이 줄어든다.

감수하는 트레이드오프:

- **발급 게이트가 클라 전용이다.** 서버가 지키지 않으므로 다른 클라이언트는 우회한다. 403
  폴백이 유일한 계약이다.
- **백필 전에는 §6의 좁히기가 사실상 동작하지 않는다.** 기존 유저의 `link$`가 비어 `isGuest`
  기준으로 물러나므로 지금과 같게 동작한다. 안전하지만, 이 작업의 가치 일부가 백필에 묶인다.
- **`cacheWrite`가 merge라 stale `link$`가 남는다**(`UserLocalDataSourceV2.ts:96-102`). 한번
  쓰인 값은 이후 응답이 그 자리를 빼먹어도 캐시에 남는다. 연동 해제가 생기면 버그가 되므로,
  해제를 열 때 replace 시맨틱을 함께 판단해야 한다.
- **`link$`가 타입에 안 보인다.** 읽는 쪽 교차 타입에 의존하므로, 서버가 모양을 바꿔도
  컴파일이 잡아 주지 않는다.
- **첫 페인트에는 `link$`가 없을 수 있다.** 토큰 시드(`useSeedMyUserCache.ts:22-29`)만 있는
  구간이다. `LoggedInView.$token`이 `UserTokenView extends UserView`이므로 서버가 그 자리를
  채우면 해소되지만, 보장은 없다. §5의 "못 읽으면 물러난다"가 이 구간도 덮는다.
- **에러 분기가 문구 접두 파싱에 계속 의존한다.** lib이 `errorCode`를 Error에 붙이지 않는다.
  버전업이 이걸 고쳐 주지 않으므로 서버 문구가 바뀌면 조용히 깨진다.
- **소셜 연동은 여전히 네이티브 전용이다.** 브라우저 빌드는 `mobileOnly` 토스트로 끝난다.
- **브라우저 로그인이 처음으로 열린다**(§9). 지금까지 없던 조합이 정상 상태가 된다 — 번호로만
  로그인했고 소셜을 달 수 없고(C-1이 네이티브 전용) 갈라짐 경고의 탈출구도 없는 세션이다.
  네이티브 전용 기능이 이 세션에서 어떻게 보이는지 확인해야 한다.
- **갈라짐 방어가 두 모양으로 갈린다** — 초대 흐름은 이동 배너(`PhoneVerifyBanner`),
  로그인 화면은 인라인 문구. 같은 위험을 두 문구로 관리하게 되므로 카피가 어긋나지 않게
  묶어 둔다.

## 다음 단계

이 ADR을 입력으로 `dev-2_implement`의 스펙 작성(Phase A)으로 넘긴다. 착수 순서는
**§1 버전업 → §2 게이트웨이·데이터 소스 이관 → §4 `verify` 도입 → §5 `link$` 읽기 →
§6 발급 게이트 → §7 마이페이지**다. §1이 초록이 되기 전에는 나머지가 컴파일되지 않는다.
§8은 다른 항목에 의존하지 않으므로 어디에 끼워도 된다.

시나리오·단계·응답의 전수 대조표는
[docs/plans/account-linking-scenarios.md](../plans/account-linking-scenarios.md)에 따로 두었다.
Phase A 스펙의 입력이다.

서버에 확인할 것 셋(백필 · `user.profile`의 `link$` · `invite.get`의 `last4`)은 착수를
막지 않지만, 답이 오면 §5~§8의 정밀도가 올라가므로 병행해서 물어 둔다.
