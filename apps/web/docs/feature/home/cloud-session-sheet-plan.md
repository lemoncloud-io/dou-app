# CloudSessionSheet 런타임 마이그레이션

> 작성일: 2026-06-25 · 상태: 완료 · 참조: `apps/testbed/src/app/pages/ChatHomePage.tsx`

## 구현 결과 (요약)

- ProfileSection → `useSessionIdentity().activeProfile.$user`
- 내 클라우드 → `useCloudSessionCatalog()`; 초대 클라우드 → `repos.cloud.observeList`에서
  `cloudType === 'invited'` 필터; owned = 카탈로그 − 초대 id
- 전환 → `useSwitchCloudSession().switchCloud`; **연결끊기 → `useLogoutCloudSession().logoutCloudSession`**
- 활성 선택 → `useSessionSelection().selectedCloudId` 파생(로컬 state 제거)
- 구독/계정추가/이름편집/프로비저닝 폴링은 보존. 미사용 prop `onCloudSwitchComplete`,
  미사용 state(`isSubscriptionAvailable`, email-verify) 제거
- 타입체크: home 피쳐 0 에러

이하는 구현 전 작성한 준비 내용(매핑·근거)이며 기록으로 보존한다.

`features/home/components/CloudSessionSheet.tsx`를 신규 런타임으로 옮기기 위한 준비 문서.
아직 구현하지 않았고, 방향과 매핑만 정리한다. [runtime-migration.md](./runtime-migration.md)의 후속.

## 1. 목표

CloudSessionSheet의 클라우드 목록/전환/로그아웃을 구 스택(`cloudCore`, `useWebCoreStore`,
`useCloudSession`, `useCloudSwitchFlow`, `useInviteClouds`)에서 신규 런타임 세션 훅 + repos로
교체해 빌드/동작을 복구한다. UI(시트 레이아웃, 탭, 프로비저닝 폴링, 구독/계정추가, 이름 편집)는
최대한 보존한다.

## 2. 범위

- 포함: 프로필 표시, 내 클라우드 목록, 초대 클라우드 목록, 클라우드 전환, **연결끊기(=클라우드 세션 로그아웃)**,
  활성 클라우드 선택 상태.
- 유지(거의 그대로): 프로비저닝 상태 뱃지/폴링, 계정 추가(`SubscriptionSelectDialog`), 클라우드 이름
  편집(`CloudNameEditDialog` + `useUpdateCloud`), 구독 가용성(`useIsSubscriptionAvailable`),
  `cloudsKeys` 캐시 무효화 — 이들 API는 신규 스택에 그대로 존재함(확인 완료).
- 제외: 시트 UX 재설계, 멀티 클라우드 계정(현재 1개 제한 로직) 변경.

## 3. 현재 상태 — 깨진 의존성과 대체 매핑

현재 파일이 import하는 제거/삭제된 심볼과, 신규 런타임에서의 대체:

| 현재 (broken) | 대체 (신규 런타임) | 비고 |
|---|---|---|
| `useWebCoreStore(s => s.profile)` (ProfileSection) | `useSessionIdentity().activeProfile` (`$user.name/email/photo`) | runtime-migration의 HomePage 헤더와 동일 소스 |
| `useCloudSession()` → `{ clouds, isCloudsError, isFetchingClouds, refetchClouds, isPending }` | `useCloudSessionCatalog()` → `{ clouds, isCloudsError, isFetchingClouds, isPendingClouds, refetchClouds }` | 내가 만든(owned) 클라우드 카탈로그. testbed 사용 |
| `useInviteClouds()` → `{ inviteClouds: DomainListResult }` | `repos.cloud.observeList(cb)` 구독 후 `cloudType === 'invited'` 필터 | 초대 클라우드는 캐시에 있고 카탈로그엔 없음 (testbed L69-74) |
| `useCloudSwitchFlow().switchCloud` | `useSwitchCloudSession()` → `{ switchCloud, isPending }` | 클라우드 전환. testbed `handleCloudClick` |
| `handleSwitchToDefault` (`cloudCore.clearDelegationToken` + `setIsVerified(false)`) | `useLogoutCloudSession()` → `{ logoutCloudSession, isLoggingOutCloudSession }` | **연결끊기 = 클라우드 세션 로그아웃**. relay 인증은 유지 |
| `cloudCore.getSelectedCloudId()` (selectedId 초기값/비교) | `useSessionSelection().selectedCloudId` 또는 `useGlobalSession().activeServer`의 cid | 활성 클라우드. relay면 'default' |

