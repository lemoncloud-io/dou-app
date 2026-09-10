# auth

> 대상: `apps/web/src/app/features/auth`

## 책임

로그인·로그아웃·OAuth 콜백·**초대 수락**을 담당한다. 인증 처리는 `@chatic/app-runtime`의 세션 표면(`runtime.session.*`)에 위임하고, auth feature는 흐름 조립(파싱 → 로그인 → 세션 hydrate/전환 → 이동)만 한다. 계정 생성·비번 재설정은 [account](../account/README.md)가 담당한다.

## 화면

| 페이지              | 경로(`ROUTES.auth.*`)  | 설명                                                                                |
| ------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `LoginPage`         | `/auth/login`          | 쿼리를 달고 루트로 리다이렉트하는 shim. 초대 판정은 루트의 `InviteEntryGate`가 한다 |
| `LogoutPage`        | `/auth/logout`         | 릴레이 세션 종료 (`useSessionLogout()` 하나)                                        |
| `OAuthResponsePage` | `/auth/oauth-response` | OAuth 리다이렉트 콜백 처리                                                          |

## 구조

```
features/auth/
  components/
    PhoneVerifyScreen.tsx     # 전화번호 인증 풀스크린 (relay 초대 수락용) → phone-verification.md
    PhoneVerifySheet.tsx      # 같은 본문의 바텀시트 셸 (발급 · 마이페이지)
    PhoneVerifyFields.tsx     # 두 셸이 공유하는 입력 본문
    PhoneVerifyBanner.tsx     # 계정 갈라짐 방어 배너 (소셜 로그인으로 이동) — 풀스크린 셸 전용
  hooks/
    useOAuthLogin.ts          # OAuth 리다이렉트 콜백 처리
    useOtpExpiryCountdown.ts  # 서버 expiredAt 기준 초 단위 카운트다운
    usePhoneVerify.ts         # 전화번호 인증 상태기계 (phone-verification.md)
    useNavigateToLogin.ts     # 로그인 진입점 단일 통로 (login-return.md)
    useClearCache.ts          # 전 레포 캐시 클리어 — 현재 호출부 0건 (정의·export만)
  utils/
    phone.ts                  # 자기 테스트만 쓰는 죽은 코드. 인증 본문은 app/utils/phoneNumber.ts 를 쓴다
  pages/                      # LoginPage / LogoutPage / OAuthResponsePage (UI + 훅 호출)
  routes/
  index.tsx                   # AuthRoutes + PhoneVerifyScreen/PhoneVerifyBanner export
```

## 데이터 흐름 (app-runtime 세션 표면)

세션 변경은 모두 `runtime.session.*` 경유다(core 객체 직접 접근 금지).

| 용도                           | API                                                                         |
| ------------------------------ | --------------------------------------------------------------------------- |
| 초대 로그인(토큰 반환)         | `useInviteFlow().runInviteFlow({ code, backend })`                          |
| 클라우드/사이트 전환           | `useSwitchCloudSession().switchCloud(id)`, `useSiteSwitch().switchSite(id)` |
| OAuth 코드 교환(세션 커밋까지) | `createCredentialsByProvider(provider, code)`                               |
| 초대 코드 로그인(api)          | `loginWithInviteCode(code, delegatorId, backend?)` (delegatorId 필수)       |
| 로그아웃                       | `useSessionLogout()`                                                        |
| 캐시 클리어                    | 레포별 `cacheClear()` 순회 (`useClearCache`)                                |

## 흐름 요약

- **초대 수락** — auth 소관이 아니다. 구현은 `features/invite/accept/`이고 문서는
  [invite/README.md](../invite/README.md)가 소유한다(딥링크 수신은 relay-invite-accept.md,
  그룹 팝업은 home/invite-accept.md).
- **계정 연동 통합 경로** — 상세는 [account-linking.md](./account-linking.md).
  `auth.link-account` 하나가 번호·이메일·소셜을 받고, `type`×`mode`×`step`이 요청을 정한다.
  게이트웨이·데이터 소스·`link$` 읽기가 여기 있다.
- **전화번호 인증 (relay 1:1 초대 · 마이페이지)** — 상세는
  [phone-verification.md](./phone-verification.md). `PhoneVerifyScreen`/`PhoneVerifySheet`가
  `auth.link-account`를 돌린다. `mode: 'login'`의 `confirm`이 주는 `$token`은
  `applySessionToken`(`@chatic/app-runtime`)으로 같은 소켓 연결의 신원을 메인유저로 바꾼 뒤
  `onVerified`를 부른다. `mode: 'link'`는 세션을 건드리지 않는다.
- **로그인 후 원위치 복귀** — 상세는 [login-return.md](./login-return.md). 진입점이 로그인 화면을
  PUSH하므로 복귀는 `navigate(-1)`이다. `replace`는 딥링크·새로고침으로 곧장 들어와 되돌아갈 자리가
  없을 때의 폴백뿐이다(ADR-0055).
- **OAuth 콜백** — `useOAuthLogin`이 `code`/`provider`/`state` 파싱 → `createCredentialsByProvider`가 세션 커밋까지 끝냄 (invite 분기는 `delegatorId` 유무만 던지고 아무 호출도 하지 않는다) → `state.from`으로 이동. 예전엔 교환이 transport 크레덴셜만 만들어서 뒤이어 `refreshRelaySession({ syncProfile: true })`으로 identity를 복구해야 했지만, 교환 응답을 그대로 커밋하도록 고치면서 그 호출이 사라졌다(ADR-0070 불변조건 1·2).
- **로그아웃** — `LogoutPage`는 `useSessionLogout()` 하나만 부른다. 릴레이 로그아웃되면 **런타임이 자동으로 게스트 로그인**을 수행한다. `useClearCache`는 정의와 배럴 export만 있고 **호출부가 없다** — 로그아웃이 캐시를 비운다고 읽으면 안 된다.
- **게스트/디바이스 로그인** — auth에서 다루지 않는다(런타임 자동 처리). 비-invite `/auth/login` 진입은 로딩 표시만.
