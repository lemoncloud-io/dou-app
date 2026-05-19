import type { WebMessageType } from '@chatic/app-messages';
import type { EventMessageType, ExtractEvtData, ExtractReqData, ExtractResData } from '../common';

/**
 * Web 환경에서 App(Native)과 통신하기 위한 브릿지 클라이언트 표준 인터페이스입니다.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 전송 (Fire-and-Forget)
     * @param type 전송할 메시지 타입
     * @param payload 전송할 데이터 (빈 페이로드인 경우 생략 가능)
     */
    post<K extends WebMessageType>(type: K, payload?: ExtractReqData<K>): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 결과를 비동기로 대기 (Request-Response)
     * WebMessageType을 넣으면 자동으로 매핑된 Response 데이터 구조를 Promise로 반환합니다.
     */
    request<K extends WebMessageType>(
        type: K,
        payload?: ExtractReqData<K>,
        customTimeoutMs?: number
    ): Promise<ExtractResData<K>>;

    /**
     * `request`의 별칭(alias)으로, 메시지 객체 형태로 전달합니다.
     */
    send<K extends WebMessageType>(
        message: { type: K; payload?: ExtractReqData<K> },
        customTimeoutMs?: number
    ): Promise<ExtractResData<K>>;

    /**
     * [App -> Web] 네이티브에서 발생하는 단방향 이벤트를 구독 (Event Subscription)
     */
    onEvent<K extends EventMessageType>(type: K, handler: (payload: ExtractEvtData<K>) => void): () => void;
}
