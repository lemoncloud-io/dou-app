import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageRequestParams,
    WebMessageSuccessResponse,
    WebMessageType,
} from '@chatic/app-messages';

/**
 * Web 환경에서 App(Native)과 통신하기 위한 브릿지 클라이언트 표준 인터페이스입니다.
 */
export interface IWebBridgeClient {
    /**
     * [Web -> App] 응답을 기다리지 않는 단방향 전송 (Fire-and-Forget)
     */
    post<K extends WebMessageType>(message: WebMessageData<K>): void;

    /**
     * @deprecated request/post message object 형태를 사용하세요.
     */
    post<K extends WebMessageType>(type: K, messageParams?: WebMessageRequestParams<K>): void;

    /**
     * [Web -> App] 앱에 요청을 보내고 결과를 비동기로 대기 (Request-Response)
     */
    request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageSuccessResponse<K>>;

    /**
     * @deprecated request(message, options) 형태를 사용하세요.
     */
    request<K extends WebMessageType>(
        type: K,
        messageParams?: WebMessageRequestParams<K>,
        customTimeoutMs?: number
    ): Promise<WebMessageSuccessResponse<K>>;

    /**
     * [App -> Web] 네이티브에서 발생하는 단방향 이벤트를 구독 (Event Subscription)
     */
    onEvent<K extends AppMessageType>(type: K, handler: (message: AppMessageData<K>) => void): () => void;
}
