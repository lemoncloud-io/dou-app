# useWebSocketV2 Refactoring SPEC

## 1. 목적

### 왜 리팩토링이 필요한가

현재 `useWebSocketV2`는 Web Worker 기반 WebSocket 단일 연결을 관리하는 hook으로, 연결 생성/종료, 메시지 송수신, 재연결, 상태 관리가 하나의 hook과 전역 변수에 결합되어 있다. 이로 인해:

1. **단일 socket 강제** — 전역 singleton Worker로 인해 multi socket이 불가능
2. **lastMessage 덮어쓰기** — Zustand store의 단일 `lastMessage` 필드에 모든 메시지가 순차 대입되어, 빠른 메시지 유입 시 중간 메시지 누락 가능
3. **테스트 어려움** — Worker 의존, 전역 변수, 실제 WebSocket 생성이 hook 내부에 결합
4. **책임 과다** — 연결 관리, 인증 대기, 메시지 라우팅, store 업데이트가 한 곳에 혼재

### 이번 리팩토링으로 얻는 이점

- WebSocket 구현부를 추상화하여 기능 코드가 bridge 세부사항에 의존하지 않게 함
- multi socket 지원 가능한 구조 확보
- 메시지 유실 위험 감소 (subscription/queue 기반)
- 단위 테스트 가능한 구조

### 이번 작업의 범위

- 코드베이스 분석 및 리팩토링 SPEC 문서 작성
- 새 WebSocket abstraction 인터페이스 설계
- migration 전략 수립

### 이번 작업에서 하지 않을 것

- 기존 `useWebSocketV2` 코드 수정
- 기존 호출부 수정
- 기존 store 수정
- 기존 Worker 수정
- 신규 WebSocket manager/hook 실제 구현
- 테스트 코드 작성
- 기존 `lastMessage` 구조 삭제
- 기존 단일 socket 흐름 변경

### 핵심 원칙

- 기존 `useWebSocketV2`를 **즉시 제거하지 않는다**
- 기존 호출부를 **한 번에 수정하지 않는다**
- 새 구조를 **별도 모듈로 추가**하고 점진 migration한다
- 기존 `useWebSocketV2`는 **deprecated 처리 후 유지**하는 방향

---

## 2. 현재 구조 분석

### 관련 파일

| 파일                                                         | 역할                                                     | 리팩토링 영향            |
| ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------ |
| `libs/socket/src/hooks/useWebSocketV2.ts`                    | 메인 hook (Worker 생성, send/emit, store 업데이트)       | deprecated 처리 대상     |
| `libs/socket/src/stores/useWebSocketV2Store.ts`              | Zustand store (연결 상태, lastMessage)                   | compatibility layer 필요 |
| `apps/web/public/websocket.worker.js`                        | Worker 내부 WebSocket 구현 (reconnect, heartbeat, queue) | 재사용 또는 교체 검토    |
| `libs/socket/src/services/WebSocketService.ts`               | Generic WebSocket 클래스 (useWebSocket용)                | 참고용                   |
| `libs/socket/src/hooks/useWebSocketWorker.ts`                | Worker 기반 generic hook                                 | 참고용                   |
| `libs/socket/src/hooks/useWebSocket.ts`                      | Generic hook (WebSocketService 사용)                     | 참고용                   |
| `libs/socket/src/types/index.ts`                             | ConnectionStatus, BaseWebSocketMessage 등 타입           | 확장 대상                |
| `libs/data/src/sync-events/useGlobalSocketRouter.ts`         | lastMessage subscriber → 도메인 핸들러 라우팅            | migration 대상           |
| `apps/web/src/app/features/home/hooks/useUpdateMyProfile.ts` | lastMessage subscriber → 특정 응답 대기                  | migration 대상           |
| `apps/web/src/app/components/WebSocketV2Connection.tsx`      | App-level connection 초기화 컴포넌트                     | migration 대상           |
| `apps/web/src/app/shared/hooks/useSocketAuth.ts`             | 인증 토큰 전송                                           | 참고                     |
| `apps/web/src/app/shared/hooks/useCloudSession.ts`           | cloudId/isVerified store 업데이트                        | 참고                     |
| `libs/data/src/sync-events/useBroadcastBridge.ts`            | 탭 간 동기화 (BroadcastChannel)                          | 별도 시스템              |

### useWebSocketV2의 현재 역할

1. **Worker 생성** — singleton `new Worker('/websocket.worker.js')`
2. **연결 관리** — `connect()`, `disconnect()` via Worker postMessage
3. **메시지 수신** — Worker onmessage → `store.setLastMessage(envelope)`
4. **메시지 전송** — `send()`, `emit()`, `emitAuthenticated()`
5. **인증 상태 관리** — `isVerified` flag, deferred emit
6. **연결 상태 관리** — `isConnected`, `connectionStatus`
7. **전역 함수 노출** — `globalSendFn`, `globalEmitFn`, `globalEmitAuthenticatedFn`

### WebSocket 생성 / 연결 / 종료 흐름

```
useWebSocketV2(config) mount
  → new Worker('/websocket.worker.js')  [singleton, line 115]
  → worker.postMessage({ type: 'connect', config: { endpoint, deviceId } })
  → Worker 내부: new WebSocket(url)
  → Worker → main: { type: 'status', status: 'connected' }
  → store.setIsConnected(true)

disconnect:
  → worker.postMessage({ type: 'disconnect' })
  → Worker: ws.close(), isManualDisconnect = true
  → Worker → main: { type: 'status', status: 'disconnected' }

unmount cleanup:
  → disconnect()
  → worker.terminate()
  → globalWorkerRef = null
```

### 메시지 수신 흐름

```
WebSocket server → ws.onmessage (Worker)
  → JSON.parse(event.data)
  → self.postMessage({ type: 'message', data })
  → useWebSocketV2 worker.onmessage handler [line 126-138]
  → store.setLastMessage(envelope)
  → Zustand subscribeWithSelector 발동
  → useGlobalSocketRouter의 handleSyncMessage 실행
  → 도메인 핸들러 (chatHandler, userHandler 등) 호출
```

### 메시지 전송 흐름

```
send(data):
  → worker.postMessage({ type: 'send', data })
  → Worker: ws.send(JSON.stringify(data))  [또는 queue에 추가]

emit(data):
  → isConnected 확인
  → true → 즉시 send
  → false → store.subscribe(isConnected) 대기 후 send

emitAuthenticated(data):
  → isVerified 확인
  → true → 즉시 send
  → false → store.subscribe(isVerified) 대기 후 send
```

