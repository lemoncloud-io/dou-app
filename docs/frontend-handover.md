# 웹 프론트엔드 실무 가이드

> 화면별 훅 구성과 데이터 흐름 중심 지침서

---

## 기초 개념

### 도메인 용어

| 용어        | 의미                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| **Cloud**   | 하나의 워크스페이스. Slack의 Workspace와 유사. 사용자는 여러 Cloud에 소속 가능 |
| **Place**   | Cloud 안의 하위 그룹. Slack의 Channel 카테고리와 유사. Cloud당 여러 Place 존재 |
| **Channel** | Place 안의 채팅방. 1:1, 그룹, self 채팅 등                                     |
| **Join**    | 사용자와 채널의 관계. `readNo`(마지막 읽은 chatNo) 등 포함                     |
| **Site**    | Place의 백엔드 모델명. 코드에서 `site === place`                               |

### relay 모드 vs cloud 모드

이 앱은 두 가지 접속 모드가 있습니다.

|                         | relay 모드                                | cloud 모드                                            |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------- |
| **상태**                | Cloud 미선택 또는 `cloudId === 'default'` | 특정 Cloud에 접속한 상태                              |
| **WebSocket 접속 대상** | 중계서버 (relay)                          | Cloud 전용 백엔드 (delegation token의 wss URL)        |
| **인증 토큰**           | `webCore.getTokenSignature()`             | `cloudCore.getIdentityToken()`                        |
| **Place 전환 시**       | `selectedPlaceId` 저장만                  | `cloudCore.refreshToken("uid@placeId")` → 재인증 필요 |
| **판별**                | `wssType !== 'cloud'`                     | `wssType === 'cloud'`                                 |

`wssType`은 `useWebSocketV2Store`에 저장되며, `cloudCore.getWss()` 값이 존재하면 `'cloud'`, 없으면 `'relay'`입니다.

### 앱 초기화 순서

```
main.tsx → App 마운트
  │
  ├── useInitWebCore()          webCore.init() — OAuth 토큰 확인
  ├── useTokenRefresh()         토큰 갱신 + 프로필 로드
  │
  ▼ canRenderApp = true (프로필 로드 완료 또는 localStorage 캐시 존재)
  │
  Provider 트리:
    I18nextProvider → Suspense → QueryClientProvider → ThemeProvider
      → DataProvider (Repository 인스턴스 생성, Context 제공)
        ├── WebSocketV2Connection     WebSocket 연결 관리
        ├── GlobalChatSync            전역 채팅 동기화
        ├── ServiceUnavailableOverlay 서비스 장애 표시
        └── Router                    인증 분기 라우팅
```

**인증 분기**: `isAuthenticated === true` → private 라우트, `false` → `/auth/login`으로 리다이렉트.

### 3-tier 통신 구조

```
브라우저
  │
  ├── webCore (Tier 1)    → 중계서버 (OAUTH_ENDPOINT)
  │     OAuth 인증, 프로필, 디바이스 등록
  │     webCore.buildSignedRequest({ method, baseURL }).execute()
  │
  ├── cloudCore (Tier 2)  → 토큰/URL 관리 (sessionStorage)
  │     delegation token (backend, wss URL 포함)
  │     cloud token (AWS credentials, identityToken 포함)
  │     선택된 cloudId, placeId 관리
  │
  └── WebSocket V2 (Tier 3) → Cloud 백엔드 (cloudCore.getWss())
        Worker 기반 소켓 통신
        메시지 형식: { type, action, payload, ref? }
        인증: auth:update → isVerified = true
```

### WebSocket 메시지 형식

서버 프로토콜은 `{type}.{action}` 형식:

| type      | 주요 action                          | 설명               |
| --------- | ------------------------------------ | ------------------ |
| `chat`    | `feed`, `send`, `mine`               | 메시지 조회/전송   |
| `channel` | `mine`, `create`, `update`, `delete` | 채널 CRUD          |
| `user`    | `update-profile`, `mine`             | 사용자 프로필      |
| `auth`    | `update`                             | 인증 토큰 갱신     |
| `site`    | `mine`, `make`                       | 플레이스 목록/생성 |
| `join`    | `mine`, `update`                     | 참여 정보          |
| `sync`    | `channel`, `chat`                    | 증분 동기화        |
| `device`  | `save`                               | 디바이스 등록      |

소켓 핸들러 위치: `libs/data/src/data/remote/sockets/handlers/`

### 주요 도메인 모델 필드

**DomainChannel** (`ChannelView` 확장):

| 필드          | 설명                                                   |
| ------------- | ------------------------------------------------------ |
| `id`          | 채널 ID                                                |
| `sid`         | 소속 Place ID                                          |
| `cid`         | 소속 Cloud ID                                          |
| `ownerId`     | 방장 ID                                                |
| `stereo`      | 채널 유형 (`'self'` = 나와의 채팅)                     |
| `memberNo`    | 멤버 수                                                |
| `chatNo`      | 최신 chatNo                                            |
| `$`           | nested view — `$.sid` 등 서버에서 내려주는 연관 데이터 |
| `$join`       | 내 Join 정보 (`chatNo` = 내가 읽은 위치)               |
| `lastChat$`   | 마지막 메시지 정보 (`createdAt`, `chatNo`, `ownerId`)  |
| `unreadCount` | 서버 계산 미읽음 수                                    |

**DomainChat** (`ChatView` 확장):

| 필드          | 설명                               |
| ------------- | ---------------------------------- |
| `id`          | 메시지 ID                          |
| `channelId`   | 소속 채널 ID                       |
| `chatNo`      | 메시지 순번 (정렬/페이지네이션 키) |
| `ownerId`     | 작성자 ID                          |
| `content`     | 메시지 내용                        |
| `tempId`      | 낙관적 업데이트용 임시 ID          |
| `isPending`   | 전송 중                            |
| `isFailed`    | 전송 실패                          |
| `createdAtMs` | 생성 시간 (epoch ms)               |

**ClientChannelView** (UI 계산 필드 추가):

| 필드          | 설명                                              |
| ------------- | ------------------------------------------------- |
| `isOwner`     | 내가 방장인지                                     |
| `isSelfChat`  | 나와의 채팅인지                                   |
| `memberCount` | 멤버 수                                           |
| `unreadCount` | 미읽음 수 (`lastChatNo - myReadNo`, `$join` 우선) |

### 프로젝트 실행

```bash
yarn web:start          # http://localhost:5003
yarn web:build:dev      # 개발 빌드
yarn web:build:prod     # 프로덕션 빌드
```

환경변수: `apps/web/.env.dev`, `.env.prod` — `VITE_OAUTH_ENDPOINT`, `VITE_DOU_ENDPOINT`, `VITE_WS_ENDPOINT` 등.