testbed의 owned/invited 분리(L198-200):
```
const invitedCloudIds = new Set(invitedClouds.map(c => c.id ?? ''));
const ownedClouds = clouds.filter(c => !invitedCloudIds.has(c.id ?? ''));
```

## 4. 설계 방향

- **목록 소스 일원화** — 내 클라우드 = `useCloudSessionCatalog().clouds`, 초대 클라우드 =
  `repos.cloud.observeList`에서 `cloudType === 'invited'`. owned는 invited id를 제외(중복 방지).
  현재 시트의 `my`/`invited` 탭 구조에 그대로 매핑.
- **전환/로그아웃을 testbed handleCloudClick과 동일 의미로** —
  - 클라우드 항목 클릭 → `switchCloud(cloudId)` (초대 클라우드도 동일 경로; 캐시가 실제 cid 보유).
  - "연결끊기" 버튼 → `logoutCloudSession()` (default/relay 복귀). 기존 `handleSwitchToDefault`의
    `cloudCore`/`setIsVerified` 수동 처리 제거.
- **활성 표시·낙관 상태** — `selectedId` 로컬 state 대신 `selectedCloudId`(세션)에서 파생.
  전환 pending은 `useSwitchCloudSession().isPending`, 로그아웃 pending은
  `useLogoutCloudSession().isLoggingOutCloudSession`로 버튼 disable.
- **보존 로직** — 프로비저닝 상태(`isProvisioning`) 뱃지/30초 폴링(`refetchClouds`), reserved→active
  토스트, 계정 추가/구독, 이름 편집은 신규 카탈로그 데이터 위에서 그대로 동작.

## 5. 구현 단계(예정)

1. ProfileSection: `useSessionIdentity().activeProfile.$user` 사용으로 교체.
2. 내 클라우드: `useCloudSession` → `useCloudSessionCatalog`. 반환 필드명 차이(`isPending` →
   `isPendingClouds`) 반영.
3. 초대 클라우드: `useInviteClouds` 제거 → `repos.cloud.observeList` 구독 effect 추가,
   `cloudType==='invited'` 필터. 탭 카운트/리스트를 이 상태로 연결.
4. owned = 카탈로그 − invited id (testbed 식).
5. 전환: `useCloudSwitchFlow` → `useSwitchCloudSession().switchCloud`. `handleSelectCloud` 단순화.
6. 연결끊기: `handleSwitchToDefault` → `useLogoutCloudSession().logoutCloudSession`.
7. 활성/선택 상태: `cloudCore.getSelectedCloudId` → `useSessionSelection().selectedCloudId` 파생.
8. 잔여 `cloudCore`/`useWebSocketV2Store` 참조 제거, import 정리.
9. 타입체크 + (가능 시) 시트 상호작용 유닛/통합 확인.

## 6. 리스크 / 확인 필요

- **초대 클라우드 전환 경로** — 초대 클라우드 클릭도 `switchCloud`로 동작하는지(캐시의 실제 cid 해석)
  testbed 주석(L184-186) 기준 확인. delegate 교환이 account-no가 아닌 cid로 풀리는지 검증.
- **반환 필드명/형태 차이** — `useCloudSessionCatalog`는 `DomainListResult`가 아니라 `clouds` 배열을
  직접 반환. 기존 `inviteClouds?.meta.total` 같은 접근부를 새 형태에 맞게 수정.
- **`onCloudSwitchComplete`(placeId) 콜백** — 신규 전환 플로우에서 전환 후 place 선택을 어떻게
  통지할지. HomePage가 `useSwitchPlace`로 place를 다루므로 이 콜백이 더 이상 필요 없을 수 있음 →
  HomePage 연동 시 정리.
- **`onCloudSwitchComplete` 제거 시 HomePage prop 영향** — 현재 HomePage는 이 prop을 안 넘김(무방).

## 7. 검증 방법

- 타입체크: CloudSessionSheet 0 에러.
- 동작: 내 클라우드/초대 클라우드 목록 표시, 전환, 연결끊기(relay 복귀), 프로비저닝 폴링.
- 앱 전역 마이그레이션 완료 후 preview에서 시트 열기→전환→연결끊기 플로우 확인.
