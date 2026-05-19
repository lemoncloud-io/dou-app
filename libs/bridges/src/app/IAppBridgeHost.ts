import type {
    RequestType,
    EventType,
    RequestPayloadMap,
    ResponsePayloadMap,
    EventPayloadMap,
    BridgePairMap,
} from '../common';

/**
 * App(Native) 환경에서 Web(React 등)의 요청을 수신하고 처리하는 호스트(Host) 인터페이스입니다.
 */
export interface IAppBridgeHost {
    /**
     * [Web -> App] 브릿지 채널(WebView)을 통해 들어온 문자열 데이터를 파싱하고 알맞은 핸들러로 라우팅합니다.
     * @param data Web에서 직렬화하여 전송한 JSON 문자열
     */
    handleMessage(data: string): Promise<void>;

    /**
     * [Web -> App] 특정 RequestType에 대한 비즈니스 로직(핸들러)을 등록합니다.
     * Web에서 해당 타입의 요청이 오면 이 핸들러가 실행되며, 반환값은 자동으로 Web으로 응답(Response)됩니다.
     * @param type 처리할 웹 요청의 메시지 타입
     * @param handler 요청 페이로드를 받아 처리한 뒤, 매핑된 응답 데이터를 반환하는 비동기 함수
     */
    registerHandler<K extends RequestType>(
        type: K,
        handler: (payload: RequestPayloadMap[K]) => Promise<ResponsePayloadMap[BridgePairMap[K]]>
    ): void;

    /**
     * 등록된 특정 핸들러를 제거합니다.
     * @param type 제거할 메시지 타입
     */
    unregisterHandler(type: RequestType): void;

    /**
     * [App -> Web] Web의 요청 없이 App(Native)에서 자발적으로 발생하는 단방향 이벤트를 푸시합니다.
     * (예: 하드웨어 뒤로가기, 푸시 알림 수신 등)
     * @param type 푸시할 이벤트 타입
     * @param payload 이벤트 데이터 페이로드
     * @param version 메시지 프로토콜 버전 (기본값 제공됨)
     */
    pushEvent<K extends EventType>(type: K, payload: EventPayloadMap[K], version?: string): void;
}
