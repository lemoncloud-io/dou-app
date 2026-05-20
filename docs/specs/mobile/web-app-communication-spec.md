# 웹-앱 통신 인터페이스 명세 (V2)

## 1. 개요 (Overview)

본 문서는 React Native(App)와 WebView(Web) 간의 통신 규약 및 인터페이스 스펙 V2를 정의합니다.

- **통신 환경**: React Native에서 제공하는 WebView 컴포넌트(`react-native-webview`)의 `postMessage`와 `onMessage`를 기반으로 합니다.
- **역할 (Role)**:
    - **Web (Client)**: 사용자와 직접 상호작용하며, 네이티브의 기능이 필요할 때 App에 **요청(Request)**을 보냅니다.
    - **App (Host/Server)**: Web의 요청을 처리하고 **응답(Response)**을 반환하며, 기기 시스템에서 발생하는 이벤트를 Web으로 **푸시(Event)**합니다.

---

## 2. 핵심 설계 원칙

1. **100% 비동기 통신 (Asynchronous)**: 앱과 웹의 메인 스레드 블로킹(UI 멈춤) 및 성능 저하를 방지하기 위해 모든 브릿지 요청 및 처리는 비동기(Promise 기반)로 동작해야 합니다.
2. **보안 및 화이트리스트 검증 (Security)**: 신뢰할 수 없는 도메인에서의 악의적인 브릿지 명령 실행을 방지하기 위해, App(Host)은 반드시 URL 화이트리스트 검증을 통과한 요청만 처리해야 합니다.
3. **버전 관리 (Version Control)**: 하위 호환성 보장 및 유연한 업데이트를 위해 통신 메시지 규격에 버전(Version) 정보를 명시하고 관리합니다.
4. **메시지 추적 (`refId`)**: 모든 요청과 응답에는 메시지 추적을 위한 고유 식별자(`refId`)가 포함되어야 합니다.
5. **에러 핸들링 (Error Handling)**: 통신 실패 및 비즈니스 로직 예외는 일관된 에러 객체 형태로 응답에 포함되어야 합니다.
6. **프로토콜 추상화 (Protocol Abstraction)**: 통신 메시지의 직렬화/역직렬화(JSON, Protocol Buffer 등)는 인터페이스로 추상화되어 런타임에 교체될 수 있어야 합니다.
7. **단일 진실 공급원**: Web과 App이 사용하는 모든 통신 스펙(메시지 타입, 페이로드)은 본 명세에 통합하여 관리합니다.

---

## 3. 통신 인터페이스 및 메서드 규약

### 3.1. 핵심 메서드

| 메서드 명                  | 패턴                 | 설명                                               | 반환값                         |
| :------------------------- | :------------------- | :------------------------------------------------- | :----------------------------- |
| `post(message)`            | **Fire-and-Forget**  | 응답을 기다리지 않는 단방향 전송 (로그, 단순 알림) | `void`                         |
| `send(message)`            | **Request-Response** | 앱에 요청을 보내고 결과를 비동기로 대기            | `Promise<T>`                   |
| `onMessage(type, handler)` | **Event Listener**   | 앱에서 발생하는 이벤트를 구독                      | `void` (Unsubscribe 함수 반환) |

### 3.2. 에러 핸들링 (BridgeError)

통신 중 발생하는 모든 예외는 아래의 인터페이스를 준수하여 `send` 메서드의 `catch` 블록으로 전달됩니다.

```typescript
export interface BridgeError {
    /** 에러 식별 코드 (예: 'TIMEOUT', 'PERMISSION_DENIED', 'UNKNOWN') */
    code: string;
    /** 사용자/개발자 가독용 메시지 */
    message: string;
    /** 상세 에러 정보 (Stack Trace, 원본 에러 객체 등) */
    details?: unknown;
}
```

---

## 4. 메시지 데이터 정의 (TypeScript)

통신 메시지는 크게 **Request**, **Response**, **Event** 세 가지 타입으로 추상화됩니다.
모든 메시지는 추적을 위해 고유한 `refId`를 포함할 수 있습니다.

### 4.1. Base Message Envelope

```typescript
/**
 * 모든 통신 메시지의 공통 기반 인터페이스
 */
export interface BaseMessage {
    /** 메시지의 목적/명령어 타입 */
    type: string;
    /**
     * 메시지 추적 및 응답 매핑을 위한 고유 ID (UUID 등)
     * Event나 Fire-and-Forget 요청의 경우 생략될 수 있습니다.
     */
    refId?: string;
    /** API 통신 스펙 버전 관리 (예: '2.0.0') */
    version: string;
}
```

### 3.2. 메시지 패턴별 인터페이스

```typescript
/**
 * [Web -> App] 1. 요청 메시지 (Request & Fire-and-Forget)
 */
export interface RequestMessage<TPayload = unknown> extends BaseMessage {
    payload?: TPayload;
}

/**
 * [App -> Web] 2. 응답 메시지 (Response) - Discriminated Union 사용
 */
export type ResponseMessage<TData = unknown> = BaseMessage & {
    refId: string; // 응답 메시지는 반드시 요청의 refId를 포함해야 함
} & ({ success: true; data: TData } | { success: false; error: BridgeError });

/** 표준 에러 규약 */
export interface BridgeError {
    code: string; // 에러 코드 (예: 'TIMEOUT', 'UNAUTHORIZED')
    message: string; // 사람이 읽을 수 있는 에러 메시지
    details?: unknown; // 디버깅을 위한 추가 정보
}

/**
 * [App -> Web] 3. 이벤트 푸시 메시지 (Event)
 */
export interface EventMessage<TPayload = unknown> extends BaseMessage {
    payload: TPayload;
}
```