### 디렉토리 구조

```
apps/web/src/app/
├── components/         앱 레벨 (WebSocketV2Connection, GlobalChatSync 등)
├── routes/             인증 분기 라우팅 (private/, public/, guards/)
├── features/           기능별 모듈
│   ├── home/           홈 (PlaceList + ChannelList)
│   ├── chats/          채팅 (ChatRoomPage, ChatSettingsPage)
│   ├── places/         플레이스 정보/순서
│   ├── search/         검색
│   ├── mypage/         마이페이지
│   ├── auth/           로그인
│   ├── account/        회원가입/비밀번호
│   ├── workspace/      워크스페이스 관리
│   ├── join/           초대 수락
│   ├── notifications/  알림
│   └── onboarding/     온보딩
└── shared/
    ├── data/           DataProvider, Repository 팩토리
    ├── hooks/          공유 훅 (useChannels, useChats, usePlaces 등)
    ├── layouts/        UnifiedLayout
    ├── stores/         Zustand 스토어
    ├── types/          공유 타입
    └── utils/          유틸리티
```

각 feature 내부: `pages/` → `hooks/` → `components/` → `routes/`

### 라우팅

```
/ (UnifiedLayout)
├── /                         HomePage (PlaceList + ChannelList)
├── /chats/:channelId/room    채팅방
├── /chats/:channelId/settings 채팅 설정
├── /places/order             플레이스 순서 관리
├── /places/:placeId          플레이스 정보
├── /search                   검색
├── /mypage                   마이페이지
├── /workspace                워크스페이스 관리
├── /create-workspace         워크스페이스 생성
├── /create-room              채팅방 생성
├── /notifications            알림
├── /join/*                   초대 수락
├── /account/signup/*         회원가입
├── /account/reset/*          비밀번호 재설정
└── /auth/login               로그인 (인증/비인증 모두 접근)
```

Feature 라우트는 `lazy()` + `Suspense`로 코드 분할됨.

---

## 데이터 흐름 요약

```
WebSocket 메시지 수신
  → Handler (chatHandler, userHandler, ...)
  → Repository (캐시 저장 + 이벤트 발행)
  → Hook (subscribeList/이벤트 콜백 → setState)
  → UI 갱신
```

모든 데이터 훅은 **Repository 패턴**을 사용합니다. 훅은 IndexedDB를 직접 다루지 않고, Repository에 캐시 정책(`cachePolicy`)을 지정하여 호출합니다. Repository가 내부적으로 IndexedDB 읽기/쓰기를 투명하게 처리합니다.

```typescript
// Repository 접근
const { chat, channel, site, join, user } = useRepositories();

// 캐시 정책 지정 예시
const result = await channelRepository.fetchChannel(params, { cachePolicy: 'cache-first' });
```

### Repository 캐시 정책

| 정책           | IndexedDB 읽기 | 네트워크 요청                        | IndexedDB 저장 | 동작                                    |
| -------------- | -------------- | ------------------------------------ | -------------- | --------------------------------------- |
| `cache-first`  | 먼저 읽기      | 캐시 miss 시 동기, hit 시 백그라운드 | 항상           | 캐시 데이터 즉시 반환 → 백그라운드 갱신 |
| `network-only` | 안 함          | 즉시                                 | 항상           | 네트워크 응답 대기 후 반환              |
| `cache-only`   | 읽기만         | 안 함                                | 안 함          | 로컬 데이터만 반환                      |

**핵심**: `network-only`도 응답을 IndexedDB에 저장합니다. 이후 `cache-first` 호출 시 이 데이터가 즉시 반환됩니다.

**`cache-first` 상세 흐름**:

1. `fetchLocal()` → IndexedDB 조회
2. 데이터 있음 → 호출자에게 즉시 반환 + 백그라운드에서 `fetchRemote()` 실행
3. 데이터 없음 → `fetchRemote()` 동기 실행 후 반환
4. `fetchRemote()` 내부: 네트워크 fetch → IndexedDB에 `upsertMany()` 저장 → subscribeList 스트림 알림 → UI 갱신

Repository 이벤트 구독(`onChannelCreated` 등)으로 실시간 갱신도 동일하게 Repository가 IndexedDB에 저장 후 스트림으로 전파합니다.

---

## 화면별 훅 구성

### HomePage — 플레이스 + 채널 목록

**파일**: `features/home/pages/HomePage.tsx`

| 훅                             | 역할                                       |
| ------------------------------ | ------------------------------------------ |
| `usePlaces()`                  | 플레이스 목록 (캐시 → 네트워크 동기화)     |
| `useChannels({ sid, detail })` | 선택된 플레이스의 채널 목록                |
| `usePlaceUnreadCounts()`       | 플레이스별 미읽음 배지                     |
| `useCanCreateChannel()`        | 채널 생성 권한/한도 체크                   |
| `useCanCreatePlace()`          | 플레이스 생성 권한/한도 체크               |
| `useCloudSession()`            | 클라우드 세션 상태                         |
| `useDynamicProfile()`          | 현재 사용자 프로필                         |
| `useWebSocketV2Store()`        | `selectedPlaceId`, `cloudId`, `isVerified` |

**데이터 흐름**:

1. `cloudId` + `selectedPlaceId` → `usePlaces()`로 플레이스 로드
2. 선택된 플레이스의 `sid` → `useChannels({ sid })`로 채널 로드
3. `usePlaceUnreadCounts()`가 각 플레이스의 미읽음 합산

**플레이스 전환 시** (같은 클라우드 내):

- cloud 모드: `cloudCore.refreshToken("uid@placeId")` → `auth:update` → `isVerified` 대기
- relay 모드: 단순 `selectedPlaceId` 저장

---

### ChatRoomPage — 채팅방

**파일**: `features/chats/pages/ChatRoomPage.tsx`

| 훅                                   | 역할                                          |
| ------------------------------------ | --------------------------------------------- |
| `useChannel(channelId)`              | 채널 메타데이터                               |
| `useChannelMembers({ channelId })`   | 멤버 목록                                     |
| `useChats({ channelId, limit })`     | 메시지 목록 + 페이지네이션                    |
| `useChatMutations()`                 | `sendMessage`, `readMessage`, `deleteMessage` |
| `useJoinPositions(channelId, joins)` | 멤버별 읽음 위치 (읽음 표시선)                |
| `useWebSocketV2Store()`              | `isVerified`                                  |
| `useDynamicProfile()`                | 내 메시지 판별                                |

**데이터 흐름**:

