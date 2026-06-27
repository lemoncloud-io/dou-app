# Home 피쳐 — 데이터 레이어 런타임 마이그레이션

> 작성일: 2026-06-25 · 브랜치: `feature/raine-migrate-socket`

`apps/web/src/app/features/home`의 데이터 레이어를 구 소켓 스택(`@chatic/socket` +
`cloudCore` + `useWebCoreStore`)에서 신규 런타임(`@chatic/app-runtime` repos +
`@chatic/web-core` 세션 훅)으로 재구축한 작업 기록. 참조 구현은
`apps/testbed/src/app/pages/ChatHomePage.tsx`.

## 배경

이 브랜치에서 구 데이터 훅(`usePlaces`, `useChannels`, `usePlaceUnreadCounts`,
`useTotalUnreadCount` 등)이 삭제되면서 `HomePage`가 깨진 상태였다. 본 작업은 home의
목록·전환·미읽음을 신규 런타임으로 다시 배선했다.

## 아키텍처

```
features/home/
├── types/                  # 상태 관련 엔티티/뷰 타입만 (React 훅 없음)
│   └── index.ts            #   DomainChannel/DomainPlace re-export + ChannelUnreads
├── hooks/                  # 읽기·쓰기 액션 훅 전부
│   ├── useHomePlaces.ts    #   place 목록 관측
│   ├── useHomeChannels.ts  #   활성 사이트 채널 목록 관측
│   ├── useSwitchPlace.ts   #   플레이스 전환 (useSiteSwitch 래핑)
│   ├── useChannelUnreads.ts#   채널별/총 미읽음 계산
│   ├── useCreatePlace.ts   #   place 생성 (repos.place)
│   ├── useUpdatePlace.ts   #   place 수정 (repos.place)
│   └── useUpdateMyProfile.ts (※ 아직 old-stack — 후속 마이그레이션 대상)
├── components/
│   ├── PlaceList.tsx + PlaceItem.tsx
│   ├── ChannelList.tsx
│   └── CloudSessionSheet.tsx (※ 아직 old-stack — cloud-session-sheet-plan.md 참조)
└── pages/HomePage.tsx
```

## 데이터 흐름

- **플레이스 목록** — `useHomePlaces`가 `repos.place.observeList`를 구독한다. 활성 클라우드
  (`useGlobalSession().activeServer`의 cid)가 바뀌면 재구독하고 이전 클라우드 행을 폐기한다.
  세션이 verified가 되면(`useSocketState().isVerified`) `place.refreshList()`로 스냅샷을 당겨온다 —
  전환 낙관 구간의 stale fetch를 피하기 위함(testbed 패턴).
- **채널 목록** — `useHomeChannels(sid)`가 `repos.channel.observeList({ sid })`를 구독한다.
  relay 클라우드의 캐시 읽기는 sid 격리가 안 되므로 결과를 `sid` 기준으로 한 번 더 필터한다
  (전환 직후 이전 사이트 채널이 깜빡이는 것 방지).
- **플레이스 전환** — `useSwitchPlace`가 `@chatic/web-core`의 `useSiteSwitch().switchSite`를
  호출한다. 낙관적 sid 선반영·커밋·롤백은 `switchSite` 내부에 있다. 활성 사이트가 없으면
  목록의 첫 플레이스를 자동 선택한다. 선택 상태는 `useSessionSelection().selectedSiteId`에서 읽는다.
- **동기화 등록** — 렌더되는 항목이 직접 sync 타깃을 등록한다(per-item):
  - `PlaceItem` → `usePlaceSync(place.id)`
  - `ChannelItem` → `useChannelSync(channel.id)` + `useJoinSync(channel.id)`
  등록/해제는 마운트·언마운트에 따라 자동 처리되며 동기화 스케줄도 런타임이 알아서 돌린다.

## 미읽음 계산

채널 단위 미읽음은 **join과 channel의 chatNo 차분**으로 계산한다(chatic 모델:
`max(0, channel.chatNo - join.readNo)`).

```
unread(channel) = max(0, (channel.lastChat$?.chatNo ?? channel.chatNo ?? 0) - myJoin.readNo)
```

`useChannelUnreads(channels)`는 `repos.join.observeList({})`를 한 번 구독해 전체 join을 받고
(현재 유저 `userId`로 필터), 채널별 unread map과 총합을 도출한다. readNo는 per-channel
`useJoinSync` 등록으로 실시간 동기화된다. 총합은 하단 네비 뱃지(`totalUnread`)에 쓰인다.

## 변경된 동작 (의도적 제거)

- **순서변경 제거** — `cloudCore.getPlaceOrder` 정렬, 순서 관리 페이지 네비(`ROUTES.place.order`),
  PlaceList의 "설정" 버튼 제거.
- **제한 게이팅 제거** — 최대 채널/플레이스 수, 구독 게이팅 다이얼로그(`LimitExceededDialog`) 제거.
  생성 가능 여부는 세션 권한(`useSessionIdentity().permissions`)으로만 판단.
- **디버그 패널 제거** — HomePage의 `IS_DEV` 디버그 다이얼로그/버튼 제거.
- **SearchModal 제거** — 헤더 검색 버튼과 모달 사용 제거.
- **플레이스별 미읽음 뱃지(`placeUnreadCounts`) 미구현** — 활성 사이트 채널만 관측하므로 타
  플레이스 미읽음 데이터가 없음. 필요 시 별도 소스 설계 필요(후속).

## 검증

- 유닛 테스트: `useChannelUnreads.test.ts`(차분·음수 보정·fallback), `useSwitchPlace.test.ts`
  (자동 선택·전환 가드) — 7건 통과.
- 타입체크: 본 작업이 생성/수정한 home 파일 0 에러.
- 브라우저 검증은 보류 — 브랜치 전역(auth/channels/mypage)이 마이그레이션 중이라 앱 부팅 불가.

## home 피쳐 마이그레이션 완료 상태

home 피쳐 전체가 신규 런타임으로 마이그레이션되어 **타입체크 0 에러**다.

- `CloudSessionSheet.tsx` 완료 → [cloud-session-sheet-plan.md](./cloud-session-sheet-plan.md)
- `useUpdateMyProfile.ts` / `ProfileEditModal.tsx` 는 제거됨(old-stack, 사용처 없음)
- components 폴더 구조/정리 → [components-structure.md](./components-structure.md)

### 범위 외 (다른 피쳐)

- `mypage/.../DebugBadgeCountPage.tsx`가 삭제된 `usePlaceUnreadCounts`를 import — 별도 작업 필요
