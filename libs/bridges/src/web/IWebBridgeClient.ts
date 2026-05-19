import type { WebMessageType } from '@chatic/app-messages';
import type { EventMessageType, ExtractEvtMessage, ExtractReqMessage, ExtractResMessage } from '../common';

/**
 * Web 환경에서 App(Native)과 통신하기 위한 브릿지 클라이언트 표준 인터페이스입니다.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 전송 (Fire-and-Forget)
     * @param type 전송할 메시지 타입
     * @param message 전송할 전체 메시지 객체 (데이터가 없는 경우 생략 가능)
     */
    post<K extends WebMessageType>(type: K, message?: Omit<ExtractReqMessage<K>, 'type'>): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 결과를 비동기로 대기 (Request-Response)
     * WebMessageType을 넣으면 자동으로 매핑된 전체 Response 메시지 구조를 Promise로 반환합니다.
     */
    request<K extends WebMessageType>(
        type: K,
        message?: Omit<ExtractReqMessage<K>, 'type'>,
        customTimeoutMs?: number
    ): Promise<ExtractResMessage<K>>;

    /**
     * `request`의 별칭(alias)으로, 메시지 객체 전체를 하나의 파라미터로 전달합니다.
     */
    send<K extends WebMessageType>(
        message: ExtractReqMessage<K>,
        customTimeoutMs?: number
    ): Promise<ExtractResMessage<K>>;

    /**
     * [App -> Web] 네이티브에서 발생하는 단방향 이벤트를 구독 (Event Subscription)
     */
    onEvent<K extends EventMessageType>(type: K, handler: (message: ExtractEvtMessage<K>) => void): () => void;
}
