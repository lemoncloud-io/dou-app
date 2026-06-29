# auth

> 대상: `apps/web/src/app/features/auth`

## 책임

로그인·로그아웃·OAuth 콜백·**초대 수락**을 담당한다. 인증 처리는 web-core 세션 훅에 위임하고, auth feature는 흐름 조립(파싱 → 로그인 → 세션 hydrate/전환 → 이동)만 한다. 계정 생성·비번 재설정은 [account](../account/README.md)가 담당한다.

## 화면

| 페이지              | 경로(`ROUTES.auth.*`)  | 설명                                                     |
| ------------------- | ---------------------- | -------------------------------------------------------- |
| `LoginPage`         | `/auth/login`          | 로그인 진입. invite 딥링크면 수락 흐름, 아니면 로딩 표시 |
| `LogoutPage`        | `/auth/logout`         | 캐시 클리어 + 릴레이 세션 종료                           |
| `OAuthResponsePage` | `/auth/oauth-response` | OAuth 리다이렉트 콜백 처리                               |

## 구조

```
features/auth/
  hooks/
    useInviteAccept.ts      # 초대 수락: 로그인 → 클라우드 진입 → 홈 이동
    useInviteCloudEntry.ts  # 토큰 기반 switchCloud + switchSite (로그인과 분리)
    useOAuthLogin.ts        # OAuth 리다이렉트 콜백 처리
    useClearCache.ts        # 전 레포 캐시 클리어 (로그아웃용)
  types/
    auth.ts                 # InviteParams + parseInviteDeeplink / isInviteDeeplink
  pages/                    # LoginPage / LogoutPage / OAuthResponsePage (UI + 훅 호출)
  routes/
  index.tsx                 # AuthRoutes
```

## 데이터 흐름 (web-core 신 public API)

세션 변경은 모두 web-core 훅 경유다(core 객체 직접 접근 금지).

| 용도                   | API                                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| 초대 로그인(토큰 반환) | `useInviteFlow().runInviteFlow({ code, backend })`                          |
| 클라우드/사이트 전환   | `useSwitchCloudSession().switchCloud(id)`, `useSiteSwitch().switchSite(id)` |
| 세션 hydrate           | `useRefreshRelaySession().refreshRelaySession({ syncProfile: true })`       |
| OAuth 코드 교환        | `createCredentialsByProvider(provider, code)` (transport-only)              |
| 초대 코드 로그인(api)  | `loginWithInviteCode(code, delegatorId, backend?)` (delegatorId 필수)       |
| 로그아웃               | `useSessionLogout()`                                                        |
| 캐시 클리어            | 레포별 `cacheClear()` 순회 (`useClearCache`)                                |

## 흐름 요약

- **초대 수락** — 상세는 [invite.md](./invite.md).
- **OAuth 콜백** — `useOAuthLogin`이 `code`/`provider`/`state` 파싱 → `createCredentialsByProvider`(또는 invite는 `loginWithInviteCode`) → `refreshRelaySession({ syncProfile: true })`로 세션 hydrate → `state.from`으로 이동.
- **로그아웃** — `LogoutPage`가 `useClearCache().clearAllCache()`(전 레포 `cacheClear`)로 캐시를 비운 뒤 `useSessionLogout()`으로 릴레이 세션을 종료한다. 릴레이 로그아웃되면 **런타임이 자동으로 게스트 로그인**을 수행하므로 다음 세션은 깨끗한 캐시에서 시작한다.
- **게스트/디바이스 로그인** — auth에서 다루지 않는다(런타임 자동 처리). 비-invite `/auth/login` 진입은 로딩 표시만.
