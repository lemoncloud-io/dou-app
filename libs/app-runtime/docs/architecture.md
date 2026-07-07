# App Runtime Architecture

Date: 2026-06-24
Status: Target Architecture

## 목적

이 문서는 `libs/app-runtime`의 소켓, 세션, sync 조립 방식을 다른 구현 에이전트가 바로 이해하고 작업할 수 있도록 정의한다.

이 문서는 현재 구현 설명보다 **목표 아키텍처**를 우선한다. 현재 코드와 차이가 있는 부분은 이후 리팩터링 대상이다.

## 결정 요약

`app-runtime`의 transport 계층은 아래 2개 manager 축으로 정리한다.

1. `SocketManager` — 소켓 생성/교체/상태
2. `SyncManager` — sync runtime 생성/조작

인증 수명주기는 별도 축(과거 `SocketSessionController`)이 아니라 **SDK `AuthController`(`client.auth`)** 가 소유하고, bootstrap 시퀀싱은 `SocketBinder`가 호출하는 순수 함수가 담당한다([auth/README.md](./auth/README.md)).

핵심 원칙:

- `createClientSocketV2`의 생성 책임은 `SocketManager`에만 둔다.
- `createDeviceRuntime`의 생성 책임은 `SyncManager`에만 둔다.
- 인증(만료 refresh·재연결 재인증·switch·백오프)은 SDK `AuthController`가 소유한다. app-runtime은 register/ready·구독만 배선한다.
- gateway는 raw client가 아니라 `SocketManager`의 stable socket API를 사용한다.
- sync는 raw runtime이 아니라 `SyncManager`를 통해서만 조작한다.
- `createSocketRuntime()`는 객체 조립만 담당하는 composition root로 유지한다.

## 시스템 구조

```mermaid
flowchart TD
  App["apps/*"] --> Host["RuntimeConnectionHost"]
  Host --> Bootstrap["TransportBootstrap"]
  Bootstrap --> Runner["SessionBackgroundRunner"]
  Bootstrap --> DataBinder["RuntimeDataBinder"]
  Bootstrap --> SocketBinder["SocketBinder"]

  Binding["useRuntimeBinding()"] --> Host

  DataBinder --> DataManager["DataManager"]
  SocketBinder --> SocketManager["SocketManager"]
  SocketBinder --> Bootstrap2["bootstrapSocketConnection()"]

  SocketManager --> Client["createClientSocketV2({ auth })"]
  Client --> Auth["client.auth: AuthController (SDK)"]
  Bootstrap2 --> Auth
  Bootstrap2 --> SocketManager
  SyncManager["SyncManager"] --> SocketManager
  SyncManager --> DeviceRuntime["createDeviceRuntime({ client, extraSyncPlans })"]
  SyncManager --> Plans["Domain Sync Plans"]

  SocketManager --> Gateways["Remote Gateways"]
  Gateways --> DataManager
```

## 책임 분리

### 1. `SocketManager`

책임:

- `ClientSocketV2` 생성, 교체, destroy
- 현재 socket state 저장 및 방송
- stable `request/send/onType/onMessage/onState` 제공
- socket 교체 시 listener 재바인딩

비책임:

- token 획득/갱신 정책
- `auth.update` orchestration
- sync runtime 생성

설계 의도:

- 과거의 `ManagedSocketClientProxy` 역할은 별도 클래스로 두지 않고 `SocketManager`로 흡수한다.
- 외부 gateway는 socket 교체 여부를 몰라도 되어야 한다.

### 2. 인증: SDK `AuthController` + `bootstrapSocketConnection()`

인증 수명주기는 SDK `AuthController`(`client.auth`)가 소유한다. 과거 `SocketSessionController`(수동 auth 엔진)는 **제거**되고, 남는 오케스트레이션은 `SocketBinder`가 호출하는 순수 함수 `bootstrapSocketConnection(...)`로 흡수한다.

`bootstrapSocketConnection({ manager, config, delegate })` 책임:

- bootstrap sequence — `ensure` → `connect` → `device.save` ack 대기 → `client.auth.register({ token, authId, sign })` + `await client.auth.ready()`
- SDK 인증 구독 배선: `onAuthState` → `manager.setVerified`, `onTokenRefresh` → `delegate.commitRefreshedToken`, `expired` → `delegate.onAuthExpired`

SDK `AuthController`가 소유(app-runtime 비책임):

- 토큰 획득/갱신 타이밍·만료 refresh·재연결 재인증·401 백오프·site switch

설계 의도:

- 인증 수명주기는 SDK가 SSoT로 소유하고, app-runtime은 register/ready·구독만 배선한다. 상태를 들고 있는 별도 controller 클래스를 두지 않는다.
- `device.save` ack 게이팅(서버가 device 링크 전 auth.update 거부)은 SDK가 알 수 없는 앱 오케스트레이션이므로 bootstrap 함수가 시퀀싱한다.
- `SocketSessionDelegate`를 통해 상위 세션 레이어(`@chatic/web-core`)의 active-server-aware register/sign/writeback 헬퍼와 결합한다.
- 인증 소유 경계·상태 머신·서명 계약은 [auth/README.md](./auth/README.md)·[auth/usage.md](./auth/usage.md)·[auth/signing.md](./auth/signing.md) 참조.

### 3. `SyncManager`

책임:

- 현재 client 기준 `createDeviceRuntime({ client, extraSyncPlans })`
- runtime `start()` / `stop()`
- `startSync()` / `stopSync()`
- 필요 시 target registry, replay, dedupe
- 앱 고유 sync 정책 수용 지점

비책임:

- token refresh
- gateway request 재시도

설계 의도:

