# Frontend Hooks 핸드오버 문서

> dou-app 프론트엔드의 주요 훅별 내부 로직 정리.
> 각 훅이 **왜 이렇게 구현됐는지**, 주의할 점 위주로 서술.

---

## 목차

1. [인증/세션](#1-인증세션)
2. [채널 목록](#2-채널-목록)
3. [메시지(채팅)](#3-메시지채팅)
4. [Place/Site](#4-placesite)
5. [프로필](#5-프로필)
6. [WebSocket](#6-websocket)
7. [포그라운드 복귀/동기화](#7-포그라운드-복귀동기화)
8. [검색](#8-검색)
9. [기타](#9-기타)

---

## 1. 인증/세션

### useTokenRefresh

`libs/web-core/src/hooks/useTokenRefresh.ts`

OAuth 토큰 갱신 + 앱 초기화.

**초기화 흐름**:

1. `refresh()` + `tryFetchProfile()` 병렬 실행 (optimistic)
2. 실패 시 캐시 프로필 + 백그라운드 refresh
3. 캐시도 없으면 `fetchProfile()` 풀 호출 + 재시도

**주의사항**:

- 중복 호출 방지: 마지막 갱신으로부터 5초 gap 필요
- 네트워크 에러는 최대 3회 재시도 (exponential backoff)
- 초대 플로우 중 토큰 만료 시 cloud 상태 보존
- 60초 주기 갱신 + visibility change 시 재시도

### useCloudSession

`apps/web/src/app/shared/hooks/useCloudSession.ts`

클라우드 선택 + delegation token 발급.

**selectCloud 내부 흐름**:

1. `issueCloudToken(cloudId)` → delegation token 발급
2. `cloudCore.saveDelegationToken()` → sessionStorage 저장
3. `useWebSocketV2Store.setCloudId()` → Zustand 갱신

**같은 클라우드 재선택 시**: place 유지.
**다른 클라우드 선택 시**: place 초기화 + place 순서 캐시 클리어.

### useCloudSwitchFlow

`apps/web/src/app/shared/hooks/useCloudSwitchFlow.ts`

클라우드 전환 전체 파이프라인 (5단계).

```
selectCloud → waitForVerified(10s) → fetchPlaces → authPlace → fetchChannels
```

**롤백**: 실패 시 이전 cloud 복원, 없으면 `'default'` fallback.
**동시 실행 방지**: `switchingRef`로 중복 호출 차단.

### usePlaceSession

`apps/web/src/app/shared/hooks/usePlaceSession.ts`

Place 선택 + cloud token 재발급.

**selectPlace 흐름**:

1. `issueCloudToken(cloudId, placeId)` → 새 cloud token
2. 로컬 커스텀 필드(thumbnail 등) 보존하면서 token 저장
3. `cloudCore` + `useWebSocketV2Store` 양쪽 갱신

### useCloudTokenRefresh

`apps/web/src/app/shared/hooks/useCloudTokenRefresh.ts`

Cloud token 주기적 갱신 + auth:update 재시도.

- **재시도 전략**: exponential backoff (최대 3회, 16초 간격)
- **주기적 갱신**: verified 상태에서 60초마다
- **인증 에러**: `'default'` 클라우드로 fallback
- `_skipAutoAuth` 전역 플래그: 수동 토큰 갱신 중 자동 인증 방지

---

## 2. 채널 목록

### useChannels

`apps/web/src/app/shared/hooks/useChannels.ts`

채널 리스트 조회 + 실시간 구독 + 동기화.

**데이터 로딩 전략**:

```
1. isVerified 전: cache-only로 IndexedDB에서 즉시 로딩 (빈 화면 방지)
2. isVerified 후: cache-first → network-only (서버 최신 데이터로 교체)
3. subscribeList: 캐시 변경 감지 → UI 자동 갱신
```

**cloud/place 전환 감지** (렌더 단계):

```typescript
if (prevCloudId !== cloudId || prevPlaceId !== targetPlaceId) {
    setChannels([]); // 이전 데이터 flash 방지
    setIsLoading(true);
}
```

**레이스 컨디션 방어**:

- `requestSeqRef`: 네트워크 응답 순서 보장 (stale response 무시)
- `prevFetchKeyRef`: 같은 cloud:place 키에 대한 중복 fetch 방지
- subscription 콜백에서 빈 데이터로 덮어쓰기 방지 guard 존재

**필터링**:

```typescript
channels: currentWSS === 'cloud' ? channels.filter(c => !!c.$?.sid) : channels;
```

cloud 모드에서는 `$?.sid`가 있는 채널만 노출. relay 모드에서는 전체 노출.

**모듈 레벨 변수** (`lastFetchedCloudId`, `lastFetchedPlaceId`):
컴포넌트 재마운트 vs 실제 전환을 구분하기 위해 모듈 스코프에서 추적.

### useChannel

`apps/web/src/app/shared/hooks/useChannel.ts`

단일 채널 상세 조회.

- channel + join 동시 구독 → memberCount 계산
- `ClientChannelView` 변환: `isOwner`, `isSelfChat`, `memberCount`, `unreadCount` 추가

### useChannelMembers

`apps/web/src/app/shared/hooks/useChannelMembers.ts`

채널 멤버 목록.

- **cache-first** 후 10초 주기 폴링
- `join:create` / `join:delete` 이벤트 수신 시 즉시 refetch
- 유저 정보 누락 시 전체 목록 재요청

### useChannelMutations

`apps/web/src/app/shared/hooks/useChannelMutations.ts`

채널 CRUD: `createChannel`, `leaveChannel`, `deleteChannel`, `updateChannel`, `inviteChannel`.

- leave/delete 시 해당 채널의 chat 캐시도 함께 클리어

---

## 3. 메시지(채팅)

### useChats

`apps/web/src/app/shared/hooks/useChats.ts`

메시지 리스트 + 페이지네이션 + pending 처리.

**병합 전략** (`mergeAndSortMessages`):

```
- incoming 범위 내: incoming이 source of truth (삭제 감지)
- incoming 범위 밖: 기존 데이터 유지 (loadMore 데이터 보존)
- pending/failed: 항상 보존
```

**pending 메시지 타임아웃**:

- 10초 후 `isFailed = true` 자동 전환
- 사용자에게 실패 UI 노출

**loadMore 안전장치**:

- `isLoadingMoreRef`: 동시 loadMore 호출 차단
- 500ms 쿨다운: DOM 업데이트 후 스크롤 이벤트 연쇄 방지

### useChatMutations

`apps/web/src/app/shared/hooks/useChatMutations.ts`

`sendMessage`, `readMessage`, `deleteMessage`.

- delete는 로컬 캐시에서만 제거 (서버 요청 없음)

### useChatSync

`apps/web/src/app/shared/hooks/useChatSync.ts`

백그라운드 메시지 동기화.

- `ChatSyncScheduler`: serverChatNo vs localMaxChatNo 비교 → gap fetch
- `isVerified = false` → 스케줄러 정지
- 탭 hidden → 일시정지, visible → 재개
- 채널 목록 변경 시 정리 안 함 (중복 fetch 방지)

### useJoinPositions

`apps/web/src/app/shared/hooks/useJoinPositions.ts`

채널 내 멤버 읽음 위치 추적 (읽은 사람 수 계산용).

**병합 전략**: 항상 큰 `chatNo` 유지 (다운그레이드 방지).

- 캐시 먼저 로드 → 네트워크 데이터와 merge
- `join:create/update/delete` 이벤트 실시간 반영
- stale 네트워크 응답이 최신 join 이벤트를 덮어쓰지 않도록 guard

---

## 4. Place/Site

### usePlaces

`apps/web/src/app/shared/hooks/usePlaces.ts`

Place 목록 조회.

**모듈 레벨 캐시**: unmount/remount 시 flash 방지용 모듈 스코프 변수.

**초대 수락 후 동기화**:

- `consumeInvitePlaceSyncFlag()` → network-only fetch
- 첫 fetch가 빈 결과면 2초 후 재시도 (서버 반영 지연 대응)

**이벤트 구독**: `onSiteCreated` / `onSiteUpdated` → network-only 갱신.

### usePlaceMutations

`apps/web/src/app/shared/hooks/usePlaceMutations.ts`

`makeSite`, `updateSite`, `updatePlaceOrder`.

- `updatePlaceOrder(placeIds)`: 순서 배열 받아서 각 place에 `order` 필드 bulk update

### useCanCreatePlace / useCanCreateChannel

`apps/web/src/app/shared/hooks/useCanCreatePlace.ts`
`apps/web/src/app/shared/hooks/useCanCreateChannel.ts`

생성 권한 체크. 내 클라우드 여부 + 개수 제한 확인.

- default cloud(relay 모드)에서는 채널 생성 불가
- Guest: 3개 제한, 일반: 100개 제한

### usePlaceUnreadCounts

`apps/web/src/app/shared/hooks/usePlaceUnreadCounts.ts`

Place별 안읽은 메시지 수 집계 (사이드바 뱃지용).

- **이벤트 디바운싱**: channel/chat/join 이벤트 발생 시 1초 디바운스
- **폴링**: 30초 주기
- **네이티브 뱃지**: iOS/Android OS 뱃지 카운트 연동

---

## 5. 프로필

### useDynamicProfile

`libs/web-core/src/hooks/useDynamicProfile.ts`

WebCore 프로필 + cloud token 프로필 병합.

- cloud 프로필이 우선 (클라우드별 다른 이름/사진 가능)

### useUserContext

`libs/web-core/src/hooks/useUserContext.ts`

유저 타입/권한/WSS 타입 파생.

**UserType 분류**:
| 타입 | 조건 |
|------|------|
| `TEMP_ACCOUNT` | profile.role이 없음 |
| `SOCIAL_NO_CLOUD` | role 있음, cloud token 없음 |
| `SOCIAL_WITH_CLOUD` | role 있음, cloud token 있음 |
| `INVITED` | isInvited, cloud token 없음 |
| `INVITED_WITH_CLOUD` | isInvited, cloud token 있음 |

**currentWSS 결정**:

```typescript
cloudCore.getWss() 존재 → 'cloud'
없으면 → 'relay'
```

sessionStorage에서 직접 읽음 (React state 아님, 매 렌더마다 최신값).

### useUpdateMyProfile

`apps/web/src/app/features/home/hooks/useUpdateMyProfile.ts`

WebSocket으로 프로필 업데이트.

- `emit({ type: 'user', action: 'update-profile', payload })`
- `lastMessage` 스토어 구독으로 응답 감지 (10초 타임아웃)

### useSiteProfile

`apps/web/src/app/shared/hooks/useSiteProfile.ts`

Place별 프로필 (닉네임 등) 조회/수정.

- `fetchSiteProfile()` → `userRepository.getSiteProfile()`
- `updateSiteProfile({ nick })` → `userRepository.setSiteProfile(body)`
- **현재 상태**: Repository 메서드 미구현. 훅 시그니처만 존재.

---

## 6. WebSocket

### useWebSocketV2

`libs/socket/src/hooks/useWebSocketV2.ts`

V2 WebSocket 메인 훅. 앱 전체에서 싱글턴으로 사용.

**메시지 포맷 변환**: `WSSEnvelope(v1)` ↔ `SocketMessage(v2)` 양방향 컨버팅.

**send 메서드 3종**:
| 메서드 | 조건 | 용도 |
|--------|------|------|
| `send()` | 즉시 전송 | verified 보장된 상황 |
| `emit()` | connected 대기 | 연결 후 전송 |
| `emitAuthenticated()` | verified 대기 | 인증 완료 후 전송 |

**이벤트 처리**:

- `device.save:ok` → `isDeviceRegistered = true`
- `auth.update:ok` → `isVerified = true`

**초기화 가드**: `clientRef` 체크로 이중 초기화 방지 + 0ms setTimeout으로 rapid re-render 방어.

### useSocketAuth

`apps/web/src/app/shared/hooks/useSocketAuth.ts`

WebSocket 연결 시 인증 토큰 전송.

- `cloudCore.getIdentityToken()` 우선, 없으면 `webCore` fallback
- `connected && authenticated` 상태에서만 실행

---

## 7. 포그라운드 복귀/동기화

### useForegroundResync

`apps/web/src/app/shared/hooks/useForegroundResync.ts`

탭 복귀 시 토큰 갱신 + cloud token 갱신.

- `visibilitychange` (웹) + `OnBackgroundStatusChanged` (네이티브)
- **최소 5초 gap**: 짧은 전환은 무시

### useConnectionRecoverySync

`apps/web/src/app/shared/hooks/useConnectionRecoverySync.ts`

WebSocket 재연결 시 데이터 동기화 트리거.

- 포그라운드 복귀 이벤트 + `isVerified` false→true 전이 감지
- `requestFromLocal` (캐시 읽기) + `requestFromNetwork` (서버 요청) 순차 호출

### useForegroundTokenRefresh

`apps/web/src/app/shared/hooks/useForegroundTokenRefresh.ts`

탭 visible 시 소켓 health + 토큰 갱신.

- 300ms 디바운스 (rapid visibility toggle 방지)
- 소켓 alive 상태일 때만 auth 재전송

---

## 8. 검색

### useSearch

`apps/web/src/app/features/search/hooks/useSearch.ts`

Place + 메시지 통합 검색.

- **300ms 디바운스** 후 검색 실행
- Place: 이름 case-insensitive 매칭
- Channel: IndexedDB에서 전체 채널 로드 → 메모리 병합
- Message: 각 채널별 IndexedDB 병렬 검색
- 결과: 메시지 매칭 수 기준 내림차순 정렬

### useRecentSearches

`apps/web/src/app/features/search/hooks/useRecentSearches.ts`

최근 검색어 localStorage 관리. 최대 10개, 중복 제거.

---

## 9. 기타

### useBackHandler

`apps/web/src/app/shared/hooks/useBackHandler.ts`

하이브리드 앱 뒤로가기 처리.

**우선순위**:

1. Radix UI 다이얼로그 열려있으면 → 닫기 (최상위부터)
2. `data-prevent-back-close` 속성 있으면 → 무시
3. AlertDialog → 버튼 클릭으로 닫기 (Escape 미지원)
4. 그 외 → `navigate(-1)`

### useCreateInviteBatch

`apps/web/src/app/features/chats/hooks/useCreateInviteBatch.ts`

초대 링크/배치 초대.

- **createSingleInvite**: 서버 Location 헤더에서 URL 추출 → 모바일: OS 공유시트 / 웹: 클립보드
- **createBatchInvite**: 다수 사용자 일괄 초대 (서버 SMS)

### useSubscriptionIap

`apps/web/src/app/features/mypage/hooks/useSubscriptionIap.ts`

인앱 결제 (구독).

- Promise 기반 네이티브 메시지 패턴 (ref resolver)
- iOS / Android 분기 처리
- 타임아웃: 구매 60초, 상품 조회 10초
- 서버 검증 → 트랜잭션 완료 순서

### useDeviceTokenRegistration

`apps/web/src/app/shared/hooks/useDeviceTokenRegistration.ts`

FCM 디바이스 토큰 등록 (모바일 전용).

- `window.CHATIC_APP_PLATFORM` 체크로 앱 환경만 실행
- localStorage 기반 중복 등록 방지

### useTotalUnreadCount

`apps/web/src/app/shared/hooks/useTotalUnreadCount.ts`

현재 place의 전체 안읽은 메시지 수. 채널 repository 구독.

---

## 주요 패턴 정리

### 데이터 페칭 전략

| 전략           | 설명                       | 사용처                                     |
| -------------- | -------------------------- | ------------------------------------------ |
| `cache-only`   | IndexedDB만 (인증 전)      | useChannels (pre-verified)                 |
| `cache-first`  | 캐시 우선, 없으면 네트워크 | useChannels (초기 로딩)                    |
| `network-only` | 서버 강제                  | useChannels (refresh), usePlaces (초대 후) |

### 레이스 컨디션 방어 패턴

| 패턴                               | 설명                                   |
| ---------------------------------- | -------------------------------------- |
| `requestSeqRef`                    | 요청 순서 번호로 stale 응답 무시       |
| `prevFetchKeyRef`                  | cloud:place 키 기반 중복 fetch 방지    |
| `channelsRef.current.length` guard | subscription이 빈 캐시로 덮어쓰기 방지 |
| `switchingRef`                     | 동시 cloud 전환 차단                   |
| `isLoadingMoreRef`                 | loadMore 동시 호출 차단                |

### 디바운스/쓰로틀

| 위치                        | 딜레이 | 이유                         |
| --------------------------- | ------ | ---------------------------- |
| `debouncedEmitAllStreams`   | 200ms  | 캐시 변경 배치 처리          |
| `useSearch`                 | 300ms  | 타이핑 중 불필요한 검색 방지 |
| `useForegroundTokenRefresh` | 300ms  | rapid visibility toggle 방지 |
| `usePlaceUnreadCounts`      | 1000ms | 이벤트 폭주 시 집계 최적화   |
| loadMore 쿨다운             | 500ms  | 스크롤 이벤트 연쇄 방지      |

### 모듈 레벨 변수

`useChannels`와 `usePlaces`에서 사용. 컴포넌트 unmount/remount 시에도 상태 유지하여 flash 방지.

```typescript
// useChannels.ts
let lastFetchedCloudId: string | null | undefined;
let lastFetchedPlaceId: string | undefined;
```

### Repository 구독 패턴

```typescript
// 패턴: repository.subscribeList → 캐시 변경 시 콜백
const unsub = channelRepository.subscribeList(payload, result => {
    setChannels(result.list);
});
return unsub; // cleanup
```

내부적으로 `ChannelLocalDataSource.debouncedEmitAllStreams()` → 모든 subscriber에게 알림.
