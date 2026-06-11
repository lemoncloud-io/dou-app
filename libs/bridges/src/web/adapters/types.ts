import type { EventMessage, RequestMessage, ResponseMessage } from '../../common';

/**
 * 웹(Web)과 앱(App) 환경 간의 물리적 통신 채널을 추상화한 어댑터 인터페이스입니다.
 * 실제 네이티브 WebView 채널(NativeBridgeAdapter)이나 테스트용 인메모리 루프백 채널(InMemoryAdapter)로 다형성있게 구현됩니다.
 */
export interface BridgeAdapter {
    /**
     * [Web -> App] 웹에서 앱으로 메시지를 물리적으로 전송합니다.
     * @param message 전송할 Request 규격의 메시지 객체
     */
    postMessage(message: RequestMessage): void;

    /**
     * [App -> Web] 앱에서 웹으로 들어오는 메시지를 수신하기 위해 이벤트 리스너(핸들러)를 등록합니다.
     * @param handler App에서 전달된 Response 또는 Event 메시지를 처리할 콜백 함수
     * @returns 등록된 핸들러를 해제(Unsubscribe)할 수 있는 정리(Cleanup) 함수
     */
    onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void;
}

declare global {
    interface Window {
        /** iOS/macOS WebKit 기반 메시지 핸들러 인터페이스 명세 */
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: {
                    postMessage: (message: string) => void;
                };
            };
        };
        /** Android Chatic 커스텀 자바스크립트 인터페이스 명세 */
        ChaticMessageHandler?: {
            postMessage?: (message: string) => void;
        };
        /** React Native WebView 기본 제공 postMessage 인터페이스 명세 */
        ReactNativeWebView?: {
            postMessage(message: string): void;
        };
    }
}