### 3.3. 프로토콜 어댑터 (Protocol Abstraction)

메시지의 직렬화 방식을 유연하게 변경할 수 있도록 프로토콜 어댑터 인터페이스를 정의합니다.

```typescript
/** 메시지 프로토콜 인터페이스 */
export interface MessageProtocol {
    /** 객체를 통신 가능한 포맷(문자열 또는 바이너리)으로 변환 */
    encode(message: RequestMessage | ResponseMessage | EventMessage): string | Uint8Array;
    /** 수신된 데이터를 객체로 변환 */
    decode(data: string | Uint8Array): RequestMessage | ResponseMessage | EventMessage;
}

/** JSON 프로토콜 구현 예시 */
export const JsonProtocol: MessageProtocol = {
    encode: message => JSON.stringify(message),
    decode: data => JSON.parse(data as string),
};
```

---

## 4. 상태 관리 및 예외 대응

### 4.1. 연결 생존 확인 (PING / PONG)

웹과 앱 양측에서 연결 상태(앱 크래시, 웹뷰 렌더링 멈춤 등)를 확인하기 위해 기본 Health Check 메시지를 사용합니다.

- **Web -> App (요청)**: `{ type: 'PING', refId: 'ping-123' }`
- **App -> Web (응답)**: `{ type: 'PONG', refId: 'ping-123', success: true }`

### 4.2. 연결 단절 및 타임아웃 대응 (Disconnection Handling)

앱이 백그라운드로 전환되거나 웹뷰 브릿지가 초기화 중일 때 데이터 유실을 방지합니다.

1. **Timeout**: `refId`를 기반으로 요청을 보낸 후 일정 시간(예: 10초) 내에 응답이 오지 않으면 Promise를 reject 하고 `TIMEOUT` 에러를 발생시킵니다.
2. **Queueing (재접속 대기)**: 웹뷰 초기화가 완료되기 전(또는 일시적 단절 상태)에 발생한 `RequestMessage`는 Web 내부의 Message Queue에 적재(버퍼링)됩니다. 연결이 복구되면 순차적으로 재전송합니다.
3. **Retry Strategy**: 멱등성(Idempotent)이 보장되는 GET 계열의 요청은 실패 시 1~2회 자동 재시도 로직을 브릿지 내부에서 처리합니다.

---

## 5. Mock 및 테스트 설계 (Mocking & Testing Strategy)

통신 주체(Web, App)가 서로 독립적으로 개발 및 검증할 수 있도록 양방향 Mocking 구조를 지원합니다.

### 5.1. Web-side Mock (앱 없이 웹 개발)

웹 프론트엔드에서 네이티브 앱의 응답을 시뮬레이션합니다.

```typescript
/** 브릿지 어댑터 인터페이스 */
export interface BridgeAdapter {
    postMessage(message: RequestMessage): void;
    onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void;
}

/** 로컬 웹 개발용 Mock 어댑터 */
export class MockBridgeAdapter implements BridgeAdapter {
    private handlers: ((message: ResponseMessage | EventMessage) => void)[] = [];

    postMessage(message: RequestMessage): void {
        console.log('[Mock] Request sent:', message);

        // PING 로직 자동 Mocking
        if (message.type === 'PING') {
            setTimeout(() => {
                this.dispatch({
                    type: 'PONG',
                    refId: message.refId!,
                    success: true,
                    data: { timestamp: Date.now() },
                });
            }, 50);
            return;
        }

        // 기타 비즈니스 로직 Mocking (mock-handlers.ts 등 외부에서 주입/관리)
    }

    onMessage(handler: (message: ResponseMessage | EventMessage) => void) {
        this.handlers.push(handler);
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);
        };
    }

    // 외부(개발자 콘솔 등)에서 강제로 이벤트를 발생시키기 위한 메서드
    dispatch(message: ResponseMessage | EventMessage): void {
        this.handlers.forEach(h => h(message));
    }
}
```

---

## 6. 통합 통신 스펙 카탈로그 (Centralized Spec)

Web과 App 양측이 공유하는 모든 메시지 타입을 단일 도메인 기준으로 정리합니다.

### 6.1. 사례

| 타입 (`type`) | 통신 패턴 | 페이로드(Payload) | 성공 응답 데이터 (Data) | 설명                |
| :------------ | :-------- | :---------------- | :---------------------- | :------------------ |
| `PING`        | Request   | -                 | `{ timestamp: number }` | 연결 상태 헬스 체크 |

---

## 7. 구현 가이드 (Implementation Guidelines)

프론트엔드 환경에서 해당 스펙을 구현할 때의 권장 구조입니다.

```typescript
// 사용 예시:
const bridge = new WebBridgeClient({
    adapter:
        process.env.NODE_ENV === 'development' && !window.ReactNativeWebView
            ? new MockBridgeAdapter()
            : new NativeBridgeAdapter(),
    protocol: JsonProtocol,
});

// 1. Request - Response 사용 (await 대기, refId 자동 생성 및 매핑)
try {
    const response = await bridge.request<FetchDeviceInfoPayload, DeviceInfo>({
        type: 'FetchDeviceInfo',
    });
    console.log(response.data);
} catch (error) {
    // Timeout 또는 App에서 전달한 BridgeError 캐치
    console.error('기기 정보 조회 실패:', error.code, error.message);
}

// 2. Fire-and-Forget (응답 대기 안함)
bridge.send({
    type: 'OpenURL',
    payload: { url: 'https://example.com' },
});

// 3. Event 구독
const unsubscribe = bridge.onEvent('OnBackPressed', payload => {
    console.log('뒤로가기 이벤트 수신!');
});
```