### reconnect / heartbeat / cleanup 흐름

**Reconnect (Worker 내부):**

- `ws.onclose` → `attemptReconnect()`
- exponential backoff: `min(1000 * 2^attempts, 30000)`
- `isManualDisconnect === true` → reconnect 안 함

**Heartbeat (Worker 내부):**

- `startSyncInfoHeartbeat()`: 60초마다 `{ type: 'sync', action: 'info' }` 전송
- 응답 5초 이내 미수신 → `ws.close()` (reconnect 트리거)
- 2시간 연결 유지 → force reconnect

**Cleanup:**

- `disconnect()` → Worker에 disconnect 전달 → Worker 내부 정리
- unmount → `worker.terminate()` → Worker 자체 종료

### lastMessage 저장 / 소비 흐름

**저장:**

```typescript
// useWebSocketV2.ts line 129
store.setLastMessage(envelope);
```

**소비:**

```typescript
// useGlobalSocketRouter.ts line 91
useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);

// useUpdateMyProfile.ts
useWebSocketV2Store.subscribe(s => s.lastMessage, lastMessage => { ... });
```

### 관련 store 구조

```typescript
interface WebSocketV2State {
    id: string | null;
    cloudId: string; // 'default' | actual cloudId
    wssType: WSSType | null; // 'relay' | 'cloud'
    connectionId: string | null;
    isConnected: boolean;
    isVerified: boolean;
    connectionStatus: ConnectionStatus; // 'disconnected' | 'connecting' | 'connected' | 'error'
    lastMessage: WSSEnvelope | null;
    deviceId: string | null;
}
```

### 현재 단일 socket 전제 여부

**확인됨: 단일 socket 전제**

- `globalWorkerRef` — 전역 단일 Worker 참조 (line 18)
- `globalSendFn` / `globalEmitFn` / `globalEmitAuthenticatedFn` — 전역 단일 함수
- store에 `lastMessage` 단일 필드 (socketId 구분 없음)
- `useWebSocketV2Store`에 `cloudId` 단일 값 (multi socket이면 socket별 필요)

### multi socket 확장 시 영향을 받을 부분

- `globalWorkerRef` — socket별 Worker 필요
- `globalSendFn` 등 — socket별 send 함수 필요
- `useWebSocketV2Store` — socket별 state 필요
- `useGlobalSocketRouter` — socketId별 메시지 분리 필요
- `WebSocketV2Connection.tsx` — multi connection 관리

---

## 3. 문제점

### 실제로 확인된 문제

#### 3.1 단일 socket 전제로 인한 확장 불가

- **근거**: `globalWorkerRef` (line 18), `globalSendFn` (line 19) — 전역 단일 변수
- **영향**: multi socket(예: relay + cloud 동시 연결) 불가

#### 3.2 lastMessage 단일 필드 덮어쓰기

- **근거**: `store.setLastMessage(envelope)` (line 129) — 모든 메시지가 같은 필드에 대입
- **영향**: Zustand `set()` 호출 사이의 메시지는 subscriber가 감지하지 못할 **가능성** 있음
- **주의**: Zustand `subscribeWithSelector`는 매 `set()` 호출마다 listener를 동기적으로 실행하므로, Worker → main thread postMessage가 JS event loop에 의해 순차 처리되는 한 이론적으로 모든 메시지가 전달됨. 단, **같은 microtask 내에서 연속 `set()` 호출 시 batching 가능성은 확인 필요**

#### 3.3 전역 변수 의존 및 테스트 불가

- **근거**: `globalWorkerRef`, `globalSendFn`, `globalEmitFn`, `globalEmitAuthenticatedFn` (lines 18-21)
- **영향**: 단위 테스트에서 mock 불가, isolation 불가

#### 3.4 hook 내부 책임 과다

- **근거**: `useWebSocketV2.ts` (307줄) 내에 Worker 생성, 연결 관리, 인증 대기, 메시지 처리, store 업데이트, 전역 함수 할당이 모두 존재
- **영향**: 변경 시 side effect 범위가 넓음

#### 3.5 emit/emitAuthenticated의 subscription 누적 가능성

- **근거**: `emit()` (lines 221-228), `emitAuthenticated()` (lines 245-253) — 연결/인증 대기 시 store.subscribe 생성
- **영향**: 빠르게 여러 emit을 호출하면 subscribe가 쌓임. connected 되면 모두 실행되지만, 연결이 안 되면 unsubscribe 되지 않은 listener가 메모리에 남을 수 있음

### 잠재 문제 / 리스크

#### 3.6 lastMessage 빠른 유입 시 메시지 누락 [확인 필요]

- Worker의 `onmessage`는 event loop에서 순차 실행되므로 이론적으로 안전
- 하지만 Zustand의 `subscribeWithSelector` 내부 equality check (`Object.is`)가 null → envelope A → envelope B 순서에서 A를 건너뛸 가능성은 **낮지만 zero가 아님**
- 특히 envelope 객체가 동일 reference면 skip됨 (현재는 매번 새 객체이므로 이 경우는 아님)

#### 3.7 reconnect 중 emit subscription 타이밍 [확인 필요]

- disconnect → reconnect 중에 `emitAuthenticated()` 호출 시, `isVerified`가 false → subscribe 생성
- reconnect 후 `isVerified = true` 되면 deferred 메시지 전송
- 하지만 reconnect 중에 여러 emit이 쌓이면 순서 보장은 **Worker messageQueue 순서에 의존**

#### 3.8 cleanup 시 globalSendFn 미초기화 [의도적]

- unmount 시 `globalSendFn`을 null로 만들지 않음 (line 287-293 주석 참고)
- 이는 의도적 — 새 Worker 생성 시 ref가 갱신되므로 문제 없다는 판단
- 하지만 unmount 후 재 mount 사이에 emit 호출이 있으면 dead Worker에 전송 가능

---

## 4. 리팩토링 방향

### 레이어 분리 제안

```
Feature Code / Hooks
  ↓ (logger.info, emitAuthenticated 등)
useWebSocketClient (React Hook)
  ↓
WebSocketManager (Pure TypeScript class, no React dependency)
  ↓
WebSocketClient (단일 socket 추상화)
  ↓
WebSocket Adapter (Worker 기반 또는 직접 WebSocket)
  ↓
Native WebSocket API (Worker 내부)
```

### 책임 분리

