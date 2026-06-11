import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';
import type { BridgeAdapter } from './types';
import type { IAppBridgeHost } from '../../app';
import { JsonProtocol } from '../../common';

/**
 * 웹뷰나 실제 네이티브 환경 없이 메모리상에서 WebBridgeClient와 AppBridgeHost 간의
 * 루프백(Loopback) 통신을 가능하게 해주는 테스트/시뮬레이션용 어댑터 구현체입니다.
 */
export class InMemoryAdapter implements BridgeAdapter {
    /** 수신된 메시지를 처리할 리스너 콜백 */
    private handler?: (message: ResponseMessage | EventMessage) => void;
    /** 루프백 메시지를 전달받아 처리할 가상의 네이티브 앱 호스트 인스턴스 */
    private appHost?: IAppBridgeHost;

    /**
     * 루프백 대상이 될 AppBridgeHost 인스턴스를 주입(설정)합니다.
     */
    public setAppHost(appHost: IAppBridgeHost): void {
        this.appHost = appHost;
    }

    /**
     * [Web -> App] 웹에서 보낸 요청 메시지를 JSON 직렬화한 후,
     * 비동기 동작 및 콜백 순서 모사를 위해 setTimeout 스케줄러를 통해 AppBridgeHost에 주입합니다.
     */
    public postMessage(message: RequestMessage): void {
        if (!this.appHost) {
            console.warn('[InMemoryAdapter] AppBridgeHost가 연결되어 있지 않습니다.');
            return;
        }

        const encoded = JsonProtocol.encode(message);
        // 비동기 동작 모사 및 실행 순서 보장을 위해 setTimeout을 통해 전달합니다.
        setTimeout(() => {
            if (this.appHost) {
                void this.appHost.handleMessage(encoded as string);
            }
        }, 0);
    }

    /**
     * [App -> Web] 네이티브 앱(AppBridgeHost) 등으로부터 전달되는 응답 또는 이벤트 메시지를
     * 수신할 콜백(handler)을 등록합니다.
     */
    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handler = handler;
        return () => {
            this.handler = undefined;
        };
    }

    /**
     * [App -> Web External Trigger] AppBridgeHost의 sendToWeb 등에서 호출하여
     * 웹 클라이언트(WebBridgeClient) 방향으로 메시지를 강제 공급하기 위한 트리거 메서드입니다.
     */
    public receiveFromApp(message: ResponseMessage | EventMessage): void {
        if (this.handler) {
            this.handler(message);
        }
    }
}
