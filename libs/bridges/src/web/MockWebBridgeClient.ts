import type { IWebBridgeClient } from './IWebBridgeClient';
import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageRequestParams,
    WebMessageSuccessResponse,
    WebMessageType,
} from '@chatic/app-messages';

export class MockWebBridgeClient implements IWebBridgeClient {
    constructor(config?: any) {
        console.log('[MockWebBridgeClient] 초기화 완료 (비-네이티브 에러 반환 모드).');
    }

    public post<K extends WebMessageType>(message: WebMessageData<K>): void;
    /**
     * @deprecated 현재 Web -> 과거 App 호환을 위해서만 유지합니다.
     * 새 호출부는 `post({ type, data })` message object 형태를 사용하세요.
     */
    public post<K extends WebMessageType>(type: K, _messageParams?: WebMessageRequestParams<K>): void;
    public post<K extends WebMessageType>(
        messageOrType: K | WebMessageData<K>,
        _messageParams?: WebMessageRequestParams<K>
    ): void {
        const type = typeof messageOrType === 'string' ? messageOrType : messageOrType.type;
        console.warn(
            `[MockWebBridgeClient] post [${String(type)}] 호출이 무시되었습니다. 일반 브라우저 환경에서는 브릿지를 사용할 수 없습니다.`
        );
    }

    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageSuccessResponse<K>>;
    /**
     * @deprecated 현재 Web -> 과거 App 호환을 위해서만 유지합니다.
     * 새 호출부는 `request({ type, data }, options)` message object 형태를 사용하세요.
     */
    public request<K extends WebMessageType>(
        type: K,
        _messageParams?: WebMessageRequestParams<K>,
        customTimeoutMs?: number
    ): Promise<WebMessageSuccessResponse<K>>;
    public request<K extends WebMessageType>(
        messageOrType: K | WebMessageData<K>,
        _messageParamsOrOptions?: WebMessageRequestParams<K> | { timeoutMs?: number },
        _customTimeoutMs?: number
    ): Promise<WebMessageSuccessResponse<K>> {
        const type = typeof messageOrType === 'string' ? messageOrType : messageOrType.type;
        console.error(`[MockWebBridgeClient] request [${String(type)}] 호출 실패: NATIVE_NOT_SUPPORTED`);
        return Promise.reject({
            code: 'NATIVE_NOT_SUPPORTED',
            message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
            reason: 'No native bridge adapter is available in the current browser environment.',
            requestType: String(type),
            protocolVersion: 'mock',
            webVersion: 'mock',
            recoverable: true,
        });
    }

    public send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageSuccessResponse<K>> {
        return this.request(message);
    }

    public onEvent<K extends AppMessageType>(type: K, _handler: (message: AppMessageData<K>) => void): () => void {
        console.warn(
            `[MockWebBridgeClient] onEvent [${String(type)}] 구독이 설정되었으나 비-네이티브 환경에서는 이벤트가 발생하지 않습니다.`
        );
        return () => {
            /* empty */
        };
    }
}
