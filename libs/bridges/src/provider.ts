import type { IWebBridgeClient } from './web';
import { MockWebBridgeClient, NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IAppBridgeHost } from './app';
import { AppBridgeHost } from './app';
import { MessageQueue } from './common';

/**
 * Bridges 모듈 전반의 의존성 관리 및 인스턴스 주입을 담당하는 프로바이더 클래스입니다.
 */
export class BridgeProvider {
    private static instance: BridgeProvider;

    private _webClient: IWebBridgeClient | null = null;
    private _appHost: IAppBridgeHost | null = null;

    private constructor() {
        /* empty */
    }

    public static getInstance(): BridgeProvider {
        if (!BridgeProvider.instance) {
            BridgeProvider.instance = new BridgeProvider();
        }
        return BridgeProvider.instance;
    }

    /**
     * 테스트 및 런타임 초기화를 위해 캐싱된 인스턴스들을 재설정(비우기)합니다.
     */
    public reset(): void {
        this._webClient = null;
        this._appHost = null;
    }

    /**
     * 환경(Native 여부)에 적절한 IWebBridgeClient 인스턴스를 팩터리 메서드로 생성하여 제공합니다.
     */
    public getWebClient(): IWebBridgeClient {
        if (this._webClient) return this._webClient;

        const isNative =
            typeof window !== 'undefined' &&
            !!(
                window.ReactNativeWebView?.postMessage ||
                window.ChaticMessageHandler?.postMessage ||
                window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
            );

        if (isNative) {
            const webQueue = new MessageQueue<any>();
            this._webClient = new WebBridgeClient({
                adapter: new NativeBridgeAdapter(),
                version: '2.0.0',
                timeoutMs: 15000,
                pendingBuffer: webQueue,
            });
        } else {
            this._webClient = new MockWebBridgeClient();
        }

        return this._webClient;
    }

    /**
     * IAppBridgeHost 인스턴스를 생성하여 제공합니다. (MessageQueue 주입)
     */
    public getAppHost(sendToWeb: (message: string) => void): IAppBridgeHost {
        if (!this._appHost) {
            const appQueue = new MessageQueue<any>();
            this._appHost = new AppBridgeHost({
                sendToWeb,
                version: '2.0.0',
                eventBuffer: appQueue,
            });
        }
        return this._appHost;
    }
}

// 편의를 위한 싱글톤 인스턴스/게터 제공
export const bridgeProvider = BridgeProvider.getInstance();
export const webClient = bridgeProvider.getWebClient();

/**
 * 현재 실행 환경이 네이티브 앱(WebView) 내부인지 확인합니다.
 * bridgeService.isNative()의 대체 유틸리티입니다.
 */
export const isNative = (): boolean =>
    typeof window !== 'undefined' &&
    !!(
        window.ReactNativeWebView?.postMessage ||
        window.ChaticMessageHandler?.postMessage ||
        window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
    );
