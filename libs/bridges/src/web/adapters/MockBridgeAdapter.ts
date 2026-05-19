import type { BridgeAdapter } from './BridgeAdapter';
import type { RequestMessage, ResponseMessage, EventMessage } from '../../common';

/**
 * 단위 테스트 및 Mock 환경에서 사용되는 BridgeAdapter입니다.
 * 실제 브릿지(window.ReactNativeWebView 등) 대신 콜백 함수를 통해 App과 통신합니다.
 */
export class MockBridgeAdapter implements BridgeAdapter {
    private onMessageHandlers: ((message: ResponseMessage | EventMessage) => void)[] = [];
    private sendToAppCallback?: (message: RequestMessage) => void;

    /**
     * @param sendToAppCallback Web에서 App으로 메시지를 전송할 때 호출될 콜백 (브릿지 채널 역할)
     */
    constructor(sendToAppCallback?: (message: RequestMessage) => void) {
        this.sendToAppCallback = sendToAppCallback;
        console.log(
            '[MockBridgeAdapter] 초기화 및 수신 대기 상태. App 채널 연결 상태:',
            sendToAppCallback ? '연결됨' : '연결 안됨'
        );
    }

    /**
     * WebClient가 App으로 메시지를 보낼 때 호출됩니다.
     * 등록된 sendToAppCallback을 비동기적으로 실행합니다.
     */
    public postMessage(message: RequestMessage): void {
        console.log(`[MockBridgeAdapter] App으로 메시지 전송 요청: type='${message.type}'`);
        if (this.sendToAppCallback) {
            // 실제 환경과 동일하게 비동기(Asynchronous)로 메시지를 전송합니다.
            setTimeout(() => {
                this.sendToAppCallback!(message);
            }, 10);
        } else {
            console.warn('[MockBridgeAdapter] 연결된 App 채널 콜백이 없어 메시지를 보낼 수 없습니다.');
        }
    }

    /**
     * WebClient가 App으로부터 오는 메시지를 수신하기 위해 핸들러를 등록합니다.
     */
    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.onMessageHandlers.push(handler);
        return () => {
            this.onMessageHandlers = this.onMessageHandlers.filter(h => h !== handler);
        };
    }

    /**
     * App으로부터 전달된 메시지를 Web 환경(WebClient)으로 밀어넣는(Push) 수신부입니다.
     * 실제 환경의 `window.addEventListener('message', ...)` 역할을 시뮬레이션합니다.
     */
    public receiveMessageFromApp(message: ResponseMessage | EventMessage): void {
        console.log(`[MockBridgeAdapter] App으로부터 메시지 수신 완료. WebClient로 전달합니다.`, message);
        this.onMessageHandlers.forEach(handler => handler(message));
    }
}