1. 채널 메타 + 멤버 병렬 로드
2. `useChats`가 Repository `subscribeList`로 실시간 메시지 수신
3. 스크롤/포커스 시 `readMessage(channelId, chatNo)` 자동 호출
4. `sendMessage`는 **낙관적 업데이트** (tempId → 서버 확인 후 교체)
5. `loadMore()`: `chatNo` 기반 커서 페이지네이션 (위로 스크롤)

**메시지 상태**:

- `isPending: true` → 전송 중 (tempId 표시)
- `isFailed: true` → 전송 실패 (재시도 UI)
- 둘 다 `false` → 정상 전송 완료

---

### ChatSettingsPage — 채팅방 설정

**파일**: `features/chats/pages/ChatSettingsPage.tsx`

| 훅                                 | 역할                            |
| ---------------------------------- | ------------------------------- |
| `useChannel(channelId)`            | 채널 메타                       |
| `useChannelMembers({ channelId })` | 멤버 목록                       |
| `useChannelMutations()`            | `leaveChannel`, `deleteChannel` |
| `useDynamicProfile()`              | 방장 여부 판별                  |

---

### PlaceInfoPage — 플레이스 정보/수정

**파일**: `features/places/pages/PlaceInfoPage.tsx`

| 훅                   | 역할                             |
| -------------------- | -------------------------------- |
| `usePlaces()`        | 전체 플레이스 → `placeId`로 필터 |
| `useUpdateMyPlace()` | 이름/썸네일 수정                 |

---

### SearchPage — 검색

**파일**: `features/search/pages/SearchPage.tsx`

| 훅                      | 역할               |
| ----------------------- | ------------------ |
| `usePlaces()`           | 플레이스 검색 대상 |
| `useChannels({ sid })`  | 채널 검색 대상     |
| `useWebSocketV2Store()` | `selectedPlaceId`  |

검색은 **클라이언트 사이드** — 로컬 캐시된 데이터에서 필터링합니다.

---

### MyPage — 마이페이지

**파일**: `features/mypage/pages/MyPage.tsx`

| 훅                        | 역할                 |
| ------------------------- | -------------------- |
| `useDynamicProfile()`     | 프로필 표시          |
| `useLogout()`             | 로그아웃             |
| `useTheme()`              | 다크 모드 토글       |
| `useAppPreferenceStore()` | 앱 설정 (blur, 언어) |
| `useCacheMutations()`     | 캐시 전체 삭제       |

데이터 fetch 없음 — 프로필은 전역 상태에서 가져옵니다.

---

## 핵심 공유 훅 상세

### useChannels(params)

**파일**: `shared/hooks/useChannels.ts`

```
반환: { channels, isLoading, isSyncing, isError, refresh(), sync() }
```

**동작 순서**:

1. `isVerified` 전: `cache-only`로 Repository 호출 → IndexedDB에 이전 데이터 있으면 즉시 표시
2. `isVerified` 후: `cache-first` fetch (캐시 즉시 반환 + 백그라운드 네트워크 갱신) → 이어서 `network-only` fetch (서버 최신 데이터로 교체)
3. Repository 이벤트 구독 → `onChannelCreated/Updated/Deleted`, `onChatCreated`, `onJoinUpdated` 시 `cache-only`로 재로드
4. 포그라운드 복귀 (5초 이상 숨김): `network-only` 재요청
5. WebSocket 재연결: `cache-only` 로컬 로드 → `network-only` 네트워크 갱신

**클라우드/플레이스 전환 시**: 즉시 `setChannels([])` → `cache-only` 로드 → `cache-first` → `network-only` 순차 실행

---

### useChats(params)

**파일**: `shared/hooks/useChats.ts`

```
반환: { messages, isLoading, isEmpty, isLoadingMore, hasMore, loadMore(), refresh(), sync() }
```

**동작 순서**:

1. Repository `subscribeList(channelId)` → 로컬 캐시 스트림 구독 (IndexedDB에 데이터 있으면 즉시 콜백)
2. `GlobalChatSync`가 백그라운드에서 chatNo gap 감지 → `network-only`로 누락 메시지 fetch → Repository가 IndexedDB 저장 → 스트림 콜백 → UI 갱신
3. `loadMore()`: `network-only`로 `chat:feed` 요청 (cursorNo 기반) → Repository가 IndexedDB 저장 → 스트림 반영
4. 새 메시지: WebSocket → chatHandler → Repository가 IndexedDB에 저장 → subscribeList 콜백 → UI 갱신

---

### usePlaces()

**파일**: `shared/hooks/usePlaces.ts`

```
반환: { places, isLoading, isError, refresh() }
```

**동작 순서**:

1. `isVerified` 전: `cache-only`로 Repository 호출 → IndexedDB에 이전 데이터 있으면 즉시 표시 (모듈 레벨 캐시 병행)
2. `isVerified` 후: `cache-first`로 fetch (캐시 즉시 + 백그라운드 네트워크 갱신, Repository가 IndexedDB 자동 저장)
3. Repository 이벤트 구독 → `onSiteCreated/Updated` 시 `network-only`로 재요청 (네트워크 결과 → IndexedDB 저장 → UI 반영)

---

### useCloudSwitchFlow — 클라우드 전환 파이프라인

**파일**: `shared/hooks/useCloudSwitchFlow.ts`

5단계 순차 실행:

| 단계                 | 동작                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| 1. `selectCloud`     | `cloudCore.refreshToken()` → delegation token 갱신 → `setCloudId()` → `setIsVerified(false)` |
| 2. `waitForVerified` | `useCloudTokenRefresh`가 `auth:update` 전송 → 서버 인증 대기 (10s)                           |
| 3. `fetchPlaces`     | `siteRepository.fetchSite()` → 플레이스 목록 획득                                            |
| 4. `authPlace`       | `cloudCore.refreshToken("uid@placeId")` → place 전용 토큰 → 재인증 대기 (5s)                 |
| 5. `fetchChannels`   | 백그라운드 실행, `useChannels`가 이벤트로 자체 갱신                                          |

실패 시 이전 cloudId로 `rollbackCloud()`.

---

### useCloudTokenRefresh — 토큰 자동 갱신

**파일**: `shared/hooks/useCloudTokenRefresh.ts`

| 조건                   | 동작                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 미인증 (`!isVerified`) | relay: `webCore.getTokenSignature()`, cloud: `cloudCore.getIdentityToken()` → `auth:update` 전송, 실패 시 exponential backoff (최대 3회) |
| 인증 완료              | 60초 간격 갱신. relay: `webCore.getTokenSignature()`, cloud: `cloudCore.refreshToken()`                                                  |
| 서버 에러 (5xx)        | `ServiceUnavailable` 오버레이 표시                                                                                                       |
| 인증 에러 (4xx)        | default cloud로 fallback                                                                                                                 |