| 레이어                        | 책임                                    | 금지                         |
| ----------------------------- | --------------------------------------- | ---------------------------- |
| **WebSocketClient**           | 단일 socket 연결/종료/send/subscribe    | React state, store 직접 갱신 |
| **WebSocketManager**          | multi socket 관리, socketId별 lifecycle | UI 업데이트, domain logic    |
| **useWebSocketClient (hook)** | React lifecycle 연동, store 동기화      | 직접 WebSocket 생성          |
| **Feature hooks**             | domain emit/subscribe                   | WebSocket 세부사항 접근      |

### Option 비교

#### Option A. 기존 useWebSocketV2 유지 + 신규 hook 추가 (추천)

```
useWebSocketV2          → deprecated, 기존 코드 유지
useWebSocketClient      → 신규, WebSocketManager 기반
WebSocketManager        → 신규, multi socket 지원
```

**장점:**

- 기존 기능 깨질 위험이 가장 낮음
- 신규 구조를 안전하게 검증 가능
- migration을 천천히 진행 가능

**단점:**

- 일정 기간 중복 구조가 존재함
- old/new WebSocket 흐름이 동시에 존재할 수 있음

#### Option B. useWebSocketV2 내부만 새 manager로 감싸기

```
useWebSocketV2          → 외부 API 유지, 내부만 WebSocketManager 사용
WebSocketManager        → 신규
```

**장점:**

- 호출부 변경 적음
- 내부 구조 개선 가능

**단점:**

- 기존 API에 새 구조가 묶임
- multi socket 설계를 충분히 활용하기 어려움
- 기존 동작과 미묘하게 달라질 위험

#### Option C. useWebSocketV2를 직접 대규모 수정

**지양** — regression 위험이 크고 이번 방향에 부적합

### 추천: Option A

기존 `useWebSocketV2`는 deprecated 처리하고, 신규 `WebSocketManager` + `useWebSocketClient` hook을 별도로 추가한다.

---

## 5. 인터페이스 및 함수 설계 제안

### 5.1 핵심 타입

```typescript
// libs/socket/src/types/websocket-manager.ts

export type SocketId = string;

export type WebSocketStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface WebSocketConfig {
    socketId: SocketId;
    url: string;
    deviceId: string;
    token?: string;
    authQueryParam?: string;
    channels?: string;
    auth?: boolean;
    reconnect?: boolean;
    heartbeatInterval?: number;
    forceReconnectInterval?: number;
}

export interface WebSocketMessageEvent<T = unknown> {
    socketId: SocketId;
    sequence: number;
    receivedAt: number;
    data: T;
}

export interface WebSocketErrorEvent {
    socketId: SocketId;
    error: unknown;
    occurredAt: number;
}

export interface WebSocketConnectionState {
    socketId: SocketId;
    status: WebSocketStatus;
    connectedAt?: number;
    disconnectedAt?: number;
    reconnectAttempt: number;
    error?: unknown;
}

export type WebSocketMessageListener<T = unknown> = (event: WebSocketMessageEvent<T>) => void;

export type WebSocketStatusListener = (state: WebSocketConnectionState) => void;

export type WebSocketUnsubscribe = () => void;
```

### 5.2 WebSocketClient interface

```typescript
// libs/socket/src/manager/types.ts

export interface WebSocketClient<TMessage = unknown> {
    connect(): void;
    disconnect(reason?: string): void;
    send(message: unknown): void;
    subscribe(listener: WebSocketMessageListener<TMessage>): WebSocketUnsubscribe;
    onStatusChange(listener: WebSocketStatusListener): WebSocketUnsubscribe;
    getStatus(): WebSocketStatus;
    getState(): WebSocketConnectionState;
}
```

기능 코드가 아래를 직접 알지 않도록 캡슐화:

- `new WebSocket(url)`
- `socket.onopen / onmessage / onerror / onclose`
- reconnect timer
- Worker postMessage protocol
- raw message parsing

### 5.3 WebSocketManager interface

```typescript
// libs/socket/src/manager/types.ts

export interface WebSocketManager {
    connect(config: WebSocketConfig): void;
    disconnect(socketId: SocketId, reason?: string): void;
    disconnectAll(reason?: string): void;
    send(socketId: SocketId, message: unknown): void;
    subscribe<TMessage = unknown>(
        socketId: SocketId,
        listener: WebSocketMessageListener<TMessage>
    ): WebSocketUnsubscribe;
    onStatusChange(socketId: SocketId, listener: WebSocketStatusListener): WebSocketUnsubscribe;
    getState(socketId: SocketId): WebSocketConnectionState | undefined;
    getAllStates(): Record<SocketId, WebSocketConnectionState>;
    hasSocket(socketId: SocketId): boolean;
}
```

### 5.4 Factory 함수 설계

#### createWebSocketClient

```typescript
function createWebSocketClient(config: WebSocketConfig): WebSocketClient;
```

- **역할**: 단일 WebSocket 연결을 캡슐화한 client 생성
- **호출 시점**: Manager 내부에서 socket 연결 요청 시
- **입력**: `WebSocketConfig` (url, deviceId, reconnect 정책 등)
- **반환**: `WebSocketClient` instance
- **내부 책임**: Worker 생성, 이벤트 바인딩, send, subscribe, disconnect, reconnect, cleanup
- **책임 아님**: React 상태 관리, UI 업데이트, domain 메시지 처리, store 갱신
- **예상 파일**: `libs/socket/src/manager/createWebSocketClient.ts`

#### createWebSocketManager

```typescript
function createWebSocketManager(): WebSocketManager;
```

- **역할**: 여러 WebSocketClient를 socketId 기준으로 관리
- **호출 시점**: App 초기화 시 singleton으로 생성
- **입력**: 없음 (옵션 추가 가능)
- **반환**: `WebSocketManager` instance
- **내부 책임**: socketId별 client 생성/관리, connect/disconnect, send, subscribe, 전체 cleanup
- **책임 아님**: raw message domain parsing, feature store 업데이트, UI 상태 관리
- **예상 파일**: `libs/socket/src/manager/createWebSocketManager.ts`

### 5.5 내부 함수 설계

#### connectSocket

```typescript
function connectSocket(socketId: SocketId, config: WebSocketConfig): void;
```

- **역할**: Worker에 connect 메시지 전송, socket 상태를 connecting으로 전환
- **호출 시점**: Manager.connect() 호출 시
- **내부 책임**: Worker 생성(없으면), connect config 전달, state 초기화
- **책임 아님**: 인증 대기, domain 메시지 처리
- **예상 파일**: `libs/socket/src/manager/internals/connectSocket.ts`

#### disconnectSocket

