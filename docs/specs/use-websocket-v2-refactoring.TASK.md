# useWebSocketV2 Refactoring TASK

## 참조 SPEC

- `use-websocket-v2-refactoring.SPEC.md`

---

## 목표

기존 `useWebSocketV2`를 수정하지 않고, 새로운 WebSocket abstraction(`WebSocketManager`, `WebSocketClient`, `useManagedWebSocket`)을 별도 모듈로 추가한다.

---

## 구현 범위

1. 신규 타입 정의 (`libs/socket/src/manager/types.ts`)
2. `createWebSocketClient` factory 구현
3. `createWebSocketManager` factory 구현
4. `useManagedWebSocket` React hook 구현
5. barrel export 추가
6. 기존 `useWebSocketV2`에 `@deprecated` 주석 추가 (코드 수정 아님)

---

## 절대 수정하지 말 것

- `libs/socket/src/hooks/useWebSocketV2.ts` (deprecated 주석 추가 제외)
- `libs/socket/src/stores/useWebSocketV2Store.ts`
- `apps/web/public/websocket.worker.js`
- `libs/data/src/sync-events/useGlobalSocketRouter.ts`
- `apps/web/src/app/features/home/hooks/useUpdateMyProfile.ts`
- `apps/web/src/app/components/WebSocketV2Connection.tsx`
- 기존 `useWebSocketV2` 호출부 전체
- 기존 lastMessage 구조
- 기존 store 구조
- 기존 Worker 구조

---

## 핵심 구현 조건

### 아키텍처

```
useManagedWebSocket (React hook)
  → WebSocketManager (singleton, pure TS)
    → WebSocketClient (socketId별 인스턴스)
      → Worker (기존 websocket.worker.js 재사용)
```

### Manager 요구사항

- socketId 기반 multi socket 관리
- `connect(config)` / `disconnect(socketId)` / `disconnectAll()`
- `send(socketId, message)` — 해당 socket으로만 전송
- `subscribe(socketId, listener)` — 해당 socket 메시지만 수신, unsubscribe 반환
- `onStatusChange(socketId, listener)` — 상태 변경 구독
- `getState(socketId)` / `getAllStates()`

### Client 요구사항

- 단일 WebSocket 연결 캡슐화
- Worker 생성 및 onmessage 핸들링
- listener 관리 (subscribe/unsubscribe)
- sequence 번호 부여 (매 메시지마다 +1)
- disconnect 시 모든 listener 정리

### Hook 요구사항

```typescript
interface UseManagedWebSocketConfig {
    socketId: SocketId;
    url: string;
    deviceId: string;
    enabled?: boolean; // default: true
    token?: string;
    authQueryParam?: string;
    reconnect?: boolean; // default: true
    onMessage?: WebSocketMessageListener;
}

interface UseManagedWebSocketReturn {
    status: WebSocketStatus;
    isConnected: boolean;
    send: (message: unknown) => void;
    disconnect: () => void;
}
```

- mount 시 Manager.connect() 호출 (enabled=true)
- unmount 시 Manager.disconnect(socketId) 호출
- onMessage callback으로 해당 socket 메시지만 수신
- Manager singleton을 내부에서 참조 (module-level)

### 메시지 전달 방식

- store 기반 lastMessage 패턴이 아닌, **callback subscription** 방식
- Manager.subscribe(socketId, listener)로 등록된 모든 listener에 메시지 전달
- 메시지 유실 없음 보장 (동기 호출)

### Sequence 부여

```typescript
interface WebSocketMessageEvent<T = unknown> {
    socketId: SocketId;
    sequence: number; // Client 내부 counter, 0부터 시작
    receivedAt: number; // Date.now()
    data: T;
}
```

---

## 단계별 작업

### Step 1. 디렉토리 및 타입 정의

```
libs/socket/src/manager/
├── types.ts
├── createWebSocketClient.ts
├── createWebSocketManager.ts
└── index.ts
```

- `types.ts`: SocketId, WebSocketStatus, WebSocketConfig, WebSocketMessageEvent, WebSocketConnectionState, WebSocketClient interface, WebSocketManager interface, listener 타입

### Step 2. createWebSocketClient 구현

- Worker 생성: `new Worker('/websocket.worker.js')`
- Worker onmessage 핸들링:
    - `type: 'status'` → 내부 상태 업데이트, statusListeners 호출
    - `type: 'message'` → sequence 부여, messageListeners 호출
    - `type: 'error'` → error state 업데이트
    - `type: 'connectionId'` → state 업데이트
- `connect()`: Worker에 connect config 전달
- `disconnect()`: Worker에 disconnect 전달, Worker terminate, listeners 정리
- `send()`: Worker에 send 전달
- `subscribe(listener)`: messageListeners 배열에 추가, unsubscribe 반환
- `onStatusChange(listener)`: statusListeners 배열에 추가, unsubscribe 반환
- `getStatus()` / `getState()`: 현재 상태 반환

### Step 3. createWebSocketManager 구현

- 내부: `Map<SocketId, WebSocketClient>`
- `connect(config)`:
    - 이미 같은 socketId가 있으면 먼저 disconnect
    - createWebSocketClient(config)로 새 client 생성
    - client.connect() 호출
