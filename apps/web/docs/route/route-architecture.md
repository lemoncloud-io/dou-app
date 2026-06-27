# 라우트 정보 통합 관리 개선안

> 작성일: 2026-06-25 · 상태: 완료
> 대상: `apps/web/src` 라우팅 · 산출물: 타입세이프 path 빌더 도입 + workspace 제거 + 점진 마이그레이션

## 1. 목표와 배경

`apps/web`의 경로(path) 문자열이 코드 전반에 하드코딩되어 산재해 있다. 경로 상수나 빌더가 **전혀 없어서** 다음 문제가 발생한다.

- **중복**: 동일 경로 문자열이 여러 곳에 흩어짐. `/auth/login` 5곳, `/chats` 3곳, `/mypage/*` 다수.
- **오타·무검증**: 경로가 string literal이라 컴파일러가 오타를 못 잡는다. `/mypage/edt`를 써도 빌드는 통과한다.
- **변경 비용**: 경로 하나 바꾸면 `navigate(...)` 49곳을 수동으로 찾아 고쳐야 하고, 누락 시 런타임에서야 깨진다.
- **파라미터 조립 분산**: `/chats/${channelId}/room` 같은 템플릿이 호출부마다 손으로 조립됨.

동시에, 더 이상 쓰지 않는 **workspace 화면**(`/workspace`, `/create-workspace`)이 라우트·feature·여러 참조에 남아 있다. 통합 작업과 함께 제거한다.

**성공 기준**: 모든 절대경로 네비게이션이 단일 출처(`ROUTES`)에서 타입 안전하게 파생되고, 경로 변경이 한 파일 수정으로 끝난다. workspace 흔적이 코드·라우트·i18n에서 사라진다.

## 2. 범위

**포함**

- 절대경로 단일 출처 `ROUTES` 빌더 정의 (navigate / `<Navigate>` / `<Link to>` / GlobalBridgeListener용). **import는 `app/routes/paths.ts` 상대 import**(앱 내부 전용).
- 파라미터 경로의 타입세이프 빌더 함수 (`ROUTES.chats.room(channelId)`).
- 페이지 유형에 맞춘 `ROUTES` 트리 구조화(§4.4).
- 기존 하드코딩 절대경로 호출부(약 49곳)를 `ROUTES`로 마이그레이션.
- `useParams` 파라미터 키의 타입 상수화(오타 방지).
- **workspace 전면 제거**: feature 디렉토리, 라우트, `ExplorePage` workspaces 탭, `JoinByCodePage` workspace 분기, i18n `workspace.*`. 공용 컴포넌트(`InviteCodeCard`, `VisibilityToggle`)는 home feature로 이동.
- 유닛 테스트(빌더 출력 검증) + 검증 체크리스트.

**제외 (그리고 왜)**

- **라우트 트리 전면 매니페스트화**(타입·가드·lazy import까지 선언적 재설계)는 하지 않는다. 현재 3-tier 구조([routes/index.tsx](../src/app/routes/index.tsx))와 feature별 lazy 등록([PrivateRoutes.tsx](../src/app/routes/private/PrivateRoutes.tsx:63))은 이미 응집도가 좋고, 무너뜨리면 위험·비용이 크다.
- **URL 자체 재편**: 페이지 유형 트리화는 `ROUTES` 객체의 네임스페이스 구조에만 적용하고, 실제 URL 문자열은 바꾸지 않는다(딥링크·네이티브 브릿지·외부 공유 링크 호환).
- **feature 내부 `Route path`(상대 경로) 강제 치환**: 상대 경로는 이미 feature에 응집되어 산재 문제가 적다. 1차 범위 제외, `ROUTES`가 명세 역할(§4.3).

## 3. 현재 상태

### 3.1 라우터 구조 (이미 중앙화됨 — 유지)

- 라우터 생성·인증 분기·에러 처리: [routes/index.tsx:21-39](../src/app/routes/index.tsx)
- 3-tier: `publicRoutes` / `commonRoutes` / `privateRoutes`
- feature별 lazy 등록 + `path: 'xxx/*'` 매핑: [PrivateRoutes.tsx:63-81](../src/app/routes/private/PrivateRoutes.tsx)
- 인증 가드: [guards/AuthGuard.tsx](../src/app/routes/guards/AuthGuard.tsx)

### 3.2 경로 정의의 두 형태

| 형태                            | 위치                       | 예시                                    | 산재도                  |
| ------------------------------- | -------------------------- | --------------------------------------- | ----------------------- |
| **상대 경로** (`Route path`)    | feature `routes/index.tsx` | `path="edit"`, `path=":channelId/room"` | 낮음(feature 내 응집)   |
| **절대 경로** (`navigate`/`to`) | 페이지·컴포넌트 전반       | `navigate('/mypage/edit')`              | **높음(중복·하드코딩)** |

