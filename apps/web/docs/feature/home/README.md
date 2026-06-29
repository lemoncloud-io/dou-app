# home

> 대상: `apps/web/src/app/features/home` · 참조 구현: `apps/testbed/src/app/pages/ChatHomePage.tsx`

## 책임

메인 화면(`/`)이다. 활성 클라우드의 **Place 목록**과 **활성 사이트의 Channel 목록**을 보여주고, **Place 전환**·**클라우드 전환(CloudSessionSheet)**·**미읽음 집계**를 담당한다. 최초 실행 시 [onboarding](../onboarding/README.md) 모달을 오버레이로 띄운다.

## 화면

| 페이지     | 경로                | 설명                                                  |
| ---------- | ------------------- | ----------------------------------------------------- |
| `HomePage` | `/` (`ROUTES.home`) | 헤더 + Place 목록 + Channel 목록 + 클라우드 전환 시트 |

## 구조

```
features/home/
  types/       # 상태 엔티티/뷰 타입 (DomainChannel/DomainPlace re-export + ChannelUnreads)
  hooks/       # 읽기·쓰기 액션 훅 (아래)
  components/  # PlaceList, ChannelList, CloudSessionSheet, 다이얼로그 (→ components.md)
  pages/HomePage.tsx
  index.ts     # HomeRoutes
```

주요 훅:

| 훅                                  | 역할                                |
| ----------------------------------- | ----------------------------------- |
| `useHomePlaces`                     | place 목록 관측                     |
| `useHomeChannels(sid)`              | 활성 사이트 채널 목록 관측          |
| `useSwitchPlace`                    | 플레이스 전환(`useSiteSwitch` 래핑) |
| `useChannelUnreads`                 | 채널별/총 미읽음 계산               |
| `useCreatePlace` / `useUpdatePlace` | place 생성/수정(`repos.place`)      |

## 데이터 흐름

repository observe + per-item sync 등록 모델([architecture/data-flow.md](../../architecture/data-flow.md)).

- **플레이스 목록** — `useHomePlaces`가 `repos.place.observeList`를 구독한다. 활성 클라우드(cid)가 바뀌면 재구독하고 이전 클라우드 행을 폐기한다. `isVerified`가 되면 `place.refreshList()`로 스냅샷을 당겨온다(전환 낙관 구간 stale fetch 회피).
- **채널 목록** — `useHomeChannels(sid)`가 `repos.channel.observeList({ sid })`를 구독한다. relay 클라우드 캐시는 sid 격리가 안 되므로 결과를 `sid`로 한 번 더 필터한다(전환 직후 이전 사이트 채널 깜빡임 방지).
- **플레이스 전환** — `useSwitchPlace`가 `useSiteSwitch().switchSite`를 호출한다(낙관 선반영·커밋·롤백 내장). 활성 사이트가 없으면 목록 첫 플레이스를 자동 선택. 선택 상태는 `useSessionSelection().selectedSiteId`에서 읽는다.
- **동기화 등록** — 렌더되는 항목이 직접 등록: `PlaceItem` → `usePlaceSync`, `ChannelItem` → `useChannelSync` + `useJoinSync`. 마운트/언마운트에 따라 자동 정리된다.

## 미읽음 계산

채널 단위 미읽음 = **channel과 join의 chatNo 차분**:

```
unread(channel) = max(0, (channel.lastChat$?.chatNo ?? channel.chatNo ?? 0) - myJoin.readNo)
```

`useChannelUnreads(channels)`가 `repos.join.observeList({})`를 한 번 구독해(현재 유저로 필터) 채널별 unread map과 총합을 도출한다. readNo는 per-channel `useJoinSync`로 실시간 동기화된다.

## 클라우드 전환 시트 (CloudSessionSheet)

- 프로필 → `useSessionIdentity().activeProfile.$user`
- 내 클라우드 → `useCloudSessionCatalog()`; 초대 클라우드 → `repos.cloud.observeList`에서 `cloudType === 'invited'` 필터; owned = 카탈로그 − 초대 id
- 전환 → `useSwitchCloudSession().switchCloud`; **연결끊기 → `useLogoutCloudSession().logoutCloudSession`**(relay 인증은 유지)
- 활성 선택 → `useSessionSelection().selectedCloudId` 파생
- 프로비저닝 상태 뱃지/폴링, 계정 추가, 클라우드 이름 편집(`useUpdateCloud`)은 보존

> 초대 클라우드도 클릭 시 `switchCloud`로 동작한다(캐시가 실제 cid를 보유).

## 미구현(의도적 부재)

플레이스 순서변경, 생성 제한 게이팅 다이얼로그, 헤더 검색 모달, 플레이스별 미읽음 뱃지는 제거됐다. 생성 가능 여부는 `useSessionIdentity().permissions`로만 판단한다.

## 사이트 프로필 진입점

홈 헤더의 프로필은 사이트 활성 시 [mypage의 site-profile](../mypage/site-profile.md)로 진입한다. 헤더 표시도 사이트 프로필(V2 관측)을 읽는다.
