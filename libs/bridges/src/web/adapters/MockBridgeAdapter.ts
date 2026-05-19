import type { BridgeAdapter } from './BridgeAdapter';
import type {
    EventType,
    RequestType,
    ResponseType,
    TypedEventMessage,
    TypedRequestMessage,
    TypedResponseMessage,
} from '../../common';

/**
 * 단위 테스트(Unit Test) 및 로컬 웹 브라우저(Mock) 환경에서 사용되는 어댑터입니다.
 * 실제 디바이스의 WebView 브릿지 채널 대신, 콜백 함수를 통해 Web과 App의 통신을 시뮬레이션합니다.
 */
export class MockBridgeAdapter implements BridgeAdapter {
    /** App -> Web 으로 전달되는 메시지를 처리하기 위해 등록된 리스너 배열 */
    private onMessageHandlers: ((
        message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>
    ) => void)[] = [];

    /** Web -> App 으로 메시지를 전달할 때 호출될 모의(Mock) 백엔드/네이티브 채널 */
    private sendToAppCallback?: (message: TypedRequestMessage<RequestType>) => void;

    /**
     * @param sendToAppCallback 웹(WebClient)에서 보낸 메시지를 모의 네이티브 환경으로 전달해 줄 통로 역할의 콜백 함수
     */
    constructor(sendToAppCallback?: (message: TypedRequestMessage<RequestType>) => void) {
        this.sendToAppCallback = sendToAppCallback;
        console.log(
            '[MockBridgeAdapter] 초기화 상태. App 채널 연결 여부:',
            sendToAppCallback ? '✅ 연결됨' : '❌ 연결 안됨'
        );
    }

    /**
     * [Web -> App] 클라이언트가 네이티브 측으로 메시지를 전송할 때 호출됩니다.
     */
    public postMessage(message: TypedRequestMessage<RequestType>): void {
        console.log(`[MockBridgeAdapter] Web -> App 메시지 전송: [${message.type}]`);

        if (this.sendToAppCallback) {
            // 실제 WebView 환경과 동일하게 동작하도록 비동기(Asynchronous) 이벤트 루프를 태워 전송합니다.
            setTimeout(() => {
                this.sendToAppCallback!(message);
            }, 10);
        } else {
            console.warn(
                `[MockBridgeAdapter] 메시지(${message.type})가 전송되었으나, 연결된 App(Mock) 채널 콜백이 존재하지 않습니다.`
            );
        }
    }

    /**
     * [App -> Web] 클라이언트가 네이티브의 응답/이벤트를 수신하기 위해 핸들러를 등록합니다.
     */
    public onMessage(
        handler: (message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>) => void
    ): () => void {
        this.onMessageHandlers.push(handler);

        // 구독 해제 함수 반환
        return () => {
            this.onMessageHandlers = this.onMessageHandlers.filter(h => h !== handler);
        };
    }

    /**
     * [Test Utils] 모의 네이티브 환경(Mock App)에서 WebClient 측으로 강제로 메시지를 밀어넣는(Push) 주입용 메서드입니다.
     * 실제 브라우저의 `window.postMessage` 수신 동작을 흉내 냅니다.
     * * @param message 웹으로 밀어넣을 응답(Response) 또는 단방향 이벤트(Event) 객체
     */
    public receiveMessageFromApp(message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>): void {
        console.log(`[MockBridgeAdapter] App -> Web 메시지 수신: [${message.type}]`, message);

        this.onMessageHandlers.forEach(handler => handler(message));
    }
}
