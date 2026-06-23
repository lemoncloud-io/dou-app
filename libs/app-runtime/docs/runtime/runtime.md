# Runtime Domain Spec

Date: 2026-06-19

## 1. 목적

`runtime` 도메인은 `app-runtime` 패키지의 Composition Root 역할을 수행하며, 세션 레이어로부터 넘어온 실행 값을 받아 `socket`과 `data` 도메인 간의 바인딩을 매끄럽게 중재하고 생명주기(Lifecycle) 진입점을 제공한다.

현재 runtime이 조립하는 transport는 `@lemoncloud/chatic-sockets-lib`의 **v2 소켓 모듈**이다. 따라서 binding, bootstrap, binder 동작은 모두 `ClientSocketV2` 와 v2 gateway 조립 기준으로 해석한다. sync 역시 별도 React binder가 아니라 socket lifecycle 내부 서비스로 결합하는 것을 전제로 한다.

---

## 2. 핵심 설계 개념: RuntimeBinding

`runtime` 도메인의 입력 인터페이스는 `RuntimeBinding`이다. 이 값은 사용자의 로그인 상태 및 전환 행동에 따라 실시간으로 파생되는 실행 컨텍스트다.

```typescript
export interface RuntimeBinding {
    /** 데이터 저장소 컨텍스트에 바인딩할 데이터 세트 */
    context: {
        cid: string; // 클라우드 ID 혹은 중계서버 센티널 ('default')
        sid?: string; // 활성화된 사이트 ID
        uid?: string; // 활성화된 사용자 프로필 ID
    };
    /** 소켓 연결 매니저에 주입할 바인딩 설정 */
    socket: {
        config: {
            url: string; // 소켓 엔드포인트 URL
            deviceId: string; // 클라이언트 고유 디바이스 ID
            wssType?: 'relay' | 'cloud';
        };
    } | null;
}
```

---

## 3. 활성 서버(activeServer) 단일 관측 규칙

`RuntimeBinding` 내의 데이터는 `@chatic/web-core`의 컨텍스트 스토어가 관리하는 **활성 서버 상태(`activeServer`)**를 단일 관측하여 실시간으로 파생한다.

파생 및 바인딩 매핑 규칙은 다음과 같다.

- **클라우드 서버 활성화 (`activeServer.kind === 'cloud'`)**
    - `cid` = `activeServer.cloudId` (해당 클라우드 고유 ID)
    - `sid` = `activeServer.siteId` (선택된 사이트 ID)
- **중계 서버 활성화 (`activeServer.kind === 'relay'`)**
    - `cid` = `'default'` (중계서버 고유 센티널)
    - `sid` = `activeServer.siteId` (선택된 사이트 ID)
- **기타 바인딩 기본값 불변식**
    - `cid`의 기본 fallback은 `'default'`를 보장한다.
    - 사이트가 아직 미선택된 상황(클라우드 로그인 직후 등)에서는 `sid`가 `null`이 될 수 있다.
    - `uid`는 활성 서버의 로그인된 사용자 프로필(`cloudProfile` 또는 `relayProfile`)로부터 안전하게 파생하여 동기화한다.

---

## 4. 하이브리드 바인딩 전략: 훅 vs 컴포넌트

`app-runtime`은 값의 관측과 라이프사이클 통제를 분리하는 **하이브리드 아키텍처**를 채택했다.

1. **값의 파생 및 상태 조회: 훅(Hook)**
    - `useRuntimeBinding()`: `activeServer` 변화에 반응하여 현재 바인딩 규격을 파생한다.
    - `useRuntimeRepositories()`: 런타임에 바인딩된 최종 레포지토리 번들을 간편하게 획득한다.
2. **라이프사이클 동기화 및 갱신: 컴포넌트(Render-null Component)**
    - 조건에 따른 컴포넌트의 마운트/언마운트 시점을 React의 선언적 라이프사이클에 그대로 묶기 위해 바인더 컴포넌트를 사용한다.
    - 부모 트리에 마운트함으로써 관심사 및 상태 갱신 영역을 독립적으로 격리한다.

---

## 5. 바인더 컴포넌트 동작 방식

선언적 트리 구조 내에서 `RuntimeBinding` 변화에 독립적으로 반응하는 두 가지 바인더 컴포넌트가 존재한다.

### 1) `RuntimeDataBinder`

- `RuntimeBinding.context` 슬라이스를 구독한다.
- `cid`, `sid`, `uid` 등의 값에 변화(diff)가 발견되면, 즉시 [DataManager.ts](file:///Users/raine/Project/lemon/chatic-front/libs/app-runtime/src/data/DataManager.ts)의 `ensure(context)`를 호출하여 데이터 컨텍스트를 동기화한다.
- 데이터 레이어의 context가 갱신되면 DataProvider는 활성화된 스코프의 기존 캐시 데이터를 우선적으로 뷰에 반환(Cache-First)하여 부드러운 사용성을 확보한다.

### 2) `SocketBinder`

- 소켓 설정(url, wssType, deviceId 등)의 diff를 판단한다.
- 설정이 변경되면 [SocketManager.ts](file:///Users/raine/Project/lemon/chatic-front/libs/app-runtime/src/socket/SocketManager.ts)의 `ensure(config)`를 호출하여 기존 물리 커넥션을 정리(destroy)하고 새로운 커넥션을 빌드한다.
- sync runtime은 별도 `RuntimeSyncBinder` 없이 이 socket lifecycle을 따라 내부 서비스로 attach/detach된다.

---

## 관련 문서

- [../architecture.md](../architecture.md) — 전체 아키텍처 및 세션 오케스트레이션 지도
- [../public-surface.md](../public-surface.md) — 외부 앱에서 소비하는 공개 API 및 훅
- [./session-runner.md](./session-runner.md) — 백그라운드 세션 갱신 컴포넌트 및 `TransportBootstrap`
- [../data/data.md](../data/data.md) — 데이터 런타임 및 캐싱 반응 사양