- 기존 `AppSyncRuntime`은 제거 대상이라기보다 `SyncManager`로 재편 대상이다.
- `createDeviceRuntime`은 외부로 직접 노출하지 않는다.

## 생성 및 주입 위치

### `createClientSocketV2`

- 위치: `SocketManager` 내부
- 이유: socket transport 생성 책임을 한 곳에 모으기 위함

### `createDeviceRuntime`

- 위치: `SyncManager` 내부
- 이유: sync runtime 생성과 sync target 조작을 한 계층에 모으기 위함

### `createSocketRuntime()`

- 위치: `src/socket/runtime.ts`
- 역할: 아래 객체의 조립만 수행

```ts
const socketManager = new SocketManager();
const syncManager = new SyncManager(socketManager, { runtimeOptions: DEFAULT_SYNC_RUNTIME_OPTIONS });
// 인증 수명주기(만료 refresh·재연결 재인증·401 백오프)는 SDK AuthController가 소유한다.
// bootstrap 시퀀싱(register/ready + onAuthState/onTokenRefresh 배선)은 SocketBinder가
// bootstrapSocketConnection(...)로 수행한다 — 별도 controller 인스턴스는 없다.

return {
    socketManager,
    syncManager,
};
```

## 외부 사용 규칙

### gateway / remote data layer

- `SocketManager`만 사용한다.
- raw `ClientSocketV2`에 직접 의존하지 않는다.

### sync hooks / feature layer

- `SyncManager`만 사용한다.
- raw `ClientSocketRuntime` 또는 `createDeviceRuntime`에 직접 의존하지 않는다.

### auth/session binding

- 인증 수명주기는 SDK `AuthController`(`client.auth`)가 소유한다. `SocketBinder`가 `bootstrapSocketConnection(...)`으로 register/ready·구독을 배선하며, 상태를 들고 있는 controller 클래스는 없다.
- 토큰/site 변경은 별도 binder 없이 SDK가 담당한다 — 만료·재연결은 자동, site 전환은 `client.auth.switch(`${uid}@${siteId}`)`, 갱신 결과는 `onTokenRefresh` → web-core writeback.

## 모듈 구조

```text
libs/app-runtime/src/
  connection/
    RuntimeConnectionHost.tsx
    RuntimeDataBinder.tsx
    SocketBinder.tsx
    SessionBackgroundRunner.tsx
    TransportBootstrap.tsx
  runtime/
    RuntimeManager.ts
    useRuntimeBinding.ts
  socket/
    SocketManager.ts
    bootstrapSocketConnection.ts
    runtime.ts
    types.ts
    sync/
      SyncManager.ts
      plans.ts
      types.ts
      hooks/
        useSyncTarget.ts
  data/
    DataManager.ts
    runtime.ts
    factories/
      remoteFactory.ts
  push/
    useDeviceTokenRegistration.ts
```

## 구현 단계별 전환 규칙

### 1단계

- `ManagedSocketClientProxy`를 새로 확장하지 않는다.
- request/rebind 역할을 `SocketManager`로 흡수한다.

### 2단계

- `AppSyncRuntime`를 `SyncManager`로 교체한다.
- `createDeviceRuntime` 호출은 `SyncManager` 내부로 이동한다.

### 3단계

- sync hook은 `getSyncManager().register(...)` 또는 동등 API만 사용한다.
- `remoteFactory`는 `getSocketRuntime().socketManager`를 사용한다.

## 현재 코드와의 차이

목표 아키텍처와 코드가 정렬되었다 (2026-06-24 리팩터링 완료):

- `ManagedSocketClientProxy`는 제거되었고 request facade는 `SocketManager`로 흡수되었다.
- `AppSyncRuntime`는 `SyncManager`로 재편되었고 `createDeviceRuntime` 소유 + 튜닝 옵션 주입 표면(`SyncManagerDeps.runtimeOptions`)을 갖는다.
- 401 recovery는 `SocketManager.request`가 감지·재시도하되 복구 정책은 주입된 핸들러(`setRecoveryHandler` → `SocketSessionController.handle401Recovery`)에 위임한다.

남은 후속:

- runtime 튜닝 값의 외부 config(connectionDraft류) 연결 — 현재는 composition root의 기본 상수(빈 값=엔진 기본 유지). 주입 표면은 준비됨.
- **인증 SDK 도입(진행 트랙)** — 위 §2는 목표(SDK `AuthController` 소유 + `bootstrapSocketConnection` 함수) 기준이다. 현재 코드는 아직 `SocketSessionController`가 수동 인증(`updateAuth`·주기 refresh·single-flight 401 recovery)을 수행하고 `SocketAuthBinder`가 `updateAuth('session-switch')`를 호출한다. 도입은 (1) 수동 auth 경로 제거, (2) `SocketSessionController` 클래스 **삭제** + bootstrap 로직을 `bootstrapSocketConnection`으로 이관, (3) `SocketAuthBinder` 삭제, (4) `getSocketRuntime()` 공개 표면에서 `sessionController` 제거. 단계·서명/writeback 계약은 [auth/usage.md](./auth/usage.md) §3, [auth/signing.md](./auth/signing.md) 참조.

## 완료 기준

- gateway가 `ManagedSocketClientProxy` 없이 동작한다.
- sync 관련 생성 책임이 `SyncManager` 하나로 모인다.
- `createClientSocketV2`와 `createDeviceRuntime`이 외부 호출부에서 사라진다.
- 인증은 SDK `AuthController`가 소유하고, `SocketSessionController`/`SocketAuthBinder`가 코드에서 사라진다(bootstrap은 `bootstrapSocketConnection` 함수).
- socket/sync 책임과 인증 소유 경계가 문서와 코드에서 동일하게 보인다.
