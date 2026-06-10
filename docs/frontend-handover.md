# dou-app 웹 프론트엔드 인수인계 문서

> 이 문서는 dou-app 웹 프론트엔드의 아키텍처, 데이터 흐름, 주요 기능, 개발 패턴을 정리합니다.

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [디렉토리 구조](#2-디렉토리-구조)
3. [앱 초기화 흐름](#3-앱-초기화-흐름)
4. [3-Tier 통신 아키텍처](#4-3-tier-통신-아키텍처)
5. [인증 흐름](#5-인증-흐름)
6. [데이터 레이어 아키텍처](#6-데이터-레이어-아키텍처)
7. [WebSocket 아키텍처](#7-websocket-아키텍처)
8. [상태 관리](#8-상태-관리)
9. [라우팅](#9-라우팅)
10. [주요 기능별 흐름](#10-주요-기능별-흐름)
11. [공통 개발 패턴](#11-공통-개발-패턴)
12. [빌드 & 개발 환경](#12-빌드--개발-환경)
13. [주요 파일 레퍼런스 테이블](#13-주요-파일-레퍼런스-테이블)

---

## 1. 프로젝트 개요

### Nx 모노레포 구조

| 구분     | 패키지            | 설명                                            |
| -------- | ----------------- | ----------------------------------------------- |
| **apps** | `web`             | 웹 프론트엔드 (React SPA)                       |
|          | `mobile`          | React Native 모바일 앱 (Expo)                   |
|          | `admin`           | 관리자 패널                                     |
|          | `landing`         | 랜딩 페이지                                     |
| **libs** | `web-core`        | 인증/프로필/webCore/cloudCore 핵심 모듈         |
|          | `socket`          | WebSocket V2 Worker 기반 통신                   |
|          | `data`            | Repository 패턴, 도메인 모델, EventBus, 로컬 DB |
|          | `ui-kit`          | Shadcn/ui + Radix UI 기반 공통 컴포넌트         |
|          | `shared`          | 공통 유틸리티, 훅, 에러 처리                    |
|          | `theme`           | 테마 프로바이더 (다크/라이트 모드)              |
|          | `bridges`         | 네이티브 브릿지, 로거                           |
|          | `device-utils`    | 디바이스 정보 관리 훅/스토어                    |
|          | `i18n-mobile`     | 모바일 전용 i18n                                |
|          | `policy-content`  | 이용약관, 개인정보처리방침 콘텐츠               |
|          | `app-messages`    | 앱 메시지 타입 정의                             |
|          | `auth`            | 인증 관련 공통 모듈                             |
|          | `channels`        | 채널 관련 공통 모듈                             |
|          | `chats`           | 채팅 관련 공통 모듈                             |
|          | `places`          | 플레이스 관련 공통 모듈                         |
|          | `users`           | 사용자 관련 공통 모듈                           |
|          | `pouches`         | 파우치 관련 모듈                                |
|          | `subscriptions`   | 구독 관련 모듈                                  |
|          | ~~`deeplinks`~~   | _(소스 없음, dist 잔재만 존재)_                 |
|          | ~~`socket-data`~~ | _(소스 없음, dist 잔재만 존재)_                 |

### 기술 스택

- **프레임워크**: React 19 + TypeScript
- **빌드**: Vite + Nx
- **스타일링**: TailwindCSS
- **상태 관리**: Zustand
- **폼 처리**: react-hook-form
- **국제화**: i18next + react-i18next
- **UI 기본**: Radix UI primitives + Shadcn/ui
- **아이콘**: Lucide icons
- **서버 상태**: @tanstack/react-query
- **라우팅**: React Router v6
- **로컬 DB**: IndexedDB (via 커스텀 어댑터)

---

## 2. 디렉토리 구조

### apps/web/src/ 전체 레이아웃

```
apps/web/src/
├── main.tsx                    # 엔트리 포인트 (ReactDOM.createRoot)
├── styles.css                  # 글로벌 스타일 (Tailwind 지시자)
├── i18n/                       # i18next 설정
│   └── index.ts                # i18n 초기화 (ko/en, LocalStorage + XHR backend)
├── types/                      # 글로벌 타입 선언
└── app/
    ├── app.tsx                 # App 컴포넌트 (Provider 트리)
    ├── components/             # 앱 레벨 컴포넌트
    │   ├── GlobalChatSync.tsx  # 전역 채팅 동기화
    │   ├── WebSocketV2Connection.tsx  # WebSocket V2 연결 관리
    │   ├── WebSocketV2Status.tsx      # 소켓 상태 표시
    │   ├── ServiceUnavailableOverlay.tsx  # 서비스 장애 오버레이
    │   └── SettingsDialog.tsx  # 설정 다이얼로그
    ├── routes/                 # 라우팅 설정
    │   ├── index.tsx           # Router 메인 (인증 분기)
    │   ├── private/            # 인증 필요 라우트
    │   ├── public/             # 비인증 라우트
    │   ├── common/             # 공통 라우트 (auth)
    │   └── guards/             # 라우트 가드
    ├── features/               # 기능별 모듈
    └── shared/                 # 공유 모듈
```

### features/ 구조

각 feature는 아래 구조를 따릅니다:

```
features/{feature-name}/
├── apis/           # API 호출 함수
├── components/     # Feature별 컴포넌트
├── hooks/          # Feature별 커스텀 hooks
├── pages/          # 페이지 컴포넌트
├── routes/         # 라우팅 정의
├── constants/      # 상수 (필요시)
├── utils/          # 유틸리티 (필요시)
└── index.tsx       # 재내보내기
```

#### 현재 feature 목록

| Feature         | 설명         | 주요 기능                                 |
| --------------- | ------------ | ----------------------------------------- |
| `auth`          | 인증         | 로그인, 소셜 로그인, 초대 코드 입력       |
| `home`          | 홈           | PlaceList, ChannelList, 워크스페이스 생성 |
| `chats`         | 채팅         | 채팅방, 메시지, 설정, 알림 설정           |
| `places`        | 플레이스     | 플레이스 정보, 순서 관리                  |
| `explore`       | 탐색         | 콘텐츠 탐색                               |
| `search`        | 검색         | 채널/메시지/플레이스 검색                 |
| `mypage`        | 마이페이지   | 프로필 수정, 설정                         |
| `account`       | 계정         | 회원가입, 비밀번호 재설정                 |
| `workspace`     | 워크스페이스 | 워크스페이스 관리/생성                    |
| `join`          | 참여         | 초대 수락, 그룹 참여                      |
| `notifications` | 알림         | 알림 목록, 설정                           |
| `onboarding`    | 온보딩       | 최초 사용자 안내                          |

### shared/ 구조

```
shared/
├── data/               # DataProvider, 리포지토리 팩토리
│   ├── DataProvider.tsx # Context 기반 리포지토리 제공
│   ├── repositoryFactory.ts
│   ├── remoteFactory.ts
│   ├── localFactory.ts
│   ├── contextHolder.ts
│   └── types.ts
├── hooks/              # 공유 훅 (29+ 파일)
│   ├── useChats.ts
│   ├── useChannels.ts
│   ├── usePlaces.ts
│   ├── useChatSync.ts
│   ├── useChatMutations.ts
│   ├── useChannelMutations.ts
│   ├── useCloudSwitchFlow.ts
│   ├── useCloudTokenRefresh.ts
│   ├── useCloudSession.ts
│   └── ...
├── layouts/            # 레이아웃 컴포넌트
│   └── UnifiedLayout.tsx
├── sync/               # 동기화 스케줄러
│   └── ChatSyncScheduler.ts
├── types/              # 공유 타입
└── utils/              # 유틸리티
```

---

## 3. 앱 초기화 흐름

### 시퀀스: main.tsx → App → Providers → Router

```
main.tsx
  └─ StrictMode
      └─ App
          ├─ useInitWebCore()        ← webCore.init() (eager, 모듈 로드 시 시작)
          ├─ useTokenRefresh()       ← 토큰 갱신 + 프로필 로드
          ├─ useForegroundResync()   ← 포그라운드 복귀 시 재동기화
          │
          └─ canRenderApp ? Provider 트리 렌더링 : LoadingFallback
```

### Provider 중첩 순서 (바깥 → 안쪽)

```
I18nextProvider                    ← i18n (ko/en)
  └─ Suspense + ErrorBoundary     ← 에러 폴백
      └─ HelmetProvider           ← HTML 메타 태그
          └─ QueryClientProvider  ← React Query (staleTime: Infinity, retry: 1)
              └─ ThemeProvider    ← 다크/라이트 테마
                  └─ DataProvider ← Repository 인스턴스 (EventBus, SocketRequestManager)
                      ├─ ForegroundTokenRefresh  ← 포그라운드 토큰 갱신
                      ├─ WebSocketV2Connection   ← WebSocket 연결 (인증 시만)
                      ├─ GlobalChatSync          ← 전역 채팅 동기화 (인증 시만)
                      ├─ ServiceUnavailableOverlay
                      ├─ DeviceTokenRegistration ← 디바이스 토큰 등록
                      ├─ Router                  ← 라우팅
                      ├─ GlobalLoader            ← 전역 로딩 표시
                      └─ Toaster(s)              ← 토스트 알림
```

### 인증 체크 흐름

```
useInitWebCore()
  ├─ startWebCoreInit()          ← 모듈 로드 시 eager 시작 (~800ms)
  ├─ webCore.setUseXLemonLanguage()
  └─ webCore.isAuthenticated()   → isWebCoreReady = true

useTokenRefresh(isWebCoreReady)
  ├─ webCore.getTokenSignature() ← 토큰 서명 획득
  ├─ 프로필 조회/캐시 로드
  └─ isTokenInitialized = true

canRenderApp 조건:
  (isWebCoreReady && (!isAuthenticated || !!profile || initStatus === 'failed'))
  || !!profile   ← localStorage 캐시된 프로필이 있으면 즉시 렌더링 (Fast path)
```

> **Fast path**: localStorage에 캐시된 프로필이 있으면 webCore 초기화 완료를 기다리지 않고 즉시 앱을 렌더링합니다. 세션이 만료된 경우 `isAuthenticated`가 나중에 false로 전환되어 로그인 페이지로 리다이렉트됩니다.

---

## 4. 3-Tier 통신 아키텍처

```
┌──────────────────────────────────────────────────────┐
│                       Client                          │
├──────────┬──────────────────┬─────────────────────────┤
│ webCore  │    cloudCore     │    WebSocket V2          │
│ (Tier 1) │    (Tier 2)      │    (Tier 3)              │
├──────────┼──────────────────┼─────────────────────────┤
│ 중계서버  │ 클라우드 정보 관리 │ 클라우드 백엔드           │
│ (OAuth)  │ (토큰/주소 관리)  │ (실시간 비즈니스 로직)     │
└──────────┴──────────────────┴─────────────────────────┘
```

### Tier 1: webCore (중계서버)

**역할**: OAuth 인증, 사용자 프로필, 디바이스 등록

**엔드포인트**: `OAUTH_ENDPOINT` (VITE_OAUTH_ENDPOINT)

```typescript
import { webCore } from '@chatic/web-core';

// 서명된 요청 실행
const { data } = await webCore
    .buildSignedRequest({
        method: 'GET',
        baseURL: `${OAUTH_ENDPOINT}/users/0/profile`,
    })
    .execute<UserProfile>();

// 토큰 시그니처 획득
const tokenData = await webCore.getTokenSignature();
const identityToken = tokenData.originToken?.identityToken;
```

**주요 API**:

- `webCore.init()` — 초기화
- `webCore.isAuthenticated()` — 인증 상태 확인
- `webCore.buildSignedRequest(config)` — 서명된 HTTP 요청
- `webCore.getTokenSignature()` — 토큰 서명 획득
- `webCore.setUseXLemonLanguage()` — 언어 설정
- `webCore.logout()` — 로그아웃

### Tier 2: cloudCore (클라우드 정보 관리)

**역할**: delegation token / cloud token 저장·조회, backend/wss URL 관리

```typescript
import { cloudCore } from '@chatic/web-core';

// Delegation token (cloud에 접속할 때 받는 토큰)
cloudCore.saveDelegationToken(token);   // 저장
cloudCore.getDelegationToken();          // 조회
cloudCore.getBackend();                  // backend URL 추출
cloudCore.getWss();                      // WSS URL 추출

// Cloud token (AWS 자격증명 포함)
cloudCore.saveCloudToken(token);
cloudCore.getCloudToken();
cloudCore.getIdentityToken();            // identityToken 추출
cloudCore.getCredential();               // AWS credentials 추출

// 선택 상태
cloudCore.saveSelectedCloudId(cloudId);
cloudCore.getSelectedCloudId();
cloudCore.saveSelectedSiteId(placeId);
cloudCore.getSelectedPlaceId();

// 토큰 갱신
cloudCore.refreshToken(target?);         // target: "uid@placeId"

// 정리
cloudCore.clearSession();                // 전체 세션 정리
cloudCore.clearDelegationToken();        // delegation 토큰만 정리
```

**저장소**: `coreStorage` (웹: sessionStorage, RN WebView: localStorage)

### Tier 3: WebSocket V2 (클라우드 백엔드)

**역할**: 채팅, 채널, 사용자, 실시간 이벤트 처리

```typescript
import { useWebSocketV2 } from '@chatic/socket';

const { emit, emitAuthenticated, isConnected } = useWebSocketV2({
    endpoint,
    connectParams: { deviceId },
    enabled: !!deviceId && !!endpoint,
    wssType: currentWSS,
});

// 인증된 메시지 전송
emitAuthenticated({
    type: 'user',
    action: 'update-profile',
    payload: { name: 'New Name' },
});
```

---

## 5. 인증 흐름

### 5.1 디바이스 등록 (게스트 진입)

```
1. 앱 최초 로드
2. webCore.init() → OAuth 토큰 확인
3. 인증 없음 → LoginPage 렌더링
4. LoginPage에서 자동 디바이스 등록 (게스트 모드)
5. userRole: 'guest', isGuest: true
```

### 5.2 초대 코드 로그인

```
1. 초대 링크 클릭 → /auth/login?code=XXX&_backend=...&_wss=...
2. URL 파라미터 → sessionStorage에 저장 (CHATIC_OAUTH_ENDPOINT, CHATIC_DOU_ENDPOINT, CHATIC_WS_ENDPOINT)
3. webCore.init() with 동적 엔드포인트
4. 초대 코드 검증
5. delegation token 발급 → cloudCore에 저장
6. cloud token 발급 → cloudCore에 저장
7. WebSocket 연결 (cloud WSS 엔드포인트)
8. isInvited: true, isCloudUser: true
```

### 5.3 OAuth 소셜 로그인

```
1. 소셜 로그인 버튼 클릭 → SOCIAL_OAUTH_ENDPOINT로 리다이렉트
2. OAuth 인증 완료 → 콜백 URL로 돌아옴
3. webCore.isAuthenticated() = true
4. 프로필 로드 → useWebCoreStore.setProfile()
5. WebSocket 연결
```

### 5.4 토큰 갱신 메커니즘

**`useCloudTokenRefresh`** — 핵심 토큰 갱신 훅

```
WebSocket 연결 후 (isConnected && isDeviceRegistered):
  ├─ isVerified === false (미인증 상태)
  │   ├─ relay 모드: webCore.getTokenSignature() → emit auth:update
  │   └─ cloud 모드: cloudCore.getIdentityToken() → emit auth:update
  │   └─ 실패 시: exponential backoff 재시도 (최대 3회, 2s → 4s → 8s)
  │
  └─ isVerified === true (인증 완료)
      └─ 60초 간격으로 토큰 갱신
          ├─ relay 모드: webCore.getTokenSignature() → emit auth:update
          └─ cloud 모드: cloudCore.refreshToken() → emit auth:update
              └─ 서버 에러 (5xx): ServiceUnavailable 표시
              └─ 인증 에러 (4xx): default cloud로 fallback
```

---

## 6. 데이터 레이어 아키텍처

### 전체 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────┐
│  UI Layer (hooks: useChats, useChannels, usePlaces)       │
├──────────────────────────────────────────────────────────┤
│  Repository Layer (ChatRepository, ChannelRepository...) │
│  ├── fetchWithCachePolicy()  — cache-first/network-only  │
│  ├── subscribeList()         — 실시간 구독                │
│  ├── onXxxCreated/Updated()  — 도메인 이벤트 콜백         │
│  └── requestRemote()         — SocketRequestManager 경유  │
├─────────────┬─────────────┬──────────────────────────────┤
│  Local       │ Remote       │ Events                       │
│  DataSource  │ DataSource   │                              │
│  (IndexedDB) │ (WebSocket)  │                              │
├─────────────┼─────────────┼──────────────────────────────┤
│ IndexedDB    │ Socket       │ EventBus                     │
│ Adapter      │ Dispatcher   │ (SocketEventMap →            │
│              │              │  DomainEventMap)              │
└─────────────┴─────────────┴──────────────────────────────┘
```

### DataProvider

`DataProvider`는 앱 레벨에서 모든 Repository 인스턴스를 생성하고 Context로 제공합니다.

```typescript
// 사용법
import { useRepositories } from '../shared/data';

const { chat, channel, site, join, user } = useRepositories();
```

**DataProvider 내부 구조**:

1. `EventBusEngine<SocketEventMap>` — 소켓 이벤트 버스
2. `EventBusEngine<DomainEventMap>` — 도메인 이벤트 버스
3. `SocketRequestManager` — 요청-응답 매칭
4. `DataContextHolder` — 현재 cloud/place/user ID 관리
5. `RemoteDataSources` — WebSocket 기반 원격 데이터소스
6. `LocalDataSources` — IndexedDB 기반 로컬 데이터소스
7. `Repositories` — 위 모듈을 조합한 리포지토리

### Repository 패턴

모든 Repository는 `BaseRepository`를 상속하며 local + remote 통합 인터페이스를 제공합니다.

```
BaseRepository
  ├── requestRemote(sendAction, options) — 소켓 요청 + 응답 대기
  ├── fetchWithCachePolicy({fetchLocal, fetchRemote, ...}) — 캐시 정책 적용
  ├── onDomainEvent(event, callback) — 도메인 이벤트 구독
  └── getDomainScope() → {cid, sid, uid} — 현재 컨텍스트
```

**리포지토리 목록**:

| Repository              | 도메인        | 주요 메서드                                                      |
| ----------------------- | ------------- | ---------------------------------------------------------------- |
| `ChatRepository`        | 채팅 메시지   | `fetchChat`, `sendChat`, `subscribeList`                         |
| `ChannelRepository`     | 채널          | `fetchChannel`, `syncChannels`, `subscribeList`, `subscribeItem` |
| `SiteRepository`        | 플레이스      | `fetchSite`, `makeSite`, `subscribeList`                         |
| `JoinRepository`        | 참여 정보     | `fetchJoin`, `subscribeList`, `onJoinUpdated`                    |
| `UserRepository`        | 사용자        | `fetchUser`, `subscribeList`                                     |
| `AuthRepository`        | 인증          | `requestInviteBatch`                                             |
| `InviteCloudRepository` | 초대 클라우드 | `fetchInviteClouds`, `subscribeList`                             |

### 캐시 정책 (`RepositoryCachePolicy`)

| 정책                | 동작                                                      |
| ------------------- | --------------------------------------------------------- |
| `cache-first`       | 로컬 캐시 히트 시 즉시 반환, 백그라운드에서 네트워크 갱신 |
| `network-only`      | 캐시 무시, 네트워크 요청만 사용                           |
| `cache-only`        | 네트워크 사용 안 함, 캐시만 조회                          |
| `cache-and-network` | `cache-first`와 동일하게 처리                             |

### EventBus 흐름

```
WebSocket 메시지 수신
  → SocketEventBus.emit('socket:message', envelope)
  → Handler (chatHandler, userHandler, authHandler, ...)
      → DomainEventBus.emit('chat:created', domainChat)
  → Repository 내부 리스너
      → LocalDataSource에 캐시 저장
      → subscribeList/subscribeItem 콜백 실행
  → UI Hook (useChats, useChannels, ...) 상태 갱신
```

### SocketRequestManager

요청-응답 매칭을 위한 ref 기반 메커니즘:

```typescript
// Repository에서 사용
const result = await this.requestRemote<T>(ref => remoteDataSource.fetchChat({ ...params, ref }), { timeoutMs: 10000 });

// 내부 동작:
// 1. ref(고유 ID) 생성
// 2. sendAction(ref) 호출 → WebSocket으로 요청 전송
// 3. DomainEventBus에서 같은 ref를 가진 응답 대기
// 4. 타임아웃 or 응답 수신 → Promise resolve/reject
```

### Domain 모델

| 모델                | 소스 타입     | 추가 필드                                                             |
| ------------------- | ------------- | --------------------------------------------------------------------- |
| `DomainChat`        | `ChatView`    | `id`, `cid`, `channelId`, `chatNo`, `isPending`, `isFailed`, `tempId` |
| `DomainChannel`     | `ChannelView` | `id`, `cid`, `sid`, `isNotificationEnabled`, `lastActivityAt`         |
| `DomainJoin`        | `JoinView`    | `id`, `cid`, `channelId`, `userId`, `joined`, `readNo`                |
| `DomainSite`        | `SiteView`    | `id`, `cid`, `order`                                                  |
| `DomainUser`        | `UserView`    | `id`, `cid`                                                           |
| `DomainInviteCloud` | `CloudView`   | `id`, `cid`, `name`, `backend`, `wss`                                 |

모든 도메인 모델은 `DomainScope` (`cid`, `uid?`, `sid?`)를 통해 cloud/place 범위가 지정됩니다.

---

## 7. WebSocket 아키텍처

### Worker 기반 V2 프로토콜

```
App Thread                    Worker Thread
┌──────────────────────┐     ┌──────────────────────┐
│ useWebSocketV2       │     │ WebSocket Worker      │
│   ├── emit()         │ ──→ │   ├── postMessage()   │
│   ├── emitAuthenticated()  │   ├── WebSocket.send() │
│   └── onMessage()    │ ←── │   └── onmessage()     │
└──────────────────────┘     └──────────────────────┘
```

### 연결 단계

```
1. createClientSocket(endpoint, deviceId)
   → Worker에서 WebSocket 연결 생성

2. device.save 응답 수신
   → isDeviceRegistered = true
   → deviceId 저장

3. auth:update 전송 (useCloudTokenRefresh)
   → identityToken 포함
   → 서버에서 인증 검증

4. auth:update 응답 수신 (success)
   → isVerified = true
   → 메시지 처리 시작
```

### 메시지 타입 매핑

서버 프로토콜은 `{type}.{action}` 형식을 사용합니다:

| type      | 주요 action                | 설명                  |
| --------- | -------------------------- | --------------------- |
| `chat`    | `feed`, `send`, `mine`     | 채팅 메시지 조회/전송 |
| `channel` | `mine`, `create`, `update` | 채널 목록/생성/수정   |
| `user`    | `update-profile`, `mine`   | 사용자 프로필         |
| `auth`    | `update`                   | 인증 토큰 업데이트    |
| `device`  | `save`                     | 디바이스 등록         |
| `site`    | `mine`, `make`             | 플레이스 목록/생성    |
| `join`    | `mine`, `update`           | 참여 정보             |
| `sync`    | `channel`, `chat`          | 데이터 동기화         |

### 소켓 핸들러 (libs/data/src/data/remote/sockets/handlers/)

| 핸들러          | 역할                                             |
| --------------- | ------------------------------------------------ |
| `chatHandler`   | 채팅 메시지 수신 → DomainChat 변환 → 이벤트 발행 |
| `userHandler`   | 사용자 정보 수신 → DomainUser 변환               |
| `authHandler`   | 인증 응답 처리 → isVerified 업데이트             |
| `modelHandler`  | 채널/조인/사이트 등 모델 데이터 처리             |
| `syncHandler`   | 동기화 응답 처리                                 |
| `systemHandler` | 시스템 메시지 처리                               |

---

## 8. 상태 관리

### Zustand 전역 스토어

#### useWebCoreStore (libs/web-core/src/stores/)

```typescript
interface WebCoreState {
    isInitialized: boolean; // webCore 초기화 완료 여부
    isAuthenticated: boolean; // 인증 상태
    isOnMobileApp: boolean; // 모바일 앱 내 WebView 여부
    isGuest: boolean; // 게스트 모드
    isInvited: boolean; // 초대 받은 사용자
    isCloudUser: boolean; // 클라우드 사용자
    delegatorId: string | null; // 위임자 ID
    error: Error | null; // 초기화 에러
    profile: UserProfile$ | null; // 사용자 프로필
    userName: string; // 사용자 이름
}
```

**주요 액션**: `initialize()`, `logout()`, `setProfile()`, `registerLogoutCallback()`

#### useWebSocketV2Store (libs/socket/src/stores/)

```typescript
interface WebSocketV2State {
    id: string | null; // 소켓 ID
    cloudId: string | null; // 현재 클라우드 ID
    selectedPlaceId: string | null; // 선택된 플레이스 ID
    wssType: 'relay' | 'cloud' | null; // WSS 타입
    connectionId: string | null; // 연결 ID
    isConnected: boolean; // 소켓 연결 여부
    isDeviceRegistered: boolean; // 디바이스 등록 완료
    isVerified: boolean; // 인증 완료 여부
    connectionStatus: ConnectionStatus; // 연결 상태
    lastMessage: WSSEnvelope | null; // 최신 수신 메시지
    deviceId: string | null; // 디바이스 ID
}
```

**특징**: `subscribeWithSelector` 미들웨어 사용 — 특정 필드 변경에만 반응 가능

#### useAppPreferenceStore (libs/web-core/src/stores/)

앱 기본 설정 (언어, 알림 등)을 관리합니다.

#### useOnboardingStore

온보딩 진행 상태를 관리합니다.

### Repository 구독 패턴

Repository는 `subscribeList`와 `subscribeItem`을 통해 실시간 구독을 제공합니다:

```typescript
// 채팅 메시지 구독
useEffect(() => {
    const unsubscribe = chatRepository.subscribeList(channelId, result => {
        setMessages(result.list);
    });
    return () => unsubscribe();
}, [chatRepository, channelId]);

// 채널 단건 구독
useEffect(() => {
    const unsubscribe = channelRepository.subscribeItem(channelId, channel => {
        setChannel(channel);
    });
    return () => unsubscribe();
}, [channelRepository, channelId]);
```

---

## 9. 라우팅

### 인증 기반 분기

```typescript
// apps/web/src/app/routes/index.tsx
const routes = isAuthenticated
    ? [...privateRoutes, ...commonRoutes, { path: '*', → '/' }]
    : [...publicRoutes, ...commonRoutes, { path: '*', → '/auth/login' }];

// isInitialized === false → null 반환 (라우터 블로킹)
```

### 라우트 구조

```
/ (UnifiedLayout)
├── /                          → HomeRoutes (PlaceList + ChannelList)
├── /explore/*                 → ExploreRoutes (lazy)
├── /mypage/*                  → MyPageRoutes (lazy)
├── /account/*                 → AccountRoutes (lazy)
│   ├── /account/signup/*      → 회원가입 (이메일 → 인증 → 비밀번호)
│   └── /account/reset/*       → 비밀번호 재설정
├── /chats/*                   → ChatRoutes (lazy)
│   ├── /chats/:channelId/room → 채팅방
│   └── /chats/:channelId/settings → 채팅 설정
├── /workspace/*               → WorkspaceRoutes (lazy)
├── /create-workspace/*        → CreateWorkspaceRoutes (lazy)
├── /notifications/*           → NotificationsRoutes (lazy)
├── /join/*                    → JoinRoutes (lazy)
├── /create-room/*             → CreateRoomRoutes (lazy)
├── /places/*                  → PlaceRoutes (lazy)
│   ├── /places/order          → 플레이스 순서 관리
│   └── /places/:placeId       → 플레이스 정보
│
/auth/* (CommonRoutes - 인증/비인증 모두 접근)
├── /auth/login                → 로그인
└── /auth/...                  → 기타 인증 관련
```

### UnifiedLayout

```typescript
// apps/web/src/app/shared/layouts/UnifiedLayout.tsx
// - 모바일 최적화: max-width 430px (메인/탐색 경로)
// - useBackHandler(): 브라우저 뒤로가기 제어
// - Outlet으로 자식 라우트 렌더링
```

### Lazy Loading 패턴

```typescript
const ChatRoutes = lazy(() =>
    import('../../features/chats').then(m => ({ default: m.ChatRoutes }))
);

// 사용시
<Suspense fallback={<RouteFallback />}>
    <Component />
</Suspense>
```

`RouteFallback`: 헤더 + 콘텐츠 스켈레톤 UI (pulse 애니메이션)

---

## 10. 주요 기능별 흐름

### 10.1 채팅 (Chats)

#### useChats(initialParams)

채팅 메시지 목록을 관리합니다.

```
초기 로드:
  chatRepository.subscribeList(channelId) → 로컬 캐시에서 즉시 표시
  GlobalChatSync → 백그라운드에서 서버와 동기화

메시지 수신:
  WebSocket → chatHandler → DomainEventBus → Repository → subscribeList 콜백 → UI 갱신

페이지네이션:
  loadMore() → feedCursorNo 기반 이전 메시지 로드
```

**반환값**: `messages`, `isLoading`, `isEmpty`, `isLoadingMore`, `hasMore`, `isError`, `loadMore()`, `refresh()`, `sync()`

#### useChatMutations()

```typescript
const { sendMessage, readMessage, deleteMessage } = useChatMutations();

// 낙관적 업데이트로 메시지 전송
await sendMessage({ channelId, content, tempId });

// 읽음 처리
await readMessage({ channelId, chatNo });
```

#### GlobalChatSync 흐름

```
App 레벨에서 마운트 (페이지 이동과 무관):
  channelRepository.subscribeList() → 모든 채널 목록 구독
  useChatSync(channels) → 각 채널의 chatNo gap 감지 → 자동 동기화

포그라운드 복귀 시:
  1. cache-only로 채널 목록 즉시 읽기
  2. isVerified면 network-only로 서버 갱신

소켓 재연결 시:
  isVerified: false→true 전환 감지 → network-only 채널 refetch
```

#### 읽음 처리

```
미읽음 카운트 = max(0, channel.lastChatNo - join.chatNo)
  - join.chatNo: 해당 채널에서 내가 마지막으로 읽은 chatNo
  - channel.lastChatNo: 채널의 최신 chatNo
```

### 10.2 플레이스 (Places)

#### usePlaces()

플레이스 목록을 관리합니다.

```
초기 로드:
  1. isVerified 전에도 IndexedDB 캐시에서 즉시 표시
  2. isVerified 후 서버에서 최신 데이터 fetch
  3. siteRepository 이벤트 (onSiteCreated/Updated/Deleted) 구독 → 자동 갱신
```

#### useCloudSwitchFlow (5단계 파이프라인)

클라우드 전환 시 실행되는 핵심 파이프라인:

```
Step 1: selectCloud(cloudId)
  → cloudCore.refreshToken()
  → delegation token 갱신
  → useWebSocketV2Store.setCloudId()
  → useWebSocketV2Store.setIsVerified(false)

Step 2: waitForVerified(10s)
  → useCloudTokenRefresh가 자동으로 auth:update 전송
  → 서버에서 인증 완료 → isVerified = true

Step 3: fetchPlaces()
  → siteRepository.fetchSite({}, { cachePolicy: 'cache-first' })
  → 플레이스 목록 획득

Step 4: authPlace(placeId)
  → cloudCore.refreshToken("uid@placeId")  ← place 전용 토큰 발급
  → cloudCore.saveSelectedSiteId(placeId)
  → setIsVerified(false) → auth:update → waitForVerified(5s)

Step 5: fetchChannels() [fire-and-forget]
  → channelRepository.fetchChannel({ sid: placeId })
  → 백그라운드 실행, useChannels가 이벤트로 자체 갱신

실패 시: 이전 cloudId로 rollbackCloud()
```

### 10.3 검색 (Search)

#### useSearch(query)

```
입력 → 300ms 디바운스 → 병렬 검색:
  1. Places: 이름 필터링 (case-insensitive)
  2. Channels: 이름 + 콘텐츠 검색 (메모리 + IndexedDB)
  3. Messages: IndexedDB에서 전문 검색

반환: { places, chats: [{channel, matchCount}], isSearching, hasResults }
```

### 10.4 홈 (Home)

#### PlaceList 컴포넌트

```
가로 스크롤 플레이스 선택기:
  ├── 썸네일/아이콘 표시
  ├── 미읽음 카운트 뱃지 (usePlaceUnreadCounts)
  ├── 최초 로드 시 이전 선택 복원 (localStorage)
  └── 플레이스 선택 → handleSelectPlace()
       ├── relay 모드: 단순 저장
       └── cloud 모드: refreshToken + auth:update 대기
```

#### ChannelList (useChannels)

```
채널 목록 표시:
  ├── lastChat 타임스탬프 기준 정렬
  ├── 채널별 미읽음 카운트
  ├── 채널 클릭 → useNavigateWithTransition('/chats/:channelId/room')
  └── 데이터 흐름:
       1. isVerified 전: IndexedDB 캐시에서 즉시 표시
       2. isVerified 후: cache-first → 이후 network-only 갱신
       3. 이벤트 구독: onChannelCreated/Updated/Deleted → 캐시 재로드
       4. 포그라운드 복귀: 5초 이상 숨김 → network-only 재요청
```

---

## 11. 공통 개발 패턴

### 11.1 API 호출 패턴

**중계서버 API (webCore)**:

```typescript
const { data } = await webCore
    .buildSignedRequest({
        method: 'GET',
        baseURL: `${OAUTH_ENDPOINT}/path`,
    })
    .execute<ResponseType>();
```

**Repository 패턴**:

```typescript
const { chat: chatRepository } = useRepositories();
const result = await chatRepository.fetchChat(params, {
    cachePolicy: 'cache-first',
    timeoutMs: 10000,
});
```

**WebSocket 직접 전송**:

```typescript
const { emitAuthenticated } = useWebSocketV2();
emitAuthenticated({ type: 'user', action: 'update-profile', payload });
```

### 11.2 Form 처리

```typescript
import { useForm } from 'react-hook-form';

const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
} = useForm<FormData>({
    mode: 'onChange',
});
```

### 11.3 i18n

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
// 사용: t('cloudSessionSheet.switchFailed')
```

**설정**:

- 지원 언어: `ko`, `en` (fallback: `en`)
- 감지: localStorage (`i18nextLng`)
- 번역 파일: `/locales/{lng}/{ns}.json`
- 캐시: LocalStorageBackend + 버전 관리 (`I18N_VERSION`)

### 11.4 네비게이션

```typescript
import { useNavigateWithTransition } from '@chatic/shared';

const navigate = useNavigateWithTransition();
navigate('/chats/channel-id/room');
```

### 11.5 에러 처리

```typescript
import { reportError, toError } from '@chatic/web-core';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

try {
    // 작업
} catch (error) {
    logger.error('FEATURE', 'Operation failed', { error });
    reportError(toError(error));
    toast({
        title: t('error.title'),
        description: t('error.description'),
        variant: 'destructive',
    });
}
```

**에러 수집 계층**:

- `ErrorBoundary`: React 컴포넌트 에러 캐치
- `window.addEventListener('error')`: 전역 에러
- `window.addEventListener('unhandledrejection')`: 미처리 Promise rejection
- `RouterErrorFallback`: 라우터 에러
- `QueryCache.onError` / `MutationCache.onError`: React Query 에러

### 11.6 Toast 알림

```typescript
const { toast } = useToast();

toast({
    title: '제목',
    description: '설명',
    variant: 'destructive', // 에러용
});
```

두 가지 토스터가 공존:

- `Toaster` (Radix UI 기반) — Shadcn/ui 토스트
- `SonnerToaster` (Sonner) — 추가 토스트

### 11.7 WebSocket 응답 대기 패턴

Repository를 거치지 않는 직접 WebSocket 요청 시:

```typescript
// useWebSocketV2Store.subscribe로 응답 대기
const unsubscribe = useWebSocketV2Store.subscribe(
    s => s.lastMessage,
    lastMessage => {
        if (lastMessage?.type === 'user' && lastMessage?.action === 'update-profile') {
            clearTimeout(timeoutId);
            unsubscribe();
            resolve(lastMessage.payload);
        }
    }
);

// 타임아웃 설정
const timeoutId = setTimeout(() => {
    unsubscribe();
    reject(new Error('Timeout'));
}, 10000);

// 요청 전송
emitAuthenticated({ type: 'user', action: 'update-profile', payload });
```

---

## 12. 빌드 & 개발 환경

### 개발 서버

```bash
yarn web:start          # http://localhost:5003
yarn admin:start        # http://localhost:5001
yarn landing:start      # http://localhost:5004
yarn mobile:start       # Metro bundler
```

### 빌드

```bash
yarn web:build:dev      # 개발 환경 빌드
yarn web:build:prod     # 프로덕션 빌드
```

### 배포

```bash
yarn web:deploy:dev     # 빌드 + scripts/deploy-web.sh dev
yarn web:deploy:prod    # 빌드 + scripts/deploy-web.sh prod
```

### 환경변수

| 변수                         | 설명                                 | 설정 방법                |
| ---------------------------- | ------------------------------------ | ------------------------ |
| `VITE_ENV`                   | 환경 식별자 (`dev`, `prod`, `local`) | `.env.dev` / `.env.prod` |
| `VITE_PROJECT`               | 프로젝트명                           | `.env`                   |
| `VITE_REGION`                | AWS 리전 (기본: `ap-northeast-2`)    | `.env`                   |
| `VITE_OAUTH_ENDPOINT`        | OAuth 중계서버 URL                   | `.env.dev` / `.env.prod` |
| `VITE_DOU_ENDPOINT`          | 비즈니스 로직 서버 URL               | `.env.dev` / `.env.prod` |
| `VITE_WS_ENDPOINT`           | WebSocket 엔드포인트                 | `.env.dev` / `.env.prod` |
| `VITE_SOCIAL_OAUTH_ENDPOINT` | 소셜 OAuth 엔드포인트                | `.env.dev` / `.env.prod` |
| `VITE_HOST`                  | 호스트 URL                           | `.env`                   |

**빌드 설정** (`apps/web/project.json`):

- `dev` 설정: `.env` → `.env.dev` 파일 교체
- `prod` 설정: `.env` → `.env.prod` 파일 교체, 프로덕션 모드

### 린트 & 포매팅

```bash
yarn lint               # ESLint 전체 실행
yarn lint:fix           # ESLint 자동 수정
yarn prettier           # Prettier 전체 실행
yarn prettier:staged    # 스테이징된 파일만 포매팅
```

---

## 13. 주요 파일 레퍼런스 테이블

### 앱 초기화

| 파일                                                | 설명                         |
| --------------------------------------------------- | ---------------------------- |
| `apps/web/src/main.tsx`                             | 엔트리 포인트                |
| `apps/web/src/app/app.tsx`                          | App 컴포넌트 (Provider 트리) |
| `apps/web/src/app/routes/index.tsx`                 | Router (인증 분기)           |
| `apps/web/src/app/routes/private/PrivateRoutes.tsx` | 인증 필요 라우트 정의        |
| `apps/web/src/app/shared/layouts/UnifiedLayout.tsx` | 통합 레이아웃                |

### 통신 인프라

| 파일                                            | 설명                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| `libs/web-core/src/core/index.ts`               | webCore 인스턴스 생성, 환경변수, startWebCoreInit |
| `libs/web-core/src/core/cloudCore.ts`           | cloudCore (토큰/URL 관리)                         |
| `libs/web-core/src/core/coreStorage.ts`         | 스토리지 어댑터 (sessionStorage/localStorage)     |
| `libs/web-core/src/stores/useWebCoreStore.ts`   | webCore 전역 스토어                               |
| `libs/socket/src/hooks/useWebSocketV2.ts`       | WebSocket V2 훅                                   |
| `libs/socket/src/hooks/useWebSocketWorker.ts`   | WebSocket Worker 기반 훅                          |
| `libs/socket/src/stores/useWebSocketV2Store.ts` | WebSocket V2 스토어                               |

### 데이터 레이어

| 파일                                                        | 설명                                   |
| ----------------------------------------------------------- | -------------------------------------- |
| `apps/web/src/app/shared/data/DataProvider.tsx`             | DataProvider (Repository 팩토리)       |
| `libs/data/src/data/domain/models.ts`                       | 도메인 모델 정의                       |
| `libs/data/src/data/repositories/types.ts`                  | BaseRepository, DataContext, 캐시 정책 |
| `libs/data/src/data/repositories/ChatRepository.ts`         | 채팅 리포지토리                        |
| `libs/data/src/data/repositories/ChannelRepository.ts`      | 채널 리포지토리                        |
| `libs/data/src/data/repositories/SiteRepository.ts`         | 플레이스 리포지토리                    |
| `libs/data/src/data/repositories/JoinRepository.ts`         | 참여 리포지토리                        |
| `libs/data/src/data/repositories/UserRepository.ts`         | 사용자 리포지토리                      |
| `libs/data/src/data/remote/sockets/SocketRequestManager.ts` | 요청-응답 매칭                         |
| `libs/data/src/data/events/eventBus.ts`                     | EventBus 엔진                          |
| `libs/data/src/data/local/storages/IndexedDBAdapter.ts`     | IndexedDB 어댑터                       |
| `libs/data/src/data/local/storages/DynamicCacheStorage.ts`  | 동적 캐시 스토리지                     |

### 소켓 핸들러

| 파일                                                           | 설명               |
| -------------------------------------------------------------- | ------------------ |
| `libs/data/src/data/remote/sockets/handlers/chatHandler.ts`    | 채팅 메시지 핸들러 |
| `libs/data/src/data/remote/sockets/handlers/userHandler.ts`    | 사용자 핸들러      |
| `libs/data/src/data/remote/sockets/handlers/authHandler.ts`    | 인증 핸들러        |
| `libs/data/src/data/remote/sockets/handlers/modelHandler.ts`   | 모델 데이터 핸들러 |
| `libs/data/src/data/remote/sockets/handlers/syncHandler.ts`    | 동기화 핸들러      |
| `libs/data/src/data/remote/sockets/dispatchers/dispatchers.ts` | 소켓 디스패처      |

### 주요 훅 (apps/web/src/app/shared/hooks/)

| 훅                             | 설명                                   |
| ------------------------------ | -------------------------------------- |
| `useChats.ts`                  | 채팅 메시지 목록 (구독 + 페이지네이션) |
| `useChatMutations.ts`          | 메시지 전송/읽음/삭제                  |
| `useChatSync.ts`               | 채팅 동기화 (gap 감지 + 자동 채움)     |
| `useChannels.ts`               | 채널 목록 (캐시 + 네트워크 + 이벤트)   |
| `useChannelMutations.ts`       | 채널 생성/수정/삭제                    |
| `useChannelMembers.ts`         | 채널 멤버 목록                         |
| `useChannel.ts`                | 단일 채널 상세 + 조인 정보             |
| `usePlaces.ts`                 | 플레이스 목록                          |
| `usePlaceMutations.ts`         | 플레이스 생성/수정                     |
| `useCloudSwitchFlow.ts`        | 클라우드 전환 5단계 파이프라인         |
| `useCloudSession.ts`           | 클라우드 세션 관리                     |
| `useCloudTokenRefresh.ts`      | 클라우드 토큰 자동 갱신                |
| `useForegroundTokenRefresh.ts` | 포그라운드 복귀 시 토큰 갱신           |
| `useForegroundResync.ts`       | 포그라운드 복귀 시 데이터 재동기화     |
| `useConnectionRecoverySync.ts` | WebSocket 재연결 시 동기화             |
| `useTotalUnreadCount.ts`       | 전체 미읽음 카운트                     |
| `usePlaceUnreadCounts.ts`      | 플레이스별 미읽음 카운트               |
| `useInviteClouds.ts`           | 초대 클라우드 목록                     |
| `useInviteMutations.ts`        | 초대 관련 변이                         |

### 앱 레벨 컴포넌트

| 파일                                                        | 설명                                           |
| ----------------------------------------------------------- | ---------------------------------------------- |
| `apps/web/src/app/components/WebSocketV2Connection.tsx`     | WebSocket 연결 관리 (endpoint 결정, 토큰 갱신) |
| `apps/web/src/app/components/GlobalChatSync.tsx`            | 전역 채팅 동기화 (모든 채널 gap 감지)          |
| `apps/web/src/app/components/ServiceUnavailableOverlay.tsx` | 서비스 장애 표시                               |
| `apps/web/src/app/components/SettingsDialog.tsx`            | 설정 다이얼로그                                |

### Feature별 핵심 파일

| Feature     | 핵심 파일                                                          |
| ----------- | ------------------------------------------------------------------ |
| **auth**    | `features/auth/` — 로그인 페이지, 초대 코드 처리                   |
| **home**    | `features/home/components/PlaceList.tsx` — 플레이스 선택기         |
|             | `features/home/hooks/useUpdateMyProfile.ts` — 프로필 업데이트      |
|             | `features/home/routes/index.tsx` — HomeRoutes, CreateRoomRoutes    |
| **chats**   | `features/chats/routes/index.tsx` — ChatRoomPage, ChatSettingsPage |
| **places**  | `features/places/routes/index.tsx` — PlaceOrderPage, PlaceInfoPage |
| **account** | `features/account/routes/index.tsx` — 회원가입/비밀번호 재설정     |
| **search**  | `features/search/hooks/useSearch.ts` — 통합 검색                   |

---

> **문서 작성일**: 2025년 6월 기준 코드베이스 기반
>
> **패키지 버전**: @chatic/source v0.35.2