```typescript
function disconnectSocket(socketId: SocketId, reason?: string): void;
```

- **역할**: 특정 socket 연결 종료
- **호출 시점**: Manager.disconnect() 또는 cleanup 시
- **내부 책임**: Worker에 disconnect 전달, listener 정리, state 업데이트
- **책임 아님**: 다른 socket 영향
- **예상 파일**: `libs/socket/src/manager/internals/disconnectSocket.ts`

#### sendSocketMessage

```typescript
function sendSocketMessage(socketId: SocketId, message: unknown): void;
```

- **역할**: 특정 socket으로 메시지 전송
- **호출 시점**: Manager.send() 호출 시
- **내부 책임**: Worker에 send 전달 (Worker 내부에서 queue 관리)
- **책임 아님**: 인증 확인 (그건 hook 레이어 책임)
- **예상 파일**: `libs/socket/src/manager/internals/sendSocketMessage.ts`

#### subscribeSocketMessage

```typescript
function subscribeSocketMessage<TMessage = unknown>(
    socketId: SocketId,
    listener: WebSocketMessageListener<TMessage>
): WebSocketUnsubscribe;
```

- **역할**: 특정 socket의 메시지를 구독
- **호출 시점**: hook mount 시 또는 Manager.subscribe() 호출 시
- **내부 책임**: listener 등록, unsubscribe 함수 반환
- **책임 아님**: 메시지 필터링, domain routing
- **예상 파일**: `libs/socket/src/manager/internals/subscribeSocketMessage.ts`

#### handleSocketMessage

```typescript
function handleSocketMessage(socketId: SocketId, event: MessageEvent): void;
```

- **역할**: Worker로부터 수신된 메시지를 등록된 모든 listener에 전달
- **호출 시점**: Worker onmessage에서 type === 'message' 수신 시
- **내부 책임**: sequence 부여, timestamp 기록, 모든 listener 호출
- **책임 아님**: domain parsing, store 업데이트
- **예상 파일**: `libs/socket/src/manager/internals/handleSocketMessage.ts`

#### scheduleReconnect

```typescript
function scheduleReconnect(socketId: SocketId): void;
```

- **역할**: socket 끊김 시 재연결 스케줄링
- **호출 시점**: Worker에서 disconnected 상태 수신 시 (비수동)
- **내부 책임**: exponential backoff 타이머, 상태를 reconnecting으로 전환
- **책임 아님**: 현재 Worker에서 처리 중 — Manager 레이어로 올릴지 Worker에 유지할지 결정 필요
- **예상 파일**: Worker 내부 유지 또는 `libs/socket/src/manager/internals/scheduleReconnect.ts`

#### cleanupSocket

```typescript
function cleanupSocket(socketId: SocketId): void;
```

- **역할**: 특정 socket 자원 완전 정리
- **호출 시점**: disconnect + 더 이상 사용하지 않을 때
- **내부 책임**: Worker terminate, listener 모두 제거, state 제거
- **책임 아님**: 다른 socket 영향
- **예상 파일**: `libs/socket/src/manager/internals/cleanupSocket.ts`

#### cleanupAllSockets

```typescript
function cleanupAllSockets(): void;
```

- **역할**: 모든 socket 정리 (logout, app 종료)
- **호출 시점**: logout callback 또는 Manager.disconnectAll()
- **내부 책임**: 모든 socketId에 대해 cleanupSocket 호출
- **예상 파일**: `libs/socket/src/manager/internals/cleanupSocket.ts`

### 5.6 Message 처리 함수 설계

#### createMessageEvent

```typescript
function createMessageEvent<T = unknown>(socketId: SocketId, data: T, sequence: number): WebSocketMessageEvent<T>;
```

- **역할**: raw 메시지를 표준 이벤트 객체로 변환
- **내부 책임**: socketId, sequence, receivedAt(timestamp) 부여

#### publishMessage

```typescript
function publishMessage<T = unknown>(socketId: SocketId, event: WebSocketMessageEvent<T>): void;
```

- **역할**: 해당 socketId에 등록된 모든 listener에 메시지 전달
- **내부 책임**: listener 배열 순회, 각 listener 호출

### 5.7 Store 관련 함수 설계

기존 `useWebSocketV2Store`를 즉시 변경하지 않는다. 신규 store를 별도로 제안:

```typescript
// libs/socket/src/stores/useWebSocketManagerStore.ts

interface WebSocketManagerStoreState {
    sockets: Record<SocketId, SocketState>;
}

interface SocketState {
    status: WebSocketStatus;
    connectedAt?: number;
    disconnectedAt?: number;
    reconnectAttempt: number;
    error?: unknown;
}

// Actions
function setSocketStatus(socketId: SocketId, status: WebSocketStatus): void;
function setSocketError(socketId: SocketId, error: unknown): void;
function removeSocketState(socketId: SocketId): void;
function resetAllSockets(): void;
```

**주의**: 기존 `useWebSocketV2Store`는 유지. 신규 store는 Manager 전용.

### 5.8 신규 hook API 제안

#### 네이밍 후보 비교

| 후보                  | 장점                        | 단점                            |
| --------------------- | --------------------------- | ------------------------------- |
| `useWebSocketClient`  | 명확, Client interface 대응 | 기존 `useWebSocket`과 혼동 가능 |
| `useWebSocketManager` | Manager 기반임을 명시       | hook이 Manager 자체인지 혼동    |
| `useManagedWebSocket` | managed 임을 강조           | 길이                            |
| `useSocketConnection` | 간결                        | 기존 네이밍과 패턴 불일치       |
| `useWebSocketV3`      | 버전 명시                   | 장기적으로 부적절               |

**추천: `useManagedWebSocket`**

기존 `useWebSocket`, `useWebSocketV2`와 구분되며, Manager 기반임을 암시.

#### 예상 형태

```typescript
// libs/socket/src/hooks/useManagedWebSocket.ts

export interface UseManagedWebSocketConfig {
    socketId: SocketId;
    url: string;
    deviceId: string;
    enabled?: boolean;
    token?: string;
    authQueryParam?: string;
    reconnect?: boolean;
    onMessage?: WebSocketMessageListener;
}

export interface UseManagedWebSocketReturn {
    status: WebSocketStatus;
    isConnected: boolean;
    send: (message: unknown) => void;
    disconnect: () => void;
}

export function useManagedWebSocket(config: UseManagedWebSocketConfig): UseManagedWebSocketReturn;
```

- hook이 내부에서 singleton Manager를 참조
- socketId 기반으로 Manager에 connect/disconnect 위임
- onMessage callback으로 메시지 수신 (lastMessage store 대신)
- unmount 시 자동 unsubscribe

