# Socket Sync System

## 용어 및 역할

이 문서에서 사용하는 핵심 용어와 각 역할은 아래처럼 본다.

### 웹소켓

- `클라이언트`와 `서버`가 지속적으로 연결을 유지하면서 메시지를 교환하는 통신 채널
- v2 기준에서는 이 채널 위로 `SocketMessage`를 주고받는다

### ClientSocketV2 (네트워크 계층)

- 실제 WebSocket 연결을 관리하고, 원시 문자열 메시지 송수신을 담당하는 순수 네트워크 전송 계층.
- 연결 상태 관리(connect, disconnect, onStatus, onError)를 책임진다.
- 해당 스코프에서는 구현하지 않는다.

### SocketClient (메시지 계층)

- `ClientSocketV2` 위에 구축된 상위 계층 클라이언트.
- 원시 문자열 메시지를 `SocketMessage` 객체로 직렬화/역직렬화한다.
- `mid` 기반의 요청-응답 매칭을 관리한다. (`request` 메서드)
- `type` 기반의 메시지 라우팅을 담당한다. (`onType` 메서드)

### DomainGateway (도메인 계층)

- `SocketClient`를 사용하여 특정 도메인(예: `chat`, `device`)의 API를 캡슐화하는 게이트웨이.
- `SocketDataSource`와 유사한 역할을 수행한다.

### 서버

- WebSocket 이벤트를 수신하고 처리 결과를 응답한다.
- `domain.action` 기준으로 요청을 라우팅한다.
- 필요 시 서버 내부 use-case 실행 결과를 다시 소켓 응답으로 돌려준다.

### 연결

- `ClientSocketV2`가 서버와 맺는 1회성 WebSocket 세션.
- 연결마다 고유 식별 정보가 있다.

### SyncManager (동기화 실행 계층)

- 특정 도메인(예: `chat`, `device`)의 동기화 로직을 캡슐화하는 매니저.
- `Repository`의 읽기 또는 동기화 콜 메서드를 호출하여 실제 데이터 동기화를 수행한다.
- `DomainGateway`를 통해 서버로부터 최신 데이터를 가져오거나, 로컬 `Repository`에 저장된 데이터를 업데이트하는 역할을 한다.
- `SocketClient`에 직접 접근하지 않고, `DomainGateway`를 통해 서버와 통신한다.

### SyncScheduler (동기화 스케줄링 계층)

- 특정 도메인의 `SyncManager`를 사용하여 동기화 정책 및 스케줄링을 관리하는 추상화된 계층.
- "지금 어떤 모델을 다시 읽어야 하는가"와 같은 동기화 시점 및 대상을 결정한다.
- 도메인별로 존재하며, 이를 추상화하는 상위 인터페이스 또는 추상 클래스가 존재한다.

- `ClientSocketV2`가 서버와 맺는 1회성 WebSocket 세션.
- 연결마다 고유 식별 정보가 있다.

---

## (채널, 유저, 종단, 장치 등 나머지 용어는 기존과 동일)

## 개념 경계

역할 경계는 아래처럼 나누는 것을 기본 원칙으로 한다.

1.  `ClientSocketV2`는 **순수 네트워크 연결과 원시 메시지 전송**을 책임진다.
2.  `SocketClient`는 **`SocketMessage` 변환 및 요청/응답 관리**를 책임진다.
3.  `DomainGateway`는 **특정 도메인의 API 제공**을 책임진다. (예: `chat`, `channel`, `device`)
4.  `Repository`는 로컬 저장 서비스(LocalDataSource)와 이어지며, 동기화 및 네트워크 요청을 수신하여 중재한다.
5.  `SyncManager`는 **도메인별 동기화 로직 실행 및 `Repository`와의 상호작용**을 책임진다.
6.  `SyncScheduler`는 **도메인별 동기화 정책 및 스케줄링**을 책임진다.
7.  `React UI`는 화면 상태와 사용자 인터랙션을 책임진다.

## 목표

### ClientSocketV2의 목표

- WebSocket 연결 lifecycle(연결, 종료, 재연결) 관리
- 원시 문자열 메시지의 안정적인 송수신

### SocketClient의 목표

- `SocketMessage` 송수신 직렬화/역직렬화
- `mid` 기반 요청-응답 동기화
- `domain.action` 기준 이벤트 분배(`onType`)
- 상위 `DomainGateway`가 사용할 수 있는 확장 포인트 제공

---

### SyncManager의 목표

- 특정 도메인의 데이터 동기화 로직 실행
- `Repository`의 읽기/동기화 메서드 호출
- `DomainGateway`를 통한 서버 데이터 요청 및 로컬 데이터 업데이트
- 기본적인 공통 추상클래스 또는 인터페이스 존재

### SyncScheduler의 목표

- 특정 도메인의 `SyncManager`를 활용하여 동기화 정책 및 스케줄링 관리
- 동기화 주기, 조건, 우선순위 등 동기화 전략 결정
- 기본적인 공통 추상클래스 또는 인터페이스 존재

## (서버 작성 전제, 범위, device 초기 지원 포인트, system.ping 의미 등은 기존과 동일)

## 권장 레이어