---

### useChatMutations — 메시지 전송/읽음/삭제

**파일**: `shared/hooks/useChatMutations.ts`

| 메서드                                        | 동작                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `sendMessage({ channelId, content, tempId })` | 낙관적으로 pending 메시지 삽입 → WebSocket 전송 → 서버 응답으로 교체 |
| `readMessage({ channelId, chatNo })`          | join:update로 readNo 갱신                                            |
| `deleteMessage({ channelId, chatId })`        | 메시지 삭제                                                          |

---

## 전체 훅 레퍼런스

### 공유 훅 — 데이터 조회 (`shared/hooks/`)

#### useChannels(params)

- **파라미터**: `{ sid: string (placeId), limit?, page?, detail? }`
- **반환**: `{ channels, isLoading, isSyncing, isError, errorMessage, refresh(), sync(), debugInfo }`
- 선택된 플레이스의 채널 목록 관리. `isVerified` 전 `cache-only`, 후 `cache-first` → `network-only` 순차 호출. Repository 이벤트 구독으로 실시간 반영. 클라우드/플레이스 전환 시 즉시 초기화 후 재로드.
- **의존**: `channelRepository`, `chatRepository`, `joinRepository`, `useWebSocketV2Store`, `cloudCore`

#### useChats(params)

- **파라미터**: `{ channelId: string, limit? }`
- **반환**: `{ messages, isLoading, isEmpty, isLoadingMore, isError, hasMore, loadMore(), refresh(), sync() }`
- 채팅 메시지 목록 구독. Repository `subscribeList` 스트림으로 수신 (Repository가 IndexedDB 읽기/쓰기 투명 처리). `loadMore()`는 `network-only`로 이전 메시지 로드. 낙관적 업데이트(tempId) 지원.
- **의존**: `chatRepository`, `useDynamicProfile`

#### usePlaces()

- **파라미터**: 없음
- **반환**: `{ places, isLoading, isSyncing, isError, refresh(), sync() }`
- 현재 클라우드의 플레이스 목록. `isVerified` 전 `cache-only` 호출, 이후 `cache-first` 호출 (Repository가 IndexedDB ↔ 네트워크 자동 관리). `onSiteCreated/Updated` 이벤트 시 `network-only` 재요청.
- **의존**: `siteRepository`, `useWebSocketV2Store`

#### useChannel(channelId)

- **파라미터**: `channelId: string | null`
- **반환**: `{ channel: ClientChannelView | null, isLoading, isError, refresh() }`
- 단일 채널 데이터 스트림 구독. `DomainChannel` → `ClientChannelView` 변환 (isOwner, isSelfChat, memberCount, unreadCount 계산). Join 목록도 함께 구독.
- **의존**: `channelRepository`, `joinRepository`, `useDynamicProfile`

#### useChannelMembers(params)

- **파라미터**: `{ channelId: string, detail? }`
- **반환**: `{ members, total, isLoading, isSyncing, isError, refresh(), sync() }`
- 채널 멤버 목록 구독. `join:created/deleted` 이벤트로 멤버 캐시 갱신. 10초 간격 폴링.
- **의존**: `userRepository`, `joinRepository`

#### useJoinPositions(channelId, initialJoins)

- **파라미터**: `channelId: string | null`, `initialJoins: JoinView[]`
- **반환**: `{ activeMemberCount, getReadCount(chatNo): { readCount, unreadCount }, isReady }`
- 멤버별 읽음 위치 관리. `join:update/create/delete` 이벤트 구독. 메시지별 읽음/안읽음 수 계산 (읽음 표시선 UI용).
- **의존**: `joinRepository`

#### useInviteClouds()

- **파라미터**: 없음
- **반환**: `{ inviteClouds, isLoading, isEmpty }`
- 초대 클라우드 목록 구독. 모바일 앱 전용 (`isNative` 체크).
- **의존**: `inviteCloudRepository`

#### useTotalUnreadCount()

- **파라미터**: 없음
- **반환**: `number` (전체 미읽음 수)
- 현재 플레이스의 전체 채널 미읽음 합산. 캐시에서 채널 목록 구독하여 계산.
- **의존**: `channelRepository`, `useWebSocketV2Store`

#### usePlaceUnreadCounts()

- **파라미터**: 없음
- **반환**: `Record<string, number>` (placeId → 미읽음 수)
- 플레이스별 미읽음 카운트 집계. 이벤트 기반 갱신 (1초 디바운스) + 30초 폴링. 네이티브 배지 카운트도 업데이트.
- **의존**: `channelRepository`, `chatRepository`, `joinRepository`, `useWebSocketV2Store`, `cloudCore`

---

### 공유 훅 — Mutations (`shared/hooks/`)

#### useChatMutations()

- **반환**: `{ isPending, sendMessage, readMessage, deleteMessage }`
- 채팅 변이 함수. `sendMessage`는 낙관적 업데이트 (pending → 서버 확인). `readMessage`는 `join:update`로 readNo 갱신. `deleteMessage`는 로컬 캐시 삭제.
- **의존**: `chatRepository`, `joinRepository`, `useDynamicProfile`

#### useChannelMutations()

- **반환**: `{ isPending, createChannel, leaveChannel, deleteChannel, updateChannel, inviteChannel }`
- 채널 CRUD + 초대. 채널 나가기/삭제 시 해당 채팅 캐시도 정리.
- **의존**: `channelRepository`, `chatRepository`

#### usePlaceMutations()

- **반환**: `{ isPending, makeSite, updateSite, updatePlaceOrder }`
- 플레이스 생성/수정/순서 변경. Repository 패턴으로 데이터 조작.
- **의존**: `siteRepository`

#### useUserMutations()

- **반환**: `{ isPending, updateProfile, requestInvite, requestInviteBatch }`
- 사용자 프로필 수정, 단건/배치 초대. `userRepository` 경유.
- **의존**: `userRepository`, `useDynamicProfile`

#### useInviteMutations()

- **반환**: `{ saveInvite, isSaving }`
- 초대 클라우드 데이터를 로컬 DB에 저장. 초대 수락 플로우에서 사용.
- **의존**: `inviteCloudRepository`, `useWebSocketV2Store`, `cloudCore`

#### useCacheMutations()

- **반환**: `{ isPending, clearCache(type), clearAllCache() }`
- Repository 캐시 삭제 (channel, chat, user, join, site, inviteCloud 전체 또는 개별).
- **의존**: 모든 Repository

---

### 공유 훅 — 세션/인증 (`shared/hooks/`)

#### useCloudSession()

