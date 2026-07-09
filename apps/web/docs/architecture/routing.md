# 라우팅

> 대상: `apps/web/src/app/routes`

## 1. 라우터 구조 (3-tier)

라우터 생성·인증 분기·에러 처리는 `routes/index.tsx`에서 중앙화한다. 라우트는 세 묶음으로 나뉜다.

- **publicRoutes** — 인증 전(로그인/가입/비번재설정)
- **commonRoutes** — 인증 무관
- **privateRoutes** — `UnifiedLayout` 하위, `AuthGuard` 보호

feature는 자기 라우트를 소유하고, `routes/private/PrivateRoutes.tsx`가 **lazy import로 합성**한다.

```tsx
const ChannelRoutes = lazy(() => import('../../features/channels').then(m => ({ default: m.ChannelRoutes })));
```

- 인증 가드: `routes/guards/AuthGuard.tsx` (`useSessionAuth()` 관측)
- 네이티브가 던지는 네비게이션은 `GlobalBridgeListener`가 받는다(→ [bridge](./bridge.md)).

## 2. 경로 정의의 두 형태

| 형태                            | 위치                       | 예시                                    | 산재도                |
| ------------------------------- | -------------------------- | --------------------------------------- | --------------------- |
| **상대 경로** (`Route path`)    | feature `routes/index.tsx` | `path="edit"`, `path=":channelId/room"` | 낮음(feature 내 응집) |
| **절대 경로** (`navigate`/`to`) | 페이지·컴포넌트 전반       | `navigate(ROUTES.mypage.account.edit)`  | `ROUTES`로 단일화     |

feature 내부의 상대 `Route path`는 그대로 두고, **절대경로는 `ROUTES`에서만 파생**한다. 경로를 바꿀 때는 두 곳(feature `routes`와 `paths.ts`)을 함께 본다.

## 3. `ROUTES` 빌더 — 절대경로 단일 출처

`apps/web/src/app/routes/paths.ts`가 절대경로의 single source of truth다. 파라미터 없는 경로는 문자열 상수, 파라미터 경로는 빌더 함수로 노출한다.

**왜 객체 트리 + 함수 혼합인가**

- 파라미터 없는 경로 → 상수: IDE 자동완성 + `as const` 리터럴 타입.
- 파라미터 경로 → 함수: 인자 타입을 컴파일러가 강제, 템플릿 조립을 한 곳에 격리.
- 페이지 유형/도메인 경계를 객체 네임스페이스로 반영해 탐색성이 좋다. **URL 문자열 자체는 트리화하지 않는다**(딥링크·네이티브 브릿지·외부 공유 링크 호환).

```ts
// apps/web/src/app/routes/paths.ts (발췌)
export const ROUTES = {
    root: '/',
    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
        oauthResponse: '/auth/oauth-response',
        token: (token: string) => `/auth/token/${token}`,
    },
    account: {
        signup: { root: '/account/signup', verify: '/account/signup/verify', password: '/account/signup/password' },
        resetPassword: {
            root: '/account/reset-password',
            verify: '/account/reset-password/verify',
            newPassword: '/account/reset-password/new-password',
        },
    },
    home: '/',
    channels: {
        root: '/channels',
        room: (channelId: string) => `/channels/${channelId}/room`,
        settings: (channelId: string) => `/channels/${channelId}/settings`,
    },
    place: {
        order: '/place/order',
        detail: (placeId: string) => `/place/${placeId}`,
    },
    subscription: { root: '/subscription', plans: '/subscription/plans' },
    mypage: {
        root: '/mypage',
        account: {
            info: '/mypage/account',
            manage: '/mypage/account-manage',
            edit: '/mypage/edit',
            cloudProfile: '/mypage/cloud-profile',
            withdrawal: '/mypage/withdrawal',
        },
        policy: {
            root: '/mypage/policy',
            terms: '/mypage/policy/terms',
            licenses: '/mypage/policy/licenses',
            privacy: '/mypage/policy/privacy',
        },
    },
} as const;
```

> feature 디렉터리는 `ROUTES`의 top-level 그룹과 1:1로 정렬된다(`account auth channels home mypage place subscription`).
> `debug`는 라우트가 아니다 — 디버그 도구는 라우터 밖 오버레이로 뜬다([debug feature](../feature/debug/README.md)).

## 4. 파라미터 키 계약

`useParams` 키 오타를 막기 위해 같은 파일에 파라미터 키를 노출한다.

```ts
export const ROUTE_PARAMS = {
    channelId: 'channelId',
    placeId: 'placeId',
    token: 'token',
} as const;
```

opt-in: 동적으로 파라미터 키 문자열이 필요한 곳에서 `useParams<Record<typeof ROUTE_PARAMS.channelId, string>>()` 형태로 쓴다. 단순 케이스는 기존 `useParams<{ channelId: string }>()`가 가독성이 낫다.

## 5. 검증

- `app/routes/paths.test.ts` — 모든 상수·파라미터 빌더 출력 검증.
- 하드코딩 절대경로(navigate/`to=`)는 0건 — 전부 `ROUTES` 경유.