---

## 6. lastMessage 처리 전략

### 현재 분석

| 질문                                       | 답변                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| lastMessage는 최신 값 저장 용도인가?       | 아니다. 사실상 **이벤트 전달 수단**으로 사용 중                                                    |
| 메시지 연속 시 모두 소비되는가?            | Zustand `subscribeWithSelector`가 매 `set()` 마다 동기 호출하므로 **이론상 yes**, 하지만 보장 아님 |
| store subscriber가 빠른 유입을 감지하는가? | Worker → main thread postMessage는 event loop task queue 순차 → 대부분 OK                          |
| multi socket에서 메시지 분리 가능한가?     | **불가** — lastMessage에 socketId 정보 없음                                                        |

### 현재 lastMessage가 이벤트 전달 용도로 쓰이는 근거

```typescript
// useGlobalSocketRouter.ts line 91
useWebSocketV2Store.subscribe(state => state.lastMessage, handleSyncMessage);
```

이 패턴은 "최신 상태 읽기"가 아니라 "새 메시지가 올 때마다 handler 실행"이다. 즉, `lastMessage`는 사실상 **event emitter의 역할**을 store 필드로 흉내내고 있다.

### 옵션 비교

#### Option A. lastMessage 유지 + sequence 추가

```typescript
interface WebSocketV2State {
    lastMessage: WSSEnvelope | null;
    lastMessageSequence: number; // 매 메시지마다 +1
}
```

- **장점**: 기존 구조 변경 최소, subscriber가 sequence 변화로 모든 메시지 감지 가능
- **단점**: 여전히 단일 필드 (이전 메시지 접근 불가)
- **위험도**: 낮음

#### Option B. event subscription 도입 (추천)

```typescript
// Manager 내부
manager.subscribe(socketId, (event: WebSocketMessageEvent) => {
    // 모든 메시지를 callback으로 수신
});
```

- **장점**: 메시지 유실 원천 차단, multi socket 자연스러운 지원
- **단점**: 기존 consumer 패턴 변경 필요
- **위험도**: 중간 (기존 코드와 병행 가능)

#### Option C. messageQueue 도입

```typescript
interface SocketState {
    messageQueue: WebSocketMessageEvent[];
}
```

- **장점**: 모든 메시지 보존, 순차 처리 가능
- **단점**: queue drain 정책 필요, 메모리 관리 필요
- **위험도**: 중간

### 추천 전략

**Option B (event subscription)을 신규 구조에 적용**하고, 기존 `lastMessage`는 compatibility layer로 유지:

1. 신규 Manager는 `subscribe()` 기반 (모든 메시지 callback 전달)
2. 기존 `useWebSocketV2Store.lastMessage`는 deprecated 유지
3. 점진 migration: `useGlobalSocketRouter`가 Manager.subscribe로 전환되면 lastMessage 제거 가능

---

## 7. Multi Socket 설계 방향

### socketId 도입

- 기존 단일 socket: `socketId = 'default'` 암묵적 사용
- multi socket: socketId 명시 필수 (예: `'cloud-abc123'`, `'relay'`)

### socket별 관리

| 항목             | 기존                        | 제안                            |
| ---------------- | --------------------------- | ------------------------------- |
| connection state | store 단일 `isConnected`    | `sockets[socketId].status`      |
| lastMessage      | store 단일 필드             | 각 socket의 subscriber callback |
| send             | `globalSendFn`              | `manager.send(socketId, data)`  |
| reconnect        | Worker 내부 단일            | socket별 독립 Worker            |
| cleanup          | 전역 terminate              | `manager.disconnect(socketId)`  |
| error state      | `connectionStatus: 'error'` | `sockets[socketId].error`       |

### store shape 제안

```typescript
// 신규 store (기존 store와 별도)
interface WebSocketManagerStoreState {
    sockets: Record<
        SocketId,
        {
            status: WebSocketStatus;
            connectedAt?: number;
            disconnectedAt?: number;
            reconnectAttempt: number;
            error?: unknown;
        }
    >;
}
```

**주의**: 기존 `useWebSocketV2Store`는 유지. 신규 store는 Manager 전용으로 별도 생성.

### 기존 단일 socket API와의 호환성

- 기존 `useWebSocketV2()`는 내부적으로 `socketId = 'default'` 로 동작 (변경 없음)
- 신규 `useManagedWebSocket({ socketId: 'cloud-abc' })` 로 multi socket 사용
- 기존 호출부는 migration 전까지 그대로 유지

---

## 8. Backward Compatibility / Deprecated 전략

### 기존 유지 항목

| 항목                             | 유지 여부 | 이유                                                    |
| -------------------------------- | --------- | ------------------------------------------------------- |
| `useWebSocketV2` import 경로     | 유지      | 호출부 깨짐 방지                                        |
| `useWebSocketV2` parameter shape | 유지      | 기존 config 그대로                                      |
| `useWebSocketV2` return shape    | 유지      | `send`, `emit`, `emitAuthenticated`, store state 그대로 |
| `useWebSocketV2Store`            | 유지      | `lastMessage`, `cloudId` 등 기존 consumer 유지          |
| Worker `/websocket.worker.js`    | 유지      | 기존 reconnect/heartbeat 로직 유지                      |

### Deprecated 처리

```typescript
/**
 * @deprecated useWebSocketV2는 단일 socket 기반 구현이다.
 * 신규 WebSocket 기능은 useManagedWebSocket / WebSocketManager를 사용한다.
 *
 * Migration 가이드:
 * - 단일 socket: useManagedWebSocket({ socketId: 'default', ... })
 * - multi socket: useManagedWebSocket({ socketId: 'cloud-xxx', ... })
 * - 메시지 수신: onMessage callback 사용
 *
 * TODO: 모든 호출부 migration 완료 후 제거 예정
 */
export const useWebSocketV2 = (config?: UseWebSocketV2Config) => { ... };
```

### Migration 단계

| Phase | 작업                                                  | 위험도                       |
| ----- | ----------------------------------------------------- | ---------------------------- |
| 1     | 신규 `WebSocketManager` + `WebSocketClient` 추가      | 낮음 (기존 코드 미수정)      |
| 2     | 신규 `useManagedWebSocket` hook 추가                  | 낮음                         |
| 3     | 기존 `useWebSocketV2` deprecated 주석 추가            | 없음                         |
| 4     | `useGlobalSocketRouter`를 Manager.subscribe로 전환    | 중간                         |
| 5     | `WebSocketV2Connection`을 신규 hook으로 전환          | 중간                         |
| 6     | 기존 호출부 (useChats, useChannels 등) 점진 migration | 높음                         |
| 7     | 기존 `useWebSocketV2Store` 제거                       | 높음 (모든 consumer 전환 후) |
| 8     | 기존 `useWebSocketV2` 제거                            | 높음 (모든 호출부 전환 후)   |

