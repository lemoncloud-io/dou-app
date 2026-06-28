# auth — 초대 수락 흐름

> 대상: `useInviteAccept` · `useInviteCloudEntry` · `types/auth.ts`

딥링크 형식 초대 링크를 통한 클라우드 진입을 단일 책임 레이어로 분해한 흐름.

## 딥링크 계약

딥링크는 **`code`, `_backend`, `_version`만** 전달한다. cloud/site 식별자는 **로그인 토큰**에서 나온다. `parseInviteDeeplink`(`types/auth.ts`)는 이 3개만 파싱하고 `isInviteDeeplink`로 초대 여부를 판별한다.

> 과거에 cloud/site id까지 딥링크에 싣던 방식과 달리, 식별자는 토큰을 신뢰 출처로 삼는다.

## 수락 단계

```
useInviteAccept
  └─ runInviteFlow({ code, backend })        // web-core: 로그인만 수행, UserTokenView 반환
       └─ useInviteCloudEntry.enterInvitedCloud(token)
            ├─ switchCloud(token.cloudId)
            ├─ switchSite(token.siteId ?? token.sid)
            └─ navigate(ROUTES.home)
```

- `useInviteFlow`(web-core)는 **로그인만 하고 토큰을 반환**한다. 캐시 저장 콜백·클라우드 전환을 내부에서 하지 않는다.
- `enterInvitedCloud`가 토큰의 `cloudId`/`siteId`로 일반 `switchCloud`/`switchSite`를 호출한다 — 초대 전용 분기 없이 일반 전환 경로로 통일.
- 초대 클라우드 캐시 저장, 동기화 플래그, 수동 selected-id 쓰기는 없다(전부 web-core가 처리).

## 역할 분리

- `LoginPage`는 UI 상태(loading/error/done)만.
- 파싱은 `types/auth.ts`, 오케스트레이션은 `useInviteAccept`/`useInviteCloudEntry`.

## 검증

- `types/auth.test.ts` — 딥링크 파싱/판별.
- web-core `useInviteFlow.test.ts` — 로그인+토큰 반환/예외.