- **반환**: `{ selectCloud, isPending, clouds, isCloudsError, isFetchingClouds, refetchClouds }`
- 클라우드 선택 시 토큰 발급 + 저장 + WebSocket 스토어 갱신. 클라우드 목록은 `useClouds` 쿼리에서 가져옴. 프로필에 클라우드별 사용자 정보 반영.
- **의존**: `useIssueCloudToken`, `useWebSocketV2Store`, `useClouds`, `cloudCore`, `useWebCoreStore`

#### useCloudSwitchFlow(options)

- **파라미터**: `{ onPlaceSelected?: (placeId) => void }`
- **반환**: `{ switchCloud(cloudId): Promise<void> }`
- 클라우드 전환 5단계 파이프라인: selectCloud → waitForVerified → fetchPlaces → authPlace → fetchChannels. 실패 시 롤백. 연속 전환 방지 잠금.
- **의존**: `useCloudSession`, `siteRepository`, `channelRepository`, `useLoaderStore`, `useToast`

#### useCloudTokenRefresh()

- **반환**: void (부수 효과)
- 토큰 자동 갱신. 미인증 시 `auth:update` 전송 (exponential backoff). 인증 후 60초 간격 갱신. 5xx → ServiceUnavailable, 4xx → default cloud fallback.
- **의존**: `useWebSocketV2`, `useWebCoreStore`, `useServiceStatusStore`, `cloudCore`, `webCore`

#### useSocketAuth()

- **반환**: void (부수 효과)
- WebSocket 연결 후 `auth:update` 메시지 전송. `cloudCore` 또는 `webCore`에서 identityToken 획득.
- **의존**: `useWebSocketV2`, `useWebCoreStore`, `cloudCore`, `webCore`

#### useAutoSelectCloud()

- **반환**: void (부수 효과)
- 마운트 시 선택된 클라우드가 없으면 첫 번째 active 클라우드 자동 선택. 클라우드 목록이 비면 'default' 설정.
- **의존**: `useCloudSession`, `useWebCoreStore`, `cloudCore`, `useWebSocketV2Store`

#### usePlaceSession()

- **반환**: `{ selectPlace(placeId): Promise<void>, isPending }`
- 플레이스 전용 클라우드 토큰 발급. delegation/cloud token 저장, WebSocket 스토어에 placeId 갱신.
- **의존**: `useIssueCloudToken`, `useWebSocketV2Store`, `cloudCore`, `useWebCoreStore`

#### useDeviceTokenRegistration()

- **반환**: void (부수 효과)
- 인증 시 네이티브 앱에서 FCM 토큰 요청 → 서버에 등록. localStorage에 저장하여 중복 등록 방지.
- **의존**: `useWebCoreStore`, `useDynamicDeviceId`, `useRegisterDeviceToken`, `webClient`

---

### 공유 훅 — 동기화/복구 (`shared/hooks/`)

#### useChatSync(channels)

- **파라미터**: `channels: SyncableChannel[]` (id, chatNo, lastChat$.chatNo)
- **반환**: `{ getChannelSyncStatus(channelId): ChannelSyncStatus }`
- `ChatSyncScheduler`로 채널별 메시지 동기화. chatNo gap 감지 → 자동 채움. 탭 숨김 시 일시정지, 표시 시 재개.
- **의존**: `chatRepository`, `useWebSocketV2Store`, `ChatSyncScheduler`, `useChatSyncStore`

#### useChatSyncTargets(channels)

- **파라미터**: `channels: SyncableChannel[]`
- **반환**: void (부수 효과)
- `DeviceSocketRuntime`에 채널 sync 대상 등록. 연결 시 시작, 언마운트 시 전체 중지.
- **의존**: `getSocketRuntime`, `useWebSocketV2Store`

#### useConnectionRecoverySync(requestFromLocal, requestFromNetwork)

- **파라미터**: 로컬 동기화 함수, 네트워크 동기화 함수
- **반환**: void (부수 효과)
- 포그라운드 복귀 + WebSocket 재연결 시 데이터 재동기화 트리거. `FOREGROUND_RESYNC_EVENT_NAME` 이벤트와 `isVerified` 상태 변화 감지.
- **의존**: `useWebSocketV2Store`

#### useForegroundResync(refreshToken)

- **파라미터**: `refreshToken: () => Promise<boolean>`
- **반환**: void (부수 효과)
- 5초 이상 백그라운드 후 복귀 시 재동기화. 웹 `visibilitychange` + 네이티브 AppState 모두 지원. 토큰 갱신 후 `FOREGROUND_RESYNC_EVENT_NAME` 디스패치.
- **의존**: `useWebSocketV2Store`, `cloudCore`, `useWebCoreStore`

#### useForegroundTokenRefresh(refreshToken)

- **파라미터**: `refreshToken: () => Promise<boolean>`
- **반환**: void (부수 효과)
- 탭 전환 시 OAuth + cloud 토큰 갱신. 소켓 살아있으면 `auth:update` 재전송. 300ms 디바운스.
- **의존**: `cloudCore`, `useWebCoreStore`, `webCore`, `useWebSocketV2Store`

---

### 공유 훅 — 권한/유틸리티 (`shared/hooks/`)

#### useCanCreateChannel(channelsInfo)

- **파라미터**: `{ count: number, isLoading: boolean }`
- **반환**: `{ canCreate, isDefaultCloud, isLimitReached, isLoading, currentCount, maxCount, isMyCloud }`
- 채널 생성 가능 여부 판단. maxChannels 한도, default cloud 여부, 클라우드 소유 여부 체크.
- **의존**: `useUserContext`, `useWebCoreStore`, `useCloudSession`, `cloudCore`

#### useCanCreatePlace(placesInfo)

- **파라미터**: `{ count: number, isLoading: boolean }`
- **반환**: `{ canCreate, isLimitReached, isLoading, currentCount, maxCount, isMyCloud }`
- 플레이스 생성 가능 여부 판단. MAX_PLACES 한도 + 클라우드 소유 여부 체크.
- **의존**: `useUserContext`, `useWebCoreStore`, `useCloudSession`, `cloudCore`

#### useDynamicDeviceId()

- **반환**: `{ deviceId: string, isReady: boolean }`
- 디바이스 ID 조회. `window.CHATIC_APP_DEVICE_ID` 또는 sessionStorage에서 획득.
- **의존**: `useSessionDeviceId`

#### useBackHandler()

- **반환**: `{ handleNativeBack() }`
- 하이브리드 앱 뒤로가기 처리. 다이얼로그 닫기, 네이티브 네비게이션 동기화. `data-prevent-back-close` 속성 지원.
- **의존**: `useNavigateWithTransition`, `useOnBackPressed`, `webClient`

#### useHandleAppMessage(type, handler)