### 3.3 전체 라우트 인벤토리

(URL · 페이지 유형 · 인증 레벨. ⚠️ = 이번에 제거)

```
[Public / Common]  인증 전 또는 인증 무관
  /auth/login · /auth/logout · /auth/oauth-response · /auth/token/:token · /auth/token-test-login
  /account/signup · /account/signup/verify · /account/signup/password
  /account/reset-password · /account/reset-password/verify · /account/reset-password/new-password

[Private] UnifiedLayout 하위
  메인 탭     /  (home)        /explore        /notifications
  생성        /create-room
  참여        /join
  도메인 상세  /chats/:channelId/room
              /chats/:channelId/settings
              /chats/:channelId/settings/notifications
              /places/order · /places/:placeId
  마이페이지   /mypage  (허브)
    계정       /mypage/account · /mypage/account-manage · /mypage/edit · /mypage/cloud-profile · /mypage/login · /mypage/withdrawal
    구독       /mypage/subscription · /mypage/subscription/plans
    정책       /mypage/policy · /mypage/policy/terms · /mypage/policy/licenses · /mypage/policy/privacy
    디버그(DEV) /mypage/debug · /mypage/debug/{login,dashboard,state,log-buffer,cache-test,upload-test,badge-count}
  ⚠️ workspace /workspace/:wsId · /workspace/:wsId/settings · /create-workspace
```

### 3.4 산재 실측

- 경로 상수/빌더 파일: **없음**
- 절대경로 하드코딩 네비게이션: 약 49곳. 대표 중복: `/auth/login`(5), `/chats`(3), `/mypage/edit`(2)
- 파라미터 경로: `:channelId`(chats), `:placeId`(places), `:token`(auth), `:wsId`(workspace→제거) — 호출부마다 템플릿 수동 조립
- 예: [HomePage.tsx:162](../src/app/features/home/pages/HomePage.tsx) `navigate(isDefaultCloud ? '/mypage/edit' : '/mypage/cloud-profile')`

### 3.5 workspace 의존 지도 (제거 대상)

- feature: `app/features/workspace/` (pages: Detail/Settings/CreateWorkspace, components: InviteCodeCard/VisibilityToggle, routes)
- 라우트 등록: [PrivateRoutes.tsx:11-14,73-74](../src/app/routes/private/PrivateRoutes.tsx)
- 외부 참조:
    - [CreateRoomPage.tsx:11](../src/app/features/home/pages/CreateRoomPage.tsx) — `InviteCodeCard`, `VisibilityToggle` 재사용 → **home으로 이동**
    - [ExplorePage.tsx](../src/app/features/explore/pages/ExplorePage.tsx) — `'rooms' | 'workspaces'` 탭, workspace mock → 탭/필드 제거
    - [JoinByCodePage.tsx](../src/app/features/join/pages/JoinByCodePage.tsx) — `type: 'workspace'` 분기 → 제거·단순화
    - i18n `workspace.*` 키

## 4. 설계 방향

### 4.1 단일 출처 `ROUTES` 빌더

`apps/web/src/app/routes/paths.ts`에 절대경로 단일 출처를 정의한다. 파라미터 없는 경로는 문자열 상수, 파라미터 경로는 빌더 함수로 노출한다. **트리는 §4.4의 페이지 유형 그룹을 따른다.**

**왜 객체 트리 + 함수 혼합인가**

- 파라미터 없는 경로는 상수 → IDE 자동완성·`as const` 리터럴 타입.
- 파라미터 경로는 함수 → 인자 타입을 컴파일러가 강제, 템플릿 조립을 한 곳에 격리.
- 페이지 유형/도메인 경계를 객체 네임스페이스로 반영해 탐색성이 좋다.

### 4.2 파라미터 키 타입 상수

`useParams` 키 오타를 막기 위해 같은 파일에 파라미터 키를 노출한다.

```ts
// Param key contracts, paired with the builders.
export const ROUTE_PARAMS = {
    channelId: 'channelId',
    placeId: 'placeId',
    token: 'token',
} as const;
```

호출부:

```ts
// before
const { channelId } = useParams<{ channelId: string }>();
navigate(`/chats/${channelId}/settings`);

// after
const { channelId } = useParams<Record<typeof ROUTE_PARAMS.channelId, string>>();
navigate(ROUTES.chats.settings(channelId!));
```

### 4.3 상대 경로(Route 정의)와의 관계