- `disconnect(socketId)`: client.disconnect() + Map에서 제거
- `disconnectAll()`: 모든 client disconnect + Map clear
- `send(socketId, message)`: client.send(message)
- `subscribe(socketId, listener)`: client.subscribe(listener)
- `onStatusChange(socketId, listener)`: client.onStatusChange(listener)
- `getState(socketId)`: client.getState()
- `getAllStates()`: 모든 client state를 Record로 반환

### Step 4. Manager singleton export

```typescript
// libs/socket/src/manager/index.ts
export const webSocketManager = createWebSocketManager();
export { createWebSocketClient, createWebSocketManager } from './createWebSocketManager';
export * from './types';
```

### Step 5. useManagedWebSocket hook 구현

```typescript
// libs/socket/src/hooks/useManagedWebSocket.ts

export function useManagedWebSocket(config: UseManagedWebSocketConfig): UseManagedWebSocketReturn {
    const [status, setStatus] = useState<WebSocketStatus>('idle');
    const configRef = useRef(config);
    configRef.current = config;

    useEffect(() => {
        if (!config.enabled) return;

        webSocketManager.connect({
            socketId: config.socketId,
            url: config.url,
            deviceId: config.deviceId,
            token: config.token,
            authQueryParam: config.authQueryParam,
            reconnect: config.reconnect,
        });

        const unsubStatus = webSocketManager.onStatusChange(config.socketId, state => {
            setStatus(state.status);
        });

        const unsubMessage = config.onMessage
            ? webSocketManager.subscribe(config.socketId, config.onMessage)
            : undefined;

        return () => {
            unsubStatus();
            unsubMessage?.();
            webSocketManager.disconnect(config.socketId);
        };
    }, [config.socketId, config.url, config.deviceId, config.enabled]);

    const send = useCallback(
        (message: unknown) => {
            webSocketManager.send(config.socketId, message);
        },
        [config.socketId]
    );

    const disconnect = useCallback(() => {
        webSocketManager.disconnect(config.socketId);
    }, [config.socketId]);

    return {
        status,
        isConnected: status === 'connected',
        send,
        disconnect,
    };
}
```

### Step 6. barrel export

- `libs/socket/src/index.ts`에 추가:
    ```typescript
    export * from './manager';
    export { useManagedWebSocket } from './hooks/useManagedWebSocket';
    ```

### Step 7. useWebSocketV2 deprecated 주석

```typescript
/**
 * @deprecated useWebSocketV2는 단일 socket 기반 구현이다.
 * 신규 WebSocket 기능은 useManagedWebSocket / WebSocketManager를 사용한다.
 *
 * Migration 가이드:
 * - 단일 socket: useManagedWebSocket({ socketId: 'default', ... })
 * - multi socket: useManagedWebSocket({ socketId: '<id>', ... })
 * - 메시지 수신: onMessage callback 사용
 *
 * TODO: 모든 호출부 migration 완료 후 제거 예정
 */
export const useWebSocketV2 = (config?: UseWebSocketV2Config) => {
```

---

## 자체검증 체크리스트

- [ ] 기존 `useWebSocketV2` import/parameter/return 변경 없음
- [ ] 기존 `useWebSocketV2Store` 구조 변경 없음
- [ ] 기존 Worker 수정 없음
- [ ] 기존 `useGlobalSocketRouter` 수정 없음
- [ ] 기존 호출부 수정 없음
- [ ] `@deprecated` 주석 추가됨
- [ ] `WebSocketManager` interface 구현 완료
- [ ] `WebSocketClient` interface 구현 완료
- [ ] `useManagedWebSocket` hook 구현 완료
- [ ] socketId 기반 multi socket 동작
- [ ] subscribe로 모든 메시지 callback 전달
- [ ] sequence 번호 순차 증가
- [ ] disconnect 시 listener 정리
- [ ] disconnectAll 시 전체 정리
- [ ] Worker terminate 호출
- [ ] 중복 socketId connect 시 기존 disconnect 후 재연결
- [ ] TypeScript typecheck 통과
- [ ] lint 통과

---

## 실제검증 체크리스트

### Mock 검증

- [ ] 단일 socket connect → status 'connected'
- [ ] message 수신 → onMessage callback 호출
- [ ] 10개 연속 메시지 → 10번 callback (누락 없음)
- [ ] multi socket 독립 동작
- [ ] 특정 socket disconnect → 다른 socket 영향 없음
- [ ] unmount → disconnect + cleanup

### 실제 네트워크 검증

- [ ] 실제 WSS 서버 연결 성공
- [ ] 메시지 송수신 정상
- [ ] reconnect 동작
- [ ] logout 시 전체 cleanup
- [ ] 기존 useWebSocketV2 사용 화면 regression 없음

---

## TODO로 분리할 작업

| TODO   | 내용                                                     | 선행 조건              |
| ------ | -------------------------------------------------------- | ---------------------- |
| TODO-1 | `useGlobalSocketRouter`를 Manager.subscribe로 전환       | Phase 1~6 완료         |
| TODO-2 | `WebSocketV2Connection`을 `useManagedWebSocket`으로 전환 | Phase 1~6 완료         |
| TODO-3 | data hooks (useChats, useChannels 등) migration          | TODO-1, 2 완료         |
| TODO-4 | `useWebSocketV2Store` 제거                               | 모든 consumer 전환     |
| TODO-5 | `useWebSocketV2` 제거                                    | 모든 호출부 전환       |
| TODO-6 | Worker TypeScript 재작성                                 | 신규 Manager 안정화 후 |
| TODO-7 | e2e 테스트 추가                                          | 테스트 인프라 구축 후  |
