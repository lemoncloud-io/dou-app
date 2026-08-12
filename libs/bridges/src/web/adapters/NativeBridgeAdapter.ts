import { logger } from '@chatic/logger';

import type { BridgeAdapter } from './types';
import type { EventMessage, RequestMessage, ResponseMessage, MessageProtocol } from '../../common';
import { JsonProtocol } from '../../common';

/**
 * 모바일 네이티브 WebView 환경(React Native WebView, iOS WebKit, Android WebView 등)에서
 * 실제 네이티브 앱과 메시지를 주고받는 배포용 브릿지 어댑터 구현체입니다.
 */
export class NativeBridgeAdapter implements BridgeAdapter {
    /** 수신된 메시지를 처리할 콜백 핸들러들의 집합 */
    private handlers = new Set<(message: ResponseMessage | EventMessage) => void>();
    /** 메시지 직렬화/역직렬화를 위한 프로토콜 엔진 */
    private protocol: MessageProtocol;
    /** window/document 이벤트 리스너 등록 상태 플래그 */
    private isListening = false;

    constructor(protocol: MessageProtocol = JsonProtocol) {
        this.protocol = protocol;
    }

    /**
     * [Internal] DOM의 'message' 이벤트를 구독하여 네이티브에서 올라오는 메시지를 감시하기 시작합니다.
     */
    private setupListener() {
        if (!this.isListening && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
                document.addEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = true;
        }
    }

    /**
     * [Internal] 더 이상 메시지를 감시할 핸들러가 없을 때 이벤트 리스너를 정리(teardown)합니다.
     */
    private teardownListener() {
        if (this.isListening && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('message', this.handleNativeMessage);
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('message', this.handleNativeMessage as EventListener);
            }
            this.isListening = false;
        }
    }

    /**
     * [Internal] 네이티브에서 웹뷰 채널을 통해 발송되어 온 이벤트를 파싱 및 검증한 후, 등록된 모든 핸들러로 라우팅합니다.
     */
    private handleNativeMessage = (event: MessageEvent) => {
        try {
            const data = event.data;
            // 브릿지 통신 데이터 규격(문자열 또는 바이너리)이 아니면 무시합니다.
            if (typeof data !== 'string' && !(data instanceof Uint8Array)) return;

            const parsed = this.protocol.decode(data);
            // 유효한 브릿지 메시지 데이터 규격인 경우에만 핸들러로 발송합니다.
            if (parsed && 'type' in parsed && typeof parsed.type === 'string') {
                this.handlers.forEach(handler => handler(parsed as ResponseMessage | EventMessage));
            }
        } catch (e) {
            // `decode` swallows its own parse failures (returns null), so what lands
            // here is a receiving handler that threw — app code, worth a breadcrumb.
            // Safe to log through the logger: this is the inbound path, so it never
            // re-enters `postMessage` the way the outbound path would.
            logger.error('BRIDGE', '[NativeBridgeAdapter] inbound handler threw', { error: e });
        }
    };

    /**
     * [Web -> App] 메시지를 JSON 직렬화하여 기기 환경에 매핑된 네이티브 인터페이스로 전송합니다.
     *
     * **이 메서드 안의 진단은 `logger`가 아니라 `console`이어야 한다.** 네이티브에서는
     * `createNativeForwarder`가 로그 엔트리마다 이 메서드를 호출한다 — 여기서 `logger`를
     * 부르면 로그 → forwarder → postMessage → 실패 → 로그로 무한 재귀한다. 전송이 실패한
     * 상황에서는 그 사실을 브릿지 너머로 보낼 방법이 애초에 없으므로, 콘솔이 갈 수 있는
     * 유일한 곳이다. (수신 경로인 `handleNativeMessage`는 이 제약이 없어 logger를 쓴다.)
     */
    public postMessage(message: RequestMessage): void {
        try {
            const encoded = this.protocol.encode(message);

            if (typeof encoded !== 'string') {
                console.warn('[NativeBridgeAdapter] this bridge only sends string payloads');
                return;
            }

            if (typeof window !== 'undefined') {
                // 1. Android 커스텀 인터페이스 지원 확인 및 전송
                if (window.ChaticMessageHandler?.postMessage) {
                    window.ChaticMessageHandler.postMessage(encoded);
                }
                // 2. iOS/macOS WebKit MessageHandler 지원 확인 및 전송
                else if (window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) {
                    window.webkit.messageHandlers.ChaticMessageHandler.postMessage(encoded);
                }
                // 3. React Native WebView postMessage 채널 지원 확인 및 전송
                else if (window.ReactNativeWebView?.postMessage) {
                    window.ReactNativeWebView.postMessage(encoded);
                }
                // 4. 네이티브 환경 감지 실패 시 경고 출력
                else {
                    console.warn('[NativeBridgeAdapter] no native bridge interface found');
                }
            } else {
                console.warn('[NativeBridgeAdapter] SSR environment exposes no native bridge interface');
            }
        } catch (e) {
            console.error('[NativeBridgeAdapter] failed to encode message:', e);
        }
    }

    /**
     * [App -> Web] 네이티브에서 전송된 메시지를 처리할 수신 콜백(handler)을 등록합니다.
     * 첫 핸들러가 등록되는 시점에 자동으로 DOM message 리스너가 가동됩니다.
     */
    public onMessage(handler: (message: ResponseMessage | EventMessage) => void): () => void {
        this.handlers.add(handler);
        if (this.handlers.size === 1) this.setupListener();

        return () => {
            this.handlers.delete(handler);
            if (this.handlers.size === 0) this.teardownListener();
        };
    }
}