```txt
+-------------------------+
|    SyncSchedulers       |  (e.g., ChatSyncScheduler, DeviceSyncScheduler)
| (동기화 정책 및 스케줄링) |
+-------------------------+
            | (uses)
+-------------------------+
|     SyncManagers        |  (e.g., ChatSyncManager, DeviceSyncManager)
| (도메인별 동기화 실행)   |
+-------------------------+
            | (uses)             | (uses)
            V                    V
 +-------------------------+  +-------------------------+
|    Repositories         |  |     DomainGateways      |  (e.g., ChatGateway, DeviceGateway)
+-------------------------+  | (도메인 API 추상화)     |
                             +-------------------------+
                                        | (uses)
                                        V
                                +-------------------------+
                                |      SocketClient       |  (SocketMessage, 요청/응답 관리)
                                +-------------------------+
                                        | (uses)
                                        V
                                +-------------------------+
                                |     ClientSocketV2      |  (실제 WebSocket 연결, 원시 메시지)
                                +-------------------------+
                                        | (uses)
                                        V
                                +-------------------------+
                                | (Reconnect, KeepAlive)  |  (연결 관리 로직)
                                +-------------------------+
```

## 클라이언트 동기화 방향

(기존 내용과 거의 동일하나, `client`가 `SocketClient`를 의미함을 명확히 함)

1.  `ClientSocketV2`는 "연결이 살아 있는가"를 책임진다.
2.  `SyncScheduler`는 "지금 어떤 모델을 다시 읽어야 하는가"를 책임진다.
3.  `SyncScheduler`는 `SyncManager`를 사용하여 동기화 작업을 지시한다.
4.  `SyncManager`는 `DomainGateway`를 통해 서버에 데이터를 요청하고, 결과를 `Repository`에 반영한다.
5.  `DomainGateway`는 `SocketClient`를 사용하여 실제 서버와 통신한다.

## 설계 원칙

1.  **네트워크(ClientSocketV2), 메시징(SocketClient), 도메인(DomainGateway) 로직을 분리한다.**
2.  `SocketClient`는 채널 동기화 정책을 직접 책임지지 않는다.
3.  연결 유지(`KeepAliveLoop`)와 모델 동기화(`SyncScheduler`) 루프를 분리한다.
4.  scheduler는 특정 도메인 구현에 고정하지 않고 `DomainSyncPlan`으로 확장 가능해야 한다.
5.  `SyncScheduler`는 `SocketClient`에 직접 접근하지 않고, `SyncManager`를 통해 동기화 작업을 지시한다.
6.  `SyncManager`는 `Repository`의 읽기/쓰기 메서드를 호출하여 실제 데이터 동기화를 수행하며, `DomainGateway`를 통해 서버와 통신한다.
7.  채팅/채널 저장소는 `Repository` 계층에서 다룬다.
8.  서버의 `registerUseCaseHandlers()` 구조와 맞춰 프론트도 `DomainGateway` 단위로 분리한다.

## 핵심 인터페이스 초안

### ClientSocketV2 (네트워크 계층)

이번 스코프에서는 구현하지 않는다.

```ts
export interface ClientSocketV2 {
    connect(): Promise<void>;
    disconnect(code?: number, reason?: string): Promise<void>;
    isConnected(): boolean;
    send(message: string): void;
    onMessage(listener: (message: string) => void): () => void;
    onStatus(listener: (status: ClientSocketStatus) => void): () => void;
    onError(listener: (error: ClientSocketError) => void): () => void;
}
```

### SocketClient (콜메시지 계층)

```ts
export interface SocketClient {
    send<T = unknown>(message: SocketMessage<T>): void;
    request<T = unknown, R = unknown>(type: string, data?: T, meta?: Record<string, unknown>): Promise<R>;
    onMessage<T = unknown>(listener: (message: SocketMessage<T>) => void): () => void;
    onType<T = unknown>(type: string, listener: (message: SocketMessage<T>) => void): () => void;
}
```

### DomainGateway (도메인 계층)

```ts
export interface DomainGateway {
    readonly client: SocketClient;
    readonly domain: string;
}

// 예시: DeviceGateway
export class DeviceGateway implements DomainGateway {
    readonly domain = 'device';
    constructor(public readonly client: SocketClient) {}

    readDevice(id: string): Promise<DeviceView> {
        return this.client.request(`${this.domain}.read`, { id });
    }
}
```

## 상위 계층 방향

상위 계층은 아래처럼 `DomainGateway`를 생성하여 사용하는 것을 권장한다.

```ts
// 1. SocketClient 인스턴스 생성 (내부적으로 ClientSocketV2 사용)
const socketClient = createSocketClient();

// 2. 각 도메인별 게이트웨이 생성
const chatGateway = new ChatGateway(socketClient);
const deviceGateway = new DeviceGateway(socketClient);

// 3. Repository 계층에서 게이트웨이 사용
await deviceGateway.readDevice('my-device-id');
```

이 구조를 쓰면 UI는 도메인 메서드를 호출하고, `SocketClient`는 메시징을, `ClientSocketV2`는 순수 네트워크 전송을 책임지게 되어 역할이 명확해진다.

---

## 제약 사항

- ClientSocketV2는 이번 스코프에서 구현하지 않는다.
- SyncScheduler는 외부 상태 감지에 영향을 받는 객체이기 때문에 타입 정의 및 인터페이스 개발까지를 스코프로 한다.
- 작업범위는 libs/data/src/data/\* 와 web/src/app/shared/data로 한정한다.
