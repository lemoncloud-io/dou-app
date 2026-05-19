import type { BridgeAdapter } from './BridgeAdapter';
import type {
    EventType,
    RequestType,
    ResponseType,
    TypedEventMessage,
    TypedRequestMessage,
    TypedResponseMessage,
    MessageProtocol,
} from '../../common';
import { JsonProtocol } from '../../common';

declare global {
    interface Window {
        webkit?: {
            messageHandlers?: {
                ChaticMessageHandler?: { postMessage: (message: string) => void };
            };
        };
        ChaticMessageHandler?: {
            postMessage?: (message: string) => void;
        };
        ReactNativeWebView?: {
            postMessage(message: string): void;
        };
    }
}

/**
 * 실제 모바일 디바이스(iOS/Android) 환경에서 사용되는 브릿지 어댑터입니다.
 * WebView 주입 객체(`window.ReactNativeWebView` 등)를 통해 통신합니다.
 */
export class NativeBridgeAdapter implements BridgeAdapter {
    /** 등록된 메시지 수신 리스너들의 배열 */
    private handlers: ((message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>) => void)[] = [];

    /** 데이터 직렬화/역직렬화를 담당하는 프로토콜 (기본값: JSON) */
    private protocol: MessageProtocol;

    /** 네이티브 이벤트 리스너가 현재 window에 등록되어 있는지 여부 */
    private isListening = false;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
    }

    /**
     * DOM 이벤트 리스너를 등록합니다. (구독자가 1명 이상일 때 호출됨)
     */
    private setupListener() {
        if (!this.isListening && typeof window !== 'undefined') {
            window.addEventListener('message', this.handleNativeMessage);
            // 구형 안드로이드 기기 호환성을 위해 document 객체에도 등록
            document.addEventListener('message', this.handleNativeMessage as EventListener);
            this.isListening = true;
        }
    }

    /**
     * DOM 이벤트 리스너를 해제합니다. (구독자가 0명이 될 때 자원 최적화용으로 호출됨)
     */
    private teardownListener() {
        if (this.isListening && typeof window !== 'undefined') {
            window.removeEventListener('message', this.handleNativeMessage);
            document.removeEventListener('message', this.handleNativeMessage as EventListener);
            this.isListening = false;
        }
    }

    /**
     * Window 객체에서 발생하는 `message` 이벤트를 가로채어 파싱하는 내부 핸들러입니다.
     */
    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;

            // 문자열이나 바이너리 포맷이 아니면 무시 (브라우저 확장 프로그램 등 외부 주입 이벤트 필터링)
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
                return;
            }

            // 프로토콜을 이용해 데이터 역직렬화 (Decode)
            const parsed = this.protocol.decode(data);

            // 정상적인 브릿지 규격(type 존재 여부)인지 1차 검증 후 구독자들에게 브로드캐스트
            if (parsed && typeof parsed.type === 'string') {
                this.handlers.forEach(h =>
                    h(parsed as TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>)
                );
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] 메시지 파싱 실패:', e);
        }
    };

    /**
     * [Web -> App] 네이티브 환경의 인터페이스를 찾아 직렬화된 데이터를 전송합니다.
     */
    public postMessage(message: TypedRequestMessage<RequestType>): void {
        try {
            const encoded = this.protocol.encode(message);

            if (typeof encoded === 'string') {
                // 1. Android / 일반적인 커스텀 인터페이스
                if (window.ChaticMessageHandler?.postMessage) {
                    window.ChaticMessageHandler.postMessage(encoded);
                    // 2. iOS WKWebView 인터페이스
                } else if (window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) {
                    window.webkit.messageHandlers.ChaticMessageHandler.postMessage(encoded);
                    // 3. React Native WebView 인터페이스
                } else if (window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(encoded);
                } else {
                    console.warn(
                        '[NativeBridgeAdapter] 네이티브 브릿지 인터페이스를 찾을 수 없습니다. (웹 환경인지 확인)'
                    );
                }
            } else {
                console.error(
                    '[NativeBridgeAdapter] React Native 환경에서는 base64 변환 없이 Uint8Array를 직접 전송할 수 없습니다.'
                );
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] 메시지 인코딩 실패:', e);
        }
    }

    /**
     * [App -> Web] 이벤트를 청취할 핸들러를 등록합니다.
     */
    public onMessage(
        handler: (message: TypedResponseMessage<ResponseType> | TypedEventMessage<EventType>) => void
    ): () => void {
        this.handlers.push(handler);

        // 첫 구독자가 등록될 때 DOM 리스너를 활성화합니다.
        if (this.handlers.length === 1) {
            this.setupListener();
        }

        // 해제(Cleanup) 클로저 반환
        return () => {
            this.handlers = this.handlers.filter(h => h !== handler);

            // 더 이상 수신 대기 중인 구독자가 없으면 DOM 리스너를 해제하여 메모리 누수를 방지합니다.
            if (this.handlers.length === 0) {
                this.teardownListener();
            }
        };
    }
}
