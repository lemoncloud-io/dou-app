import type { IWebBridgeClient } from './IWebBridgeClient';
import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageResponse,
    WebMessageType,
} from '@chatic/app-messages';

export interface NonNativeFailBridgeClientConfig {
    version?: string;
}

export class NonNativeFailBridgeClient implements IWebBridgeClient {
    private readonly version: string;

    constructor(config: NonNativeFailBridgeClientConfig = {}) {
        this.version = config.version ?? 'non-native';
    }

    public post<K extends WebMessageType>(message: WebMessageData<K>): void {
        const type = message.type;
        console.warn(
            `[NonNativeFailBridgeClient] post [${String(type)}] 호출이 무시되었습니다. 일반 브라우저 환경에서는 브릿지를 사용할 수 없습니다.`
        );
    }

    public request<K extends WebMessageType>(
        message: WebMessageData<K>,
        options?: { timeoutMs?: number }
    ): Promise<WebMessageResponse<K>> {
        const type = message.type;
        console.error(`[NonNativeFailBridgeClient] request [${String(type)}] 호출 실패: NATIVE_NOT_SUPPORTED`);
        return Promise.reject({
            code: 'NATIVE_NOT_SUPPORTED',
            message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
            reason: 'No native bridge adapter is available in the current browser environment.',
            requestType: String(type),
            protocolVersion: this.version,
            webVersion: this.version,
            recoverable: true,
        });
    }

    public send<K extends WebMessageType>(message: WebMessageData<K>): Promise<WebMessageResponse<K>> {
        return this.request(message);
    }

    public onEvent<K extends AppMessageType>(type: K, _handler: (message: AppMessageData<K>) => void): () => void {
        console.warn(
            `[NonNativeFailBridgeClient] onEvent [${String(type)}] 구독이 설정되었으나 비-네이티브 환경에서는 이벤트가 발생하지 않습니다.`
        );
        return () => {
            /* empty */
        };
    }
}