- **파라미터**: 메시지 타입, 핸들러 함수
- **반환**: void (부수 효과)
- 네이티브 브릿지 메시지 구독. 타입별 편의 훅 제공 (`useOnBackPressed`, `useOnGetContacts` 등).
- **의존**: `webClient`

---

### Feature 훅 — Home (`features/home/hooks/`)

#### useCreateChannel()

- **반환**: `{ createChannel(payload): Promise<ChannelView>, isLoading, isError, channel }`
- `useChannelMutations.createChannel` 래퍼. 생성된 채널 상태 저장 + 에러 추적.

#### useCreatePlace()

- **반환**: `{ createPlace(name): Promise<MySiteView>, isLoading, isError }`
- `usePlaceMutations.makeSite` 래퍼. stereo를 'work'로 고정.

#### useUpdateMyPlace()

- **반환**: `{ updatePlace(payload): Promise<void>, isPending, isError }`
- `usePlaceMutations.updateSite` 래퍼.

#### useUpdateMyProfile()

- **반환**: `{ updateProfile(payload): Promise<UserView>, isPending, isError }`
- WebSocket `user:update-profile` 직접 전송. 스토어 `lastMessage` 구독으로 응답 대기 (10s 타임아웃). 성공 시 `useWebCoreStore.profile` 갱신. temp 계정 거부.
- **의존**: `useWebSocketV2`, `useWebSocketV2Store`, `useWebCoreStore`, `useUserContext`

#### useSessionId()

- **반환**: `string` (세션 ID)
- sessionStorage에 uuid v4 기반 세션 ID 생성/조회. 탭 리로드 간 유지.

#### useTabLifecycle()

- **반환**: `{ isVisible, isFocused, lastVisibilityChange, lastFocusChange }`
- 브라우저 탭 라이프사이클 추적 (visibility, focus, blur, beforeunload).

#### useTabVisibilityWebSocket(isTabVisible, connect, disconnect)

- **반환**: void (부수 효과)
- 탭 visible → WebSocket 연결, hidden → 연결 해제.

---

### Feature 훅 — Chats (`features/chats/hooks/`)

#### useCreateInviteBatch()

- **반환**: `{ createBatchInvite({ channelId, phones }): Promise<MyInviteView[]>, isPending }`
- 복수 전화번호 배치 초대. `useClouds`에서 클라우드 이름 조회, `userRepository.requestInviteBatch` 호출. 서버가 딥링크 생성 + SMS 발송.
- **의존**: `useClouds`, `useUserMutations`, `cloudCore`

---

### Feature 훅 — Search (`features/search/hooks/`)

#### useSearch(query)

- **파라미터**: `query: string`
- **반환**: `{ results: { places, chats }, isSearching, hasResults }`
- 300ms 디바운스 후 클라이언트 사이드 검색. 플레이스는 이름 필터, 메시지는 IndexedDB 전문 검색. 결과는 매치 수 기준 정렬.
- **의존**: `useDynamicProfile`, `usePlaces`, `useChannels`, `useWebSocketV2Store`, `IndexedDBAdapter`

#### useRecentSearches()

- **반환**: `{ searches, addSearch(query), removeSearch(query), clearAll() }`
- localStorage 기반 최근 검색어 관리. 최대 10개, 중복 제거.
- **의존**: `useLocalStorage`

---

### Feature 훅 — MyPage (`features/mypage/hooks/`)

#### useSubscriptionIap()

- **반환**: `{ purchase, validate, finishTransaction, fetchCurrentPurchases, fetchNativeProducts, purchaseAndValidate, restorePurchases }`
- 인앱 구매 처리. 네이티브 브릿지로 구매 → 백엔드 검증 (Google/Apple). 트랜잭션 완료, 구매 복원 지원.
- **의존**: `webClient`, `useValidateApple`, `useValidateGoogle`, `useValidateMembership`

---

## 전역 동기화 컴포넌트

### WebSocketV2Connection

**파일**: `app/components/WebSocketV2Connection.tsx`

앱 레벨에서 마운트. WebSocket 연결 endpoint 결정 + 토큰 갱신 트리거.

### GlobalChatSync

**파일**: `app/components/GlobalChatSync.tsx`

앱 레벨에서 마운트 (페이지 이동과 무관):

1. `channelRepository.subscribeList()` → 모든 채널 목록 구독
2. `useChatSync(channels)` → 각 채널의 chatNo gap 감지 → 자동 동기화
3. 포그라운드 복귀: cache-only → isVerified면 network-only

---

## 클라우드 전환 플로우 (Cloud Switch)

**진입점**: `useCloudSwitchFlow.switchCloud(cloudId)`

`switchingRef`로 동시/연속 호출 방지. 실패 시 이전 cloudId로 자동 롤백.

```
사용자가 클라우드 선택
  │
  ▼
Step 1: selectCloud(cloudId)  ── useCloudSession 경유
  │  issueCloudToken(cloudId)          → 중계서버 HTTP 요청
  │  cloudCore.saveDelegationToken()   → 세션스토리지 저장
  │  cloudCore.saveCloudToken()        → 세션스토리지 저장
  │  cloudCore.saveSelectedCloudId()
  │  cloudCore.clearSelectedPlace()    → 클라우드 변경 시만
  │  store.setCloudId(cloudId)         ← usePlaces, useChannels 재반응
  │  store.setIsVerified(false)        ← useCloudTokenRefresh 트리거
  │
  ▼
Step 2: waitForVerified(10초)
  │  useCloudTokenRefresh가 감지 → auth:update 전송
  │  서버 응답 → isVerified = true
  │  타임아웃 시 → Error('Cloud auth timeout') → 롤백
  │
  ▼
Step 3: fetchPlaces()
  │  siteRepository.fetchSite({}, { cachePolicy: 'cache-first' })
  │  플레이스 목록 획득
  │
  ▼
Step 4: authPlace(targetPlaceId)
  │  대상 결정: 이전 selectedPlaceId (유효 시) 또는 places[0]
  │
  │  ┌─ relay 모드 (wssType !== 'cloud'):
  │  │    cloudCore.saveSelectedSiteId(placeId)
  │  │    store.setSelectedPlaceId(placeId)
  │  │    → 완료 (토큰 갱신 불필요)
  │  │
  │  └─ cloud 모드:
  │       cloudCore.refreshToken("uid@placeId")   → place 전용 토큰
  │       cloudCore.saveSelectedSiteId(placeId)
  │       store.setSelectedPlaceId(placeId)
  │       store.setIsVerified(false)              ← 2차 auth 트리거
  │       waitForVerified(5초)
  │       타임아웃 시 → Error('Place auth timeout') → 롤백
  │
  ▼
Step 5: fetchChannels() [fire-and-forget]
  │  channelRepository.fetchChannel({ sid: placeId, limit: 100 })
  │  캐시 프리로드 → useChannels가 이벤트로 자체 갱신
  │
  ▼
완료
```

