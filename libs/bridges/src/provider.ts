import type { IWebBridgeClient } from './web';
import { MockWebBridgeClient, NativeBridgeAdapter, WebBridgeClient } from './web';
import type { IAppBridgeHost } from './app';
import { AppBridgeHost } from './app';
import { MessageQueue } from './common';
import { BRIDGE_PROTOCOL_VERSION } from './version';

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
     * Web 런타임에서는 native bridge가 아직 주입되지 않았더라도 WebBridgeClient를 생성합니다.
     * WebBridgeClient가 bridge availability를 polling하고 요청을 buffer하므로, import 시점이 빨라도 mock으로 고정되지 않습니다.
     */
    public getWebClient(): IWebBridgeClient {
        if (this._webClient) return this._webClient;

        if (canCreateWebBridgeClient()) {
            const webQueue = new MessageQueue<any>();
            this._webClient = new WebBridgeClient({
                adapter: new NativeBridgeAdapter(),
                version: BRIDGE_PROTOCOL_VERSION,
                timeoutMs: 15000,
                pendingBuffer: webQueue,
            });
            return this._webClient;
        }

        this._webClient = new MockWebBridgeClient();
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
                version: BRIDGE_PROTOCOL_VERSION,
                eventBuffer: appQueue,
            });
        }
        return this._appHost;
    }
}

// 편의를 위한 싱글톤 인스턴스/게터 제공
export const bridgeProvider = BridgeProvider.getInstance();
export const webClient: IWebBridgeClient = {
    post: (...args: any[]) => (bridgeProvider.getWebClient().post as any)(...args),
    request: (...args: any[]) => (bridgeProvider.getWebClient().request as any)(...args),
    onEvent: (...args: any[]) => (bridgeProvider.getWebClient().onEvent as any)(...args),
} as IWebBridgeClient;

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

const canCreateWebBridgeClient = (): boolean =>
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.addEventListener === 'function';