### 제거 조건

- 모든 직접 호출부가 신규 API로 migration 완료
- `useWebSocketV2Store.lastMessage` subscriber가 0개
- QA에서 기존 기능 regression 없음 확인

---

## 9. 고려사항

### backward compatibility

- 기존 `useWebSocketV2` API shape 변경 없이 deprecated 처리
- 신규 manager/hook은 별도 경로에 추가

### race condition

- `emitAuthenticated()` subscription은 verified 시 해제되지만, 해제 전 disconnect 발생 시 listener 누적 가능
- 신규 구조에서는 Manager가 disconnect 시 pending subscription 일괄 정리

### burst message handling

- 현재: Worker → main thread event loop 순차 → 이론적 안전
- 신규: subscription callback 방식으로 모든 메시지 보장

### message ordering

- Worker 내부 WebSocket 메시지는 순서 보장 (TCP 기반)
- Worker → main thread postMessage도 순서 보장 (spec)
- 신규 구조: sequence number 추가로 명시적 순서 추적

### duplicated reconnect

- 현재 Worker 내부에서 단일 `reconnectTimeout`으로 중복 방지
- 신규: socket별 reconnect timer 독립 관리

### cleanup / memory leak

- 현재: Worker terminate로 자원 해제
- 위험: `emit()`/`emitAuthenticated()` subscription이 해제 안 될 수 있음
- 신규: Manager.disconnect()가 해당 socket의 모든 listener 정리 보장

### stale closure

- 현재: `connectRef`, `disconnectRef`로 최신 함수 참조 유지 (line 263-266)
- 신규: Manager는 React 외부에 존재하므로 closure 문제 없음

### store batching

- Zustand `set()`은 기본적으로 batching 없이 즉시 notify
- `subscribeWithSelector`의 equality check가 false → listener 호출
- 신규 구조: store 대신 direct callback으로 batching 문제 회피

### multi socket lifecycle

- socket별 독립 Worker → 독립 reconnect → 독립 cleanup
- 특정 socket disconnect가 다른 socket에 영향 없음 보장

### reconnect policy

- 현재: exponential backoff (1s ~ 30s), 2시간 force reconnect
- 신규: socket별 config에서 reconnect 정책 설정 가능

### heartbeat / ping-pong

- 현재: 60초 sync info heartbeat + 5초 timeout
- 신규: config.heartbeatInterval로 커스터마이징 가능

### error handling

- 현재: Worker error → `reportError()` 호출
- 신규: `onStatusChange` listener로 error state 전달, reporting은 hook 레이어에서 결정

### logging

- 현재: `logger` 모듈 사용 (`@chatic/app-messages`)
- 신규: 동일하게 `logger` 사용

### 테스트 용이성

- 현재: Worker + 전역 변수 → mock 어려움
- 신규: `WebSocketClient` interface → mock client 주입 가능

### deprecated 기간 old/new 공존 문제

- 기존 Worker와 신규 Worker가 동시에 같은 endpoint에 연결될 수 있음
- **해결**: migration 시 동일 endpoint는 하나의 socket만 유지하도록 관리

### 신규 hook 네이밍 충돌

- 기존: `useWebSocket`, `useWebSocketV2`, `useWebSocketWorker`, `useInitWebSocket`
- 신규: `useManagedWebSocket` — 기존과 충돌 없음

---

## 10. 시나리오 / 사용 케이스

### Scenario 1. 기존 useWebSocketV2 사용부가 깨지지 않는다

```
Given: 기존 useWebSocketV2를 사용하는 10+ 개 hook/component가 존재한다
When: 신규 WebSocketManager와 useManagedWebSocket이 추가된다
Then: 기존 useWebSocketV2의 import 경로, parameter, return shape이 변경되지 않는다
And: 기존 기능이 regression 없이 동작한다
```

### Scenario 2. 단일 socket 연결이 정상적으로 열린다

```
Given: useManagedWebSocket({ socketId: 'cloud-abc', url: 'wss://...', deviceId: '...' })를 호출한다
When: Manager가 해당 socketId로 Worker를 생성하고 connect한다
Then: status가 'idle' → 'connecting' → 'connected'로 전환된다
And: isConnected가 true가 된다
```

### Scenario 3. 메시지를 수신하고 consumer가 처리한다

```
Given: socketId 'cloud-abc'에 onMessage listener가 등록되어 있다
When: 서버에서 WebSocket 메시지가 도착한다
Then: onMessage callback이 WebSocketMessageEvent 객체와 함께 호출된다
And: event.socketId === 'cloud-abc'
And: event.sequence가 이전보다 큰 값이다
And: event.data에 원본 메시지가 포함된다
```

### Scenario 4. 짧은 시간에 여러 메시지가 들어와도 누락되지 않는다

```
Given: socketId 'cloud-abc'에 onMessage listener가 등록되어 있다
When: 서버에서 10ms 이내에 5개 메시지가 연속으로 도착한다
Then: onMessage callback이 정확히 5번 호출된다
And: 각 호출의 sequence가 순차적으로 증가한다
And: 모든 메시지 데이터가 누락 없이 전달된다
```

### Scenario 5. socket이 끊기면 reconnect 정책에 따라 재연결한다

```
Given: socketId 'cloud-abc'가 connected 상태이다
When: 네트워크 끊김으로 WebSocket이 close된다
Then: status가 'reconnecting'으로 전환된다
And: exponential backoff에 따라 재연결을 시도한다
And: 재연결 성공 시 status가 'connected'로 복귀한다
And: 재연결 성공 시 pending 메시지가 전송된다
```

### Scenario 6. unmount 또는 logout 시 socket이 정상 cleanup된다

```
Given: socketId 'cloud-abc'가 connected 상태이다
When: 사용자가 logout하여 Manager.disconnectAll()이 호출된다
Then: 모든 socket이 disconnect된다
And: 모든 listener가 해제된다
And: Worker가 terminate된다
And: store state가 초기화된다
And: memory leak이 없다
```

### Scenario 7. 여러 socket을 동시에 연결한다

