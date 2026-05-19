import type {
    RequestType,
    ResponseType,
    EventType,
    TypedRequestMessage,
    TypedResponseMessage,
    TypedEventMessage,
} from '../../common';

/**
 * 웹(Web)과 앱(App) 환경 간의 물리적 통신 채널을 추상화한 어댑터 인터페이스입니다.
 * Native(실제 기기) 환경이나 Mock(테스트) 환경에 따라 다르게 구현하여 주입(DI)할 수 있습니다.
 */
export interface BridgeAdapter {
    /**
     * [Web -> App] 메시지를 전송합니다.
     * @param message 전송할 Request 규격의 메시지 객체
     */
    postMessage(message: TypedRequestMessage<RequestType>): void;

    /**
     * [App -> Web] 들어오는 메시지를 수신하기 위해 핸들러를 등록합니다.
     * @param handler App에서 전달된 Response 또는 Event 메시지를 처리할 콜백 함수
     * @returns 등록된 핸들러를 해제(Unsubscribe)할 수 있는 정리(Cleanup) 함수
     */
    onMessage(
        handler: (message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>) => void
    ): () => void;
}