### 롤백 로직

어떤 단계에서든 실패 시:

- 이전 cloudId와 현재 cloudId 비교
- 다르면 `rollbackCloud(previousCloudId)` 실행
    - previousCloudId가 `null`/`'default'` → delegation 토큰 클리어, 'default' 모드로 전환
    - 그 외 → `selectCloud(previousCloudId)` + `waitForVerified(10초)` 재시도
    - 롤백 자체 실패 → default 모드로 최종 fallback

### 스토어 상태 변화 요약

| 시점        | `cloudId`  | `selectedPlaceId` | `isVerified`         |
| ----------- | ---------- | ----------------- | -------------------- |
| Step 1 후   | 새 cloudId | null (클리어)     | `false`              |
| Step 2 완료 | 새 cloudId | null              | `true`               |
| Step 4 시작 | 새 cloudId | 새 placeId        | `false` (cloud 모드) |
| Step 4 완료 | 새 cloudId | 새 placeId        | `true`               |

---

## 플레이스 전환 플로우 (Place Switch)

**진입점**: HomePage의 `handleSelectPlace()` 또는 `useCloudSwitchFlow`의 Step 4

### relay 모드 (wssType !== 'cloud')

```
플레이스 선택
  │
  ▼
cloudCore.saveSelectedSiteId(placeId)
store.setSelectedPlaceId(placeId)
  │
  ▼
완료 — useChannels가 sid 변경 감지 → 새 채널 로드
```

토큰 갱신 불필요. 단순 상태 전환만.

### cloud 모드 (wssType === 'cloud')

```
플레이스 선택
  │
  ▼
setSkipAutoAuth(true)   ← useCloudTokenRefresh 일시 중지
  │
  ▼
cloudCore.refreshToken("uid@placeId")
  │  place 전용 delegation token 발급
  │  cloudCore에 새 토큰 저장
  │
  ▼
cloudCore.saveSelectedSiteId(placeId)
store.setSelectedPlaceId(placeId)
  │
  ▼
store.setIsVerified(false)
setSkipAutoAuth(false)  ← useCloudTokenRefresh 재개
  │
  ▼
useCloudTokenRefresh 감지 → auth:update 전송 (place 스코프 토큰)
  │
  ▼
서버 인증 → isVerified = true
  │
  ▼
useChannels: sid 변경 감지 → channels 초기화 → 캐시 로드 → 네트워크 갱신
GlobalChatSync: selectedPlaceId 변경 → 채널 구독 재설정
```

### `_skipAutoAuth` 플래그

`useCloudTokenRefresh`가 `isVerified=false`를 감지하면 자동으로 `auth:update`를 보냅니다. 플레이스 전환 중 `refreshToken` 호출과 겹치지 않도록 `setSkipAutoAuth(true)`로 일시 중단 → 토큰 갱신 완료 후 해제.

---

## 동기화 메커니즘

### 1. 채팅 동기화 (Chat Sync)

**담당**: `GlobalChatSync` → `useChatSync` → `ChatSyncScheduler`

```
GlobalChatSync (앱 레벨 마운트, 페이지 이동과 무관)
  │
  ├── channelRepository.subscribeList() → 전체 채널 목록 구독
  │
  └── useChatSync(channels) 호출
        │
        ▼
      ChatSyncScheduler 생성
        │
        ▼
      채널별 gap 감지:
        각 채널의 serverChatNo (lastChat$.chatNo) vs localMaxChatNo (IndexedDB)
        gap > 0 → 동기화 대상으로 큐에 추가
        │
        ▼
      순차 처리 (runLoop):
        1. 로컬 max chatNo 조회
        2. Page 0 fetch (network-only, limit=200)
        3. 잔여 gap 계산
        4. 나머지 페이지 병렬 fetch (Promise.all)
        5. 완료 → 'synced' 상태
        │
      탭 숨김 → pause(), 탭 표시 → resume()
      isVerified=false → stop()
```

**상태 추적**: `useChatSyncStore` — 채널별 `{ status, serverChatNo, localMaxChatNo, fetchedCount, totalGap }`

### 2. 채널 동기화 (Channel Sync)

**담당**: `useChannels`

```
3가지 동기화 경로:

[경로 A: 초기 로드 / 전환]
  cloudId + placeId + isVerified 모두 존재
    → cache-first (Repository가 IndexedDB 먼저 반환 + 백그라운드 네트워크 갱신)
    → 이어서 network-only (Repository가 네트워크 결과를 IndexedDB에 저장 후 반환)

[경로 B: 실시간 이벤트]
  onChannelCreated / onChannelUpdated / onChannelDeleted
  onChatCreated (현재 목록의 채널인 경우만)
  onJoinUpdated (현재 목록의 채널인 경우만)
    → 200ms 디바운스 → cache-only로 Repository 호출 (IndexedDB 재로드)

[경로 C: 증분 동기화]
  syncFromServer()
    → channelRepository.syncChannels(since)
    → since = channelSyncStore.syncedAtMap[cloudId] (마지막 동기화 시점)
    → 서버에서 변경분만 수신 → Repository가 IndexedDB에 저장 → cache-only 재로드 → UI 반영
```

### 3. 플레이스 동기화 (Place Sync)

**담당**: `usePlaces`

```
[초기 로드]
  isVerified 전: cache-only로 Repository 호출 (모듈 레벨 캐시도 병행)
  isVerified 후: cache-first (Repository가 IndexedDB → 즉시 반환, 백그라운드 네트워크 갱신 + IndexedDB 저장)

[이벤트 반응]
  onSiteCreated / onSiteUpdated → network-only로 재요청 (Repository가 결과를 IndexedDB에 저장)

[초대 동기화]
  초대 수락 직후 → sessionStorage에 'invite-sync' 플래그
  → 다음 fetch 시 network-only 강제
  → 결과 비어있으면 2초 대기 후 재시도 (서버 반영 지연 대응)
```

**참고**: usePlaces는 `useConnectionRecoverySync`를 사용하지 않음. 재연결 복구는 cloudId 변경 감지로 간접 처리.

### 4. 포그라운드 복귀 동기화

앱이 5초 이상 백그라운드에 있다가 돌아올 때:

