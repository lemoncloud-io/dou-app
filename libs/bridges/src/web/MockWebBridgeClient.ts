import type { IWebBridgeClient } from './IWebBridgeClient';
import type { AppMessageData, AppMessageType, WebMessageData, WebMessageType } from '@chatic/app-messages';
import type { ResponseMessage } from '../common';

export class MockWebBridgeClient implements IWebBridgeClient {
    constructor(config?: any) {
        console.log('[MockWebBridgeClient] 초기화 완료 (비-네이티브 에러 반환 모드).');
    }

    public post<K extends WebMessageType>(type: K, _messageParams?: Omit<WebMessageData<K>, 'type'>): void {
        console.warn(
            `[MockWebBridgeClient] post [${String(type)}] 호출이 무시되었습니다. 일반 브라우저 환경에서는 브릿지를 사용할 수 없습니다.`
        );
    }

    public request<K extends WebMessageType>(
        type: K,
        _messageParams?: Omit<WebMessageData<K>, 'type'>
    ): Promise<ResponseMessage> {
        console.error(`[MockWebBridgeClient] request [${String(type)}] 호출 실패: NATIVE_NOT_SUPPORTED`);
        return Promise.reject({
            code: 'NATIVE_NOT_SUPPORTED',
            message: '일반 브라우저 환경에서는 네이티브 브릿지 기능을 사용할 수 없습니다.',
        });
    }

    public send<K extends WebMessageType>(message: WebMessageData<K>): Promise<ResponseMessage> {
        const { type, ...rest } = message;
        return this.request(type as K, rest as Omit<WebMessageData<K>, 'type'>);
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