```
Given: useManagedWebSocket({ socketId: 'relay', ... })와
       useManagedWebSocket({ socketId: 'cloud-abc', ... })가 동시에 mount된다
When: 두 socket 모두 연결이 성공한다
Then: 각 socket의 status가 독립적으로 'connected'가 된다
And: 'relay' socket의 메시지는 'relay' subscriber에게만 전달된다
And: 'cloud-abc' socket의 메시지는 'cloud-abc' subscriber에게만 전달된다
```

### Scenario 8. 특정 socket만 disconnect해도 다른 socket에는 영향이 없다

```
Given: 'relay'와 'cloud-abc' 두 socket이 connected 상태이다
When: Manager.disconnect('relay')를 호출한다
Then: 'relay' socket만 disconnected 상태가 된다
And: 'cloud-abc' socket은 여전히 connected 상태이다
And: 'cloud-abc' subscriber는 계속 메시지를 수신한다
```

### Scenario 9. send 시 socketId가 명확하게 지정된다

```
Given: 'relay'와 'cloud-abc' 두 socket이 connected 상태이다
When: Manager.send('cloud-abc', { type: 'chat', action: 'send', payload })를 호출한다
Then: 해당 메시지는 'cloud-abc' socket으로만 전송된다
And: 'relay' socket에는 전송되지 않는다
```

### Scenario 10. 기존 lastMessage consumer가 즉시 깨지지 않는다

```
Given: useGlobalSocketRouter가 useWebSocketV2Store.lastMessage를 구독 중이다
When: 신규 WebSocketManager가 추가된다
Then: 기존 useWebSocketV2의 lastMessage 업데이트 흐름이 변경되지 않는다
And: useGlobalSocketRouter가 기존처럼 모든 메시지를 수신한다
And: 기존 도메인 핸들러가 정상 작동한다
```

### Scenario 11. 신규 API로 multi socket을 사용할 수 있다

```
Given: WebSocketManager singleton이 초기화되어 있다
When: useManagedWebSocket({ socketId: 'cloud-new', url, deviceId, onMessage })를 사용한다
Then: 기존 useWebSocketV2 연결과 독립적으로 새 socket이 연결된다
And: onMessage로 해당 socket의 메시지만 수신된다
And: unmount 시 해당 socket만 disconnect된다
```

---

## 11. 자체검증 (Codex 구현 후 체크리스트)

- [ ] 기존 `useWebSocketV2` import 경로가 유지된다
- [ ] 기존 `useWebSocketV2` parameter shape이 변경되지 않았다
- [ ] 기존 `useWebSocketV2` return shape이 변경되지 않았다
- [ ] 기존 `useWebSocketV2Store` 구조가 변경되지 않았다
- [ ] 기존 `lastMessage` consumer (`useGlobalSocketRouter`, `useUpdateMyProfile`)가 정상 동작한다
- [ ] 기존 Worker `/websocket.worker.js`가 수정되지 않았다
- [ ] `useWebSocketV2`에 `@deprecated` 주석이 추가되었다
- [ ] 신규 `WebSocketManager` interface가 정의되었다
- [ ] 신규 `WebSocketClient` interface가 정의되었다
- [ ] 신규 `useManagedWebSocket` hook이 추가되었다
- [ ] 신규 hook에서 socketId 기반 multi socket이 동작한다
- [ ] 신규 hook에서 `subscribe` 방식으로 모든 메시지가 전달된다
- [ ] message burst 시 누락 없이 모든 callback이 호출된다
- [ ] message 순서가 보장된다 (sequence 증가)
- [ ] reconnect 중복이 방지된다
- [ ] disconnect 시 해당 socket의 모든 listener가 해제된다
- [ ] logout/unmount 시 모든 socket이 cleanup된다
- [ ] memory leak이 없다 (listener 해제 확인)
- [ ] TypeScript typecheck가 통과한다
- [ ] lint가 통과한다
- [ ] 기존 기능 regression 없음

---

## 12. 실제검증 (QA 시나리오)

### 브라우저 Mock 검증

#### QA-M1: 신규 hook 단일 socket 연결

1. `useManagedWebSocket({ socketId: 'test', url: 'ws://mock', deviceId: 'dev1' })`로 연결
2. mock WebSocket에서 open 이벤트 발생
3. `status === 'connected'` 확인

#### QA-M2: 빠른 메시지 연속 수신

1. mock WebSocket에서 10ms 이내에 10개 메시지 전송
2. onMessage callback이 정확히 10번 호출되는지 확인
3. 각 event.sequence가 순차 증가하는지 확인

#### QA-M3: multi socket mock 테스트

1. socketId 'A', 'B' 두 socket을 동시 연결
2. socket 'A'로 메시지 전송
3. 'A' subscriber만 메시지 수신, 'B' subscriber는 미수신 확인

#### QA-M4: 특정 socket disconnect

1. 'A', 'B' 연결 상태에서 'A' disconnect
2. 'A' status === 'disconnected' 확인
3. 'B' status === 'connected' 유지 확인

#### QA-M5: cleanup

1. hook unmount 시 disconnect 호출 확인
2. listener 배열이 비워지는지 확인
3. Worker terminate 호출 확인

#### QA-M6: 기존 useWebSocketV2 regression

1. 기존 WebSocketV2Connection 컴포넌트가 정상 mount
2. useGlobalSocketRouter가 메시지를 수신하여 핸들러에 전달
3. emitAuthenticated로 메시지 전송 성공

### 실제 네트워크 검증

#### QA-N1: 실제 WebSocket 서버 연결

1. 앱을 실행하여 cloud backend WSS에 연결
2. 연결 성공 후 auth 절차 완료
3. 채팅 메시지 송수신 정상 확인

#### QA-N2: reconnect 동작

1. 연결 중 네트워크를 끊음 (비행기 모드)
2. `status: 'reconnecting'` 전환 확인
3. 네트워크 복구 후 재연결 성공 확인
4. 재연결 후 메시지 정상 수신 확인

#### QA-N3: logout/unmount 시 연결 종료

1. 로그인 상태에서 logout
2. WebSocket 연결이 정상 종료되는지 확인
3. Worker가 terminate되는지 확인
4. 재로그인 시 새 연결이 정상 생성되는지 확인

#### QA-N4: 기존 화면 동작 확인

1. 채팅 목록 실시간 업데이트
2. 채팅방 메시지 수신
3. 사용자 상태 변경 반영
4. 초대 목록 업데이트

---

## 13. 구현 계획

### Phase 1. 타입 및 인터페이스 정의