```
탭 visible 전환 (5초+ 숨김 후)
  │
  ├── useForegroundTokenRefresh (300ms 디바운스)
  │     ├── checkSocketHealth() + refreshToken()  ── 병렬 실행
  │     ├── cloudCore.refreshToken()               ── 클라우드 선택 시
  │     └── auth:update 전송                       ── 소켓 연결 시만
  │
  ├── useForegroundResync (5초 가드)
  │     ├── refreshToken()
  │     ├── cloudCore.refreshToken()
  │     └── window.dispatchEvent('foreground-resync')
  │           │
  │           └── useConnectionRecoverySync 리스너들:
  │                 └── useChannels: 캐시 로드 + 네트워크 fetch
  │
  ├── GlobalChatSync (자체 listener, 5초 가드)
  │     ├── cache-only 즉시 로드
  │     └── network-only 로드 (isVerified 시)
  │
  └── useChannels (자체 listener, 5초 가드)
        └── fetchChannels({ forceNetwork: true, silent: true })
```

### 5. WebSocket 재연결 복구

소켓이 끊겼다가 재연결될 때:

```
소켓 끊김 (isConnected: true → false)
  │
  ├── useConnectionRecoverySync: hadDisconnection = true 기록
  ├── GlobalChatSync: hadDisconnection = true 기록
  └── useChatSync: isVerified=false → scheduler.stop()

소켓 재연결 (isConnected: false → true)
  │
  ├── useCloudTokenRefresh: isConnected + !isVerified 감지
  │     └── auth:update 전송
  │
  ▼
서버 인증 완료 (isVerified: false → true)
  │
  ├── useConnectionRecoverySync (hadDisconnection=true일 때만)
  │     └── useChannels: 캐시 로드 + 네트워크 fetch
  │
  ├── GlobalChatSync (hadDisconnection=true일 때만)
  │     └── network-only 채널 fetch
  │
  └── useChatSync: channels effect 재실행
        └── scheduler.enqueue() + scheduler.start()
```

**핵심**: `hadDisconnection` 플래그가 있어야만 복구 로직 실행. 클라우드/플레이스 전환 시 `isVerified` 토글은 `isConnected`가 유지되므로 복구 로직이 트리거되지 않음.

### 6. 토큰 자동 갱신 (주기적)

**담당**: `useCloudTokenRefresh`

```
isVerified=true 상태에서 60초 간격:
  │
  ├── relay 모드: webCore.getTokenSignature() → auth:update
  │
  └── cloud 모드: cloudCore.refreshToken()
        │
        ├── 성공 → identityToken 획득 → auth:update
        │
        ├── 5xx 서버 에러 → ServiceUnavailable 오버레이 표시
        │     (auth:update 보내지 않음, fallback 없음)
        │
        └── 4xx 인증 에러 → default 모드 fallback:
              cloudCore.clearDelegationToken()
              cloudCore.clearSelectedPlace()
              store.setCloudId('default')
              store.setSelectedPlaceId(null)
              store.setIsVerified(false)
              toast("세션 만료")
```

---

## 스토어 필드 ↔ 소비자 매핑

| 스토어 필드          | 설정하는 곳                                               | 읽는 곳                                                                                     |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `cloudId`            | `selectCloud`, `useAutoSelectCloud`, 토큰 갱신 fallback   | `usePlaces`, `useChannels`, `GlobalChatSync`                                                |
| `selectedPlaceId`    | `authPlace`, `selectPlace`, 토큰 갱신 fallback            | `GlobalChatSync`, `useChannels` (sid), `usePlaceUnreadCounts`                               |
| `isVerified`         | `selectCloud`, `authPlace`, 토큰 갱신 fallback, auth 응답 | `useCloudTokenRefresh`, `useChatSync`, `useChannels`, `usePlaces`, `GlobalChatSync`         |
| `isConnected`        | WebSocket 레이어                                          | `useCloudTokenRefresh`, `useConnectionRecoverySync`, `GlobalChatSync`, `useChatSyncTargets` |
| `isDeviceRegistered` | WebSocket device.save 응답                                | `useCloudTokenRefresh` (가드 조건)                                                          |
| `wssType`            | WebSocket 레이어                                          | `useCloudTokenRefresh`, `useForegroundTokenRefresh`, `authPlace`                            |

---

## 통신 3계층 (빠른 참조)

| 계층   | 모듈         | 용도                 | 사용법                                                      |
| ------ | ------------ | -------------------- | ----------------------------------------------------------- |
| Tier 1 | `webCore`    | 중계서버 OAuth/인증  | `webCore.buildSignedRequest({ method, baseURL }).execute()` |
| Tier 2 | `cloudCore`  | 토큰/URL 관리        | `cloudCore.getBackend()`, `cloudCore.refreshToken()`        |
| Tier 3 | WebSocket V2 | 실시간 비즈니스 로직 | `emitAuthenticated({ type, action, payload })`              |

**API 추가 시**: `libs/users/src/apis/` (중계서버 API) 또는 Repository 패턴 (WebSocket 기반)

---

## 상태 스토어 (빠른 참조)

| 스토어                  | 주요 필드                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `useWebCoreStore`       | `isAuthenticated`, `profile`, `isGuest`, `isInvited`                 |
| `useWebSocketV2Store`   | `cloudId`, `selectedPlaceId`, `isConnected`, `isVerified`, `wssType` |
| `useAppPreferenceStore` | 언어, 알림, blur 설정                                                |
| `useOnboardingStore`    | 온보딩 진행 상태                                                     |

---

## 새 기능 작성 가이드

### 새 화면 추가

1. `features/{name}/pages/` 에 페이지 컴포넌트 생성
2. `features/{name}/routes/` 에 라우트 정의
3. `apps/web/src/app/routes/private/PrivateRoutes.tsx`에 lazy import 추가

### 새 데이터 훅 추가

1. `shared/hooks/`에 훅 파일 생성
2. `useRepositories()`로 Repository 접근
3. 캐시 우선 로드 → 네트워크 갱신 → 이벤트 구독 패턴 따르기
4. `shared/hooks/index.ts`에서 export

### 새 API 추가 (중계서버)

```typescript
// libs/users/src/apis/index.ts
export const myApi = async params => {
    const { data } = await webCore
        .buildSignedRequest({ method: 'PUT', baseURL: `${DOU_ENDPOINT}/path` })
        .setBody(params)
        .execute<ResponseType>();
    return throwIfApiError(data);
};
```

### 새 WebSocket 요청 추가

```typescript
// Repository 패턴 사용 (권장)
const result = await this.requestRemote<T>(ref => remoteDataSource.myAction({ ...params, ref }), { timeoutMs: 10000 });
```

### Form 작성

```typescript
const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
} = useForm<FormData>({ mode: 'onChange' });
```

### i18n

- 번역 파일: `apps/web/public/locales/{ko,en}/translation.json`
- 사용: `const { t } = useTranslation(); t('key.name')`

---

> 코드베이스 기준: 2025년 6월 | @chatic/source v0.35.2
