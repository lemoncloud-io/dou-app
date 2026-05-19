import type {
    RequestType,
    EventType,
    RequestPayloadMap,
    ResponsePayloadMap,
    EventPayloadMap,
    BridgePairMap,
} from '../common';

/**
 * Web 환경에서 App(Native)과 통신하기 위한 브릿지 클라이언트 표준 인터페이스입니다.
 * 제네릭 맵핑을 제거하고 중앙 집중화된 타입 시스템(types.ts)을 사용하도록 단순화되었습니다.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 전송 (Fire-and-Forget)
     * @param type 전송할 메시지 타입
     * @param payload 전송할 데이터 (빈 페이로드인 경우 생략 가능)
     */
    post<K extends RequestType>(type: K, payload?: RequestPayloadMap[K]): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 결과를 비동기로 대기 (Request-Response)
     * RequestType을 넣으면 자동으로 매핑된 Response 데이터 구조를 Promise로 반환합니다.
     * @param type 요청할 메시지 타입
     * @param payload 전송할 데이터
     * @param customTimeoutMs 타임아웃 시간 (선택)
     */
    request<K extends RequestType>(
        type: K,
        payload?: RequestPayloadMap[K],
        customTimeoutMs?: number
    ): Promise<ResponsePayloadMap[BridgePairMap[K]]>;

    /**
     * `request`의 별칭(alias)으로, 메시지 객체 형태로 전달합니다.
     */
    send<K extends RequestType>(
        message: { type: K; payload?: RequestPayloadMap[K] },
        customTimeoutMs?: number
    ): Promise<ResponsePayloadMap[BridgePairMap[K]]>;

    /**
     * [App -> Web] 네이티브에서 발생하는 단방향 이벤트를 구독 (Event Subscription)
     * @param type 구독할 이벤트 타입
     * @param handler 이벤트 발생 시 실행될 콜백 함수
     * @returns 구독을 해제하는(Cleanup) 클로저 함수
     */
    onEvent<K extends EventType>(type: K, handler: (payload: EventPayloadMap[K]) => void): () => void;
}