- **파일**: `libs/socket/src/manager/types.ts`
- **내용**: `SocketId`, `WebSocketStatus`, `WebSocketConfig`, `WebSocketMessageEvent`, `WebSocketConnectionState`, `WebSocketClient`, `WebSocketManager`, listener 타입
- **위험도**: 없음 (신규 파일 추가만)

### Phase 2. WebSocketClient 구현

- **파일**: `libs/socket/src/manager/createWebSocketClient.ts`
- **내용**: Worker 기반 단일 socket client
- **의존**: Worker `/websocket.worker.js` (수정 없이 재사용)
- **위험도**: 낮음 (기존 코드 미수정)

### Phase 3. WebSocketManager 구현

- **파일**: `libs/socket/src/manager/createWebSocketManager.ts`
- **내용**: socketId별 Client 관리, connect/disconnect/send/subscribe
- **위험도**: 낮음 (기존 코드 미수정)

### Phase 4. useManagedWebSocket hook 구현

- **파일**: `libs/socket/src/hooks/useManagedWebSocket.ts`
- **내용**: React hook, Manager singleton 참조, lifecycle 관리
- **위험도**: 낮음 (기존 코드 미수정)

### Phase 5. barrel export 추가

- **파일**: `libs/socket/src/index.ts`
- **내용**: 신규 모듈 export 추가
- **위험도**: 없음

### Phase 6. useWebSocketV2 deprecated 주석 추가

- **파일**: `libs/socket/src/hooks/useWebSocketV2.ts`
- **내용**: `@deprecated` JSDoc 추가 (코드 변경 없음)
- **위험도**: 없음

### Phase 7. 기존 호출부 migration (별도 TASK)

- 호출부별 migration 우선순위:
    1. `useGlobalSocketRouter` (핵심 — Manager.subscribe 전환)
    2. `WebSocketV2Connection` (초기화 전환)
    3. data hooks (useChats, useChannels 등)

### Phase 8. 테스트 / QA

- mock WebSocket으로 단위 검증
- 실제 서버 연결 통합 테스트
- 기존 기능 regression 확인

---

## 14. TODO / 후속 작업

### TODO-1. 기존 useWebSocketV2 전체 제거

- **이유**: 모든 호출부 migration 완료 후에만 가능
- **이번에 제외하는 이유**: 10+ 개 호출부가 즉시 깨짐
- **선행 조건**: Phase 7 migration 완료
- **예상 수정 파일**: `libs/socket/src/hooks/useWebSocketV2.ts`, 모든 import 파일
- **위험도**: 높음

### TODO-2. 기존 useWebSocketV2Store 제거

- **이유**: 신규 Manager store로 완전 대체 후 가능
- **이번에 제외하는 이유**: `lastMessage`, `cloudId` 등 10+ 개 consumer 존재
- **선행 조건**: 모든 consumer가 신규 API로 전환
- **예상 수정 파일**: `libs/socket/src/stores/useWebSocketV2Store.ts`, 모든 consumer
- **위험도**: 높음

### TODO-3. lastMessage 구조 전체 제거

- **이유**: subscription 방식으로 대체 완료 후 제거
- **이번에 제외하는 이유**: `useGlobalSocketRouter`, `useUpdateMyProfile`이 의존
- **선행 조건**: 두 consumer가 Manager.subscribe로 전환
- **예상 수정 파일**: store, useWebSocketV2, router
- **위험도**: 중간

### TODO-4. Worker 구조 리팩토링

- **이유**: Worker 코드가 plain JS, 타입 없음, 테스트 불가
- **이번에 제외하는 이유**: 기존 reconnect/heartbeat 로직이 안정적으로 동작 중
- **선행 조건**: 신규 Manager가 안정화된 후
- **예상 수정 파일**: `apps/web/public/websocket.worker.js`
- **위험도**: 중간

### TODO-5. reconnect 정책 커스터마이징

- **이유**: socket별 다른 reconnect 정책이 필요할 수 있음
- **이번에 제외하는 이유**: 현재 단일 정책으로 충분
- **선행 조건**: multi socket 실 사용 후 요구사항 확인
- **예상 수정 파일**: Manager config, Worker
- **위험도**: 낮음

### TODO-6. 기존 호출부 전체 migration

- **이유**: deprecated API 제거를 위해 필요
- **이번에 제외하는 이유**: 범위가 너무 크고, 신규 API 안정화 우선
- **선행 조건**: Phase 1~6 완료 + QA 통과
- **예상 수정 파일**: 15+ 개 hook/component
- **위험도**: 높음 (호출부별 개별 검증 필요)

### TODO-7. e2e 테스트

- **이유**: WebSocket 연결 안정성 자동 검증
- **이번에 제외하는 이유**: 테스트 인프라 미존재
- **선행 조건**: Jest/Vitest + mock WebSocket 환경 구축
- **위험도**: 낮음

---

## 15. 불확실한 점

### 확인이 필요한 사항

| 항목                                                                                    | 현재 판단                                  | 확인 필요                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Zustand subscribeWithSelector가 동일 tick 내 연속 set()에서 모든 listener를 호출하는가? | 이론상 yes (매 set마다 동기 호출)          | 실제 burst 테스트로 확인 필요     |
| Worker → main thread postMessage 순서 보장                                              | Web Worker spec상 순서 보장                | Edge case 없는지 확인             |
| 기존 Worker를 신규 Manager에서 재사용 가능한가?                                         | 가능 (Worker는 endpoint + deviceId만 받음) | Worker 내부 상태 초기화 이슈 확인 |
| emitAuthenticated subscription이 disconnect 시 해제되는가?                              | 해제 안 됨 (코드상 unsubscribe 미호출)     | memory leak 범위 확인             |
| multi socket 시 같은 Worker 파일을 여러 번 생성 가능한가?                               | 가능 (매번 new Worker)                     | 브라우저 Worker 수 제한 확인      |

### 구현 전 사용자에게 물어봐야 할 질문

1. **multi socket의 실제 사용 케이스는?** relay + cloud 동시 연결인지, 같은 타입의 복수 연결인지?
2. **기존 useWebSocketV2를 deprecated만 할지, 내부를 Manager로 감쌀지?** (Option A vs B)
3. **신규 hook 네이밍 확정**: `useManagedWebSocket` vs 다른 후보?
4. **reconnect 정책을 Worker에 유지할지, Manager 레이어로 올릴지?**
5. **기존 lastMessage consumer migration 우선순위**: `useGlobalSocketRouter`부터 할지?
6. **신규 Manager store를 별도로 만들지, 기존 store를 확장할지?**