feature `routes/index.tsx`의 `Route path`(상대)는 1차 범위에서 그대로 둔다. `ROUTES`가 사실상의 명세 역할을 하므로, 경로 변경 시 두 곳을 함께 본다는 규칙을 문서화한다.

### 4.4 페이지 유형 기반 `ROUTES` 트리 (제안)

URL은 유지하되, `ROUTES` 객체를 **인증 흐름 / 메인 / 도메인 상세 / 마이페이지 허브** 의 페이지 유형으로 묶는다. 특히 마이페이지는 `account · subscription · policy · debug` 하위 그룹으로, 인증은 `signup · resetPassword` 흐름 단위로 중첩해 탐색성을 높인다.

```ts
// apps/web/src/app/routes/paths.ts
// Single source of truth for absolute navigation paths.
// Grouped by page type, not just feature. URLs are unchanged.

export const ROUTES = {
    root: '/',

    // ── 인증·계정 (Public / Common) ──────────────────────
    auth: {
        login: '/auth/login',
        logout: '/auth/logout',
        oauthResponse: '/auth/oauth-response',
        token: (token: string) => `/auth/token/${token}`,
    },
    account: {
        signup: {
            root: '/account/signup',
            verify: '/account/signup/verify',
            password: '/account/signup/password',
        },
        resetPassword: {
            root: '/account/reset-password',
            verify: '/account/reset-password/verify',
            newPassword: '/account/reset-password/new-password',
        },
    },

    // ── 메인 진입 (Private) ──────────────────────────────
    home: '/',
    explore: '/explore',
    notifications: '/notifications',
    createRoom: '/create-room',
    join: '/join',

    // ── 도메인 상세 (Private) ────────────────────────────
    chats: {
        root: '/chats',
        room: (channelId: string) => `/chats/${channelId}/room`,
        settings: (channelId: string) => `/chats/${channelId}/settings`,
        roomNotifications: (channelId: string) => `/chats/${channelId}/settings/notifications`,
    },
    places: {
        order: '/places/order',
        detail: (placeId: string) => `/places/${placeId}`,
    },

    // ── 마이페이지 허브 (Private) ────────────────────────
    mypage: {
        root: '/mypage',
        login: '/mypage/login',
        account: {
            info: '/mypage/account',
            manage: '/mypage/account-manage',
            edit: '/mypage/edit',
            cloudProfile: '/mypage/cloud-profile',
            withdrawal: '/mypage/withdrawal',
        },
        subscription: {
            root: '/mypage/subscription',
            plans: '/mypage/subscription/plans',
        },
        policy: {
            root: '/mypage/policy',
            terms: '/mypage/policy/terms',
            licenses: '/mypage/policy/licenses',
            privacy: '/mypage/policy/privacy',
        },
        debug: {
            root: '/mypage/debug',
            login: '/mypage/debug/login',
            dashboard: '/mypage/debug/dashboard',
            state: '/mypage/debug/state',
            logBuffer: '/mypage/debug/log-buffer',
            cacheTest: '/mypage/debug/cache-test',
            uploadTest: '/mypage/debug/upload-test',
            badgeCount: '/mypage/debug/badge-count',
        },
    },
    // workspace / createWorkspace: 제거됨
} as const;
```

### 4.5 버린 대안

- **경로 상수만(빌더 함수 없이)**: 파라미터 경로를 여전히 호출부에서 조립 → 산재 절반만 해결. 기각.
- **URL 재편 포함 트리화**: 페이지 유형에 맞춰 실제 URL까지 재배치. 딥링크·브릿지 호환을 깨고 회귀 위험이 커서 기각. 트리화는 코드 네임스페이스에 한정.
- **라우트 매니페스트 전면 재설계**: 이득은 크나 현재 구조가 멀쩡하고 비용 과함. 향후 과제.

## 5. 구현 단계

검증 가능한 단위로 쪼갠다. 각 단계 후 `tsc`로 회귀 없음을 확인한다.

**A. workspace 제거 (선행)**

1. `InviteCodeCard`, `VisibilityToggle`을 `workspace/components` → `home/components`로 이동하고, [CreateRoomPage.tsx](../src/app/features/home/pages/CreateRoomPage.tsx) import 갱신.
2. `app/features/workspace/` 디렉토리 삭제. [PrivateRoutes.tsx](../src/app/routes/private/PrivateRoutes.tsx)에서 `WorkspaceRoutes`/`CreateWorkspaceRoutes` lazy import·path 2줄 제거.
3. [ExplorePage.tsx](../src/app/features/explore/pages/ExplorePage.tsx) workspaces 탭·mock 필드 제거(rooms 단일화). [JoinByCodePage.tsx](../src/app/features/join/pages/JoinByCodePage.tsx) `type: 'workspace'` 분기 제거. i18n `workspace.*` 키 제거.

**B. 빌더 도입** 4. `apps/web/src/app/routes/paths.ts`에 `ROUTES`/`ROUTE_PARAMS` 작성(영어 주석, §4.4 트리). 5. 유닛 테스트 `paths.spec.ts` — 모든 상수·빌더 함수가 기대 문자열을 내는지, 파라미터 삽입이 정확한지 검증. 6. 정합성 점검: `ROUTES`의 절대경로가 [PrivateRoutes.tsx](../src/app/routes/private/PrivateRoutes.tsx)·각 feature `routes/index.tsx`의 실제 path 조합과 1:1로 맞는지 대조.

**C. 호출부 마이그레이션 (feature 단위 분할 커밋)** 7. `navigate(`, `<Navigate to=`, `<Link to=`, `redirect(`의 하드코딩 절대경로를 `ROUTES.*`로 치환. 라우터 코어([routes/index.tsx](../src/app/routes/index.tsx))의 `/`·`/auth/login` 포함. 8. `useParams<{ ... }>()` 제네릭을 `ROUTE_PARAMS` 기반으로 교체. 9. 회귀 확인: 전수 grep으로 잔여 하드코딩 절대경로 0건, `tsc` 통과, 주요 플로우 수동 확인.

## 6. 리스크와 미지수

- **workspace 컴포넌트 이동 누락**: `InviteCodeCard`/`VisibilityToggle`의 내부 의존(훅·타입)이 workspace에 더 있을 수 있음 → 이동 후 즉시 `tsc`로 확인.
- **ExplorePage 탭 제거 영향**: `'rooms' | 'workspaces'` 상태·탭 UI 제거 시 빈 탭 레이아웃 깨짐 가능 → rooms 단일 뷰로 단순화하며 시각 확인.
- **상대/절대 혼동**: feature 내부 상대 `navigate('edit')`을 `ROUTES`(절대)로 바꾸면 동작이 달라짐 → 치환 전 각 호출부 상대/절대 확인. 절대경로만 치환.
- **GlobalBridgeListener**: 네이티브가 던지는 path는 외부 입력 → 수신부는 그대로, 내부 생성 경로만 `ROUTES` 사용.
- **누락 grep**: 동적 조립(삼항·문자열 결합)을 놓칠 수 있음 → 치환 후 `'/`로 시작하는 리터럴 재점검.
- **롤백**: A(workspace 제거)·B(빌더 도입)·C(치환)를 분리 커밋 → 단계별 되돌림 가능.

## 7. 검증 결과

- **유닛 테스트**: `app/routes/paths.test.ts` 12개 통과 — 모든 상수·파라미터 빌더 출력 검증.
- **타입 체크**: `tsc -p tsconfig.app.json` 기준 베이스라인 **269 → 238** (순감 31, workspace 제거 효과). 본 작업이 새로 유발한 에러 0건. 나머지 238개는 진행 중인 런타임 마이그레이션의 기존 에러(`@chatic/web-core` export 누락 등)로 본 작업과 무관.
- **정적 점검**: 잔여 하드코딩 절대경로(navigate/`to=`) **0건**, 잔여 `workspace` 참조 **0건**.
- **브라우저 검증 보류**: 현재 브랜치는 런타임 마이그레이션 미완으로 앱이 정상 기동되지 않아(미관련 import 에러) preview 실증 불가. 마이그레이션 완료 후 로그인→홈→채팅방→설정, 마이페이지·구독·정책, 채팅방 생성(이동한 컴포넌트), explore/join 플로우를 수동 확인할 것.

## 8. 후속 메모

- **`ROUTE_PARAMS` 적용 보류(의도적)**: 빌더·테스트로 노출은 했으나, 기존 `useParams<{ channelId: string }>()`를 `useParams<Record<typeof ROUTE_PARAMS.channelId, string>>()`로 바꾸면 오히려 가독성이 떨어져 1차에서는 useParams 제네릭을 그대로 두었다. 동적으로 파라미터 키 문자열이 필요한 곳에서 opt-in으로 사용.
- **i18n 키**: 번역 리소스는 원격(`/locales/{{lng}}/{{ns}}.json`)에서 로드되므로 리포에 JSON이 없다. 코드의 `t('explore.tabs.workspaces')`·`t('join.workspace')` 호출은 제거했고, 원격 번역의 `workspace.*` 키 정리는 번역 서버 측 작업으로 남는다.
- **상대 경로 `Route path`**: feature `routes/index.tsx`의 상대 경로는 그대로 유지. 경로 변경 시 `paths.ts`와 함께 본다.
