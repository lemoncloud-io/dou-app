import type { IWebBridgeClient } from './web';
import { NativeBridgeAdapter, NonNativeFailBridgeClient, WebBridgeClient } from './web';
import type { IAppBridgeHost } from './app';
import { AppBridgeHost } from './app';
import { MessageQueue } from './common';
import { BRIDGE_PROTOCOL_VERSION } from './version';

export interface BridgeProviderConfig {
    createWebClient?: () => IWebBridgeClient;
    createAppHost?: (sendToWeb: (message: string) => void) => IAppBridgeHost;
}

export interface BridgeProviderEnvironment {
    webClient: IWebBridgeClient;
    appHost?: IAppBridgeHost;
}

interface EventSubscription {
    type: string;
    handler: (message: any) => void;
    unsubscribe?: () => void;
}

class DelegatingWebBridgeClient implements IWebBridgeClient {
    private activeClient: IWebBridgeClient | null = null;
    private createClient: () => IWebBridgeClient;
    private readonly eventSubscriptions = new Map<symbol, EventSubscription>();

    constructor(createClient: () => IWebBridgeClient) {
        this.createClient = createClient;
    }

    public setFactory(createClient: () => IWebBridgeClient): void {
        this.createClient = createClient;
        this.clearActiveClient();
        if (this.eventSubscriptions.size > 0) {
            this.replaceClient(this.createClient());
        }
    }

    public replaceClient(client: IWebBridgeClient): void {
        this.unbindEvents();
        this.activeClient = client;
        this.bindEvents();
    }

    public clearActiveClient(): void {
        this.unbindEvents();
        this.activeClient = null;
    }

    public getActiveClient(): IWebBridgeClient {
        if (!this.activeClient) {
            const client = this.createClient();
            this.replaceClient(client);
            return client;
        }
        return this.activeClient;
    }

    public getCurrentClient(): IWebBridgeClient | null {
        return this.activeClient;
    }

    public post: IWebBridgeClient['post'] = ((...args: any[]) => {
        return (this.getActiveClient().post as any)(...args);
    }) as IWebBridgeClient['post'];

    public request: IWebBridgeClient['request'] = ((...args: any[]) => {
        return (this.getActiveClient().request as any)(...args);
    }) as IWebBridgeClient['request'];

    public onEvent: IWebBridgeClient['onEvent'] = ((type: string, handler: (message: any) => void) => {
        const key = Symbol(type);
        const subscription: EventSubscription = { type, handler };

        this.eventSubscriptions.set(key, subscription);
        subscription.unsubscribe = (this.getActiveClient().onEvent as any)(type, handler);

        return () => {
            subscription.unsubscribe?.();
            this.eventSubscriptions.delete(key);
        };
    }) as IWebBridgeClient['onEvent'];

    private bindEvents(): void {
        if (!this.activeClient) return;

        this.eventSubscriptions.forEach(subscription => {
            subscription.unsubscribe = (this.activeClient!.onEvent as any)(subscription.type, subscription.handler);
        });
    }

    private unbindEvents(): void {
        this.eventSubscriptions.forEach(subscription => {
            subscription.unsubscribe?.();
            subscription.unsubscribe = undefined;
        });
    }
}

/**
 * Bridges 모듈 전반의 의존성 관리 및 인스턴스 주입을 담당하는 프로바이더 클래스입니다.
 */
export class BridgeProvider {
    private static instance: BridgeProvider;

    private readonly _webClient: DelegatingWebBridgeClient;
    private _appHost: IAppBridgeHost | null = null;
    private createWebClient: () => IWebBridgeClient = createDefaultWebClient;
    private createAppHost: (sendToWeb: (message: string) => void) => IAppBridgeHost = createDefaultAppHost;

    private constructor() {
        this._webClient = new DelegatingWebBridgeClient(() => this.createWebClient());
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
        this._webClient.clearActiveClient();
        this._appHost = null;
    }

    /**
     * 테스트/로컬 시뮬레이션에서 bridge 구현체를 바꿔 끼우기 위한 DI 설정입니다.
     */
    public configure(config: BridgeProviderConfig): void {
        this.createWebClient = config.createWebClient ?? createDefaultWebClient;
        this.createAppHost = config.createAppHost ?? createDefaultAppHost;
        this._webClient.setFactory(this.createWebClient);
        this._appHost = null;
    }

    public restoreDefaults(): void {
        this.configure({});
    }

    /**
     * 앱 실행 중 현재 bridge 환경을 즉시 교체합니다.
     * export된 `webClient` proxy와 기존 event subscription은 새 Web client로 재연결됩니다.
     */
    public useBridgeEnvironment(environment: BridgeProviderEnvironment): () => void {
        const previousCreateWebClient = this.createWebClient;
        const previousCreateAppHost = this.createAppHost;
        const previousWebClient = this._webClient.getCurrentClient();
        const previousAppHost = this._appHost;

        this.createWebClient = () => environment.webClient;
        this._webClient.replaceClient(environment.webClient);

        if (environment.appHost) {
            this.createAppHost = () => environment.appHost!;
            this._appHost = environment.appHost;
        }

        return () => {
            this.createWebClient = previousCreateWebClient;
            this.createAppHost = previousCreateAppHost;
            if (previousWebClient) {
                this._webClient.replaceClient(previousWebClient);
            } else {
                this._webClient.clearActiveClient();
            }
            this._appHost = previousAppHost;
        };
    }

    public getActiveWebClient(): IWebBridgeClient {
        return this._webClient.getActiveClient();
    }

    /**
     * Web 런타임에서는 native bridge가 아직 주입되지 않았더라도 WebBridgeClient를 생성합니다.
     * WebBridgeClient가 bridge availability를 polling하고 요청을 buffer하므로, import 시점이 빨라도 mock으로 고정되지 않습니다.
     */
    public getWebClient(): IWebBridgeClient {
        return this._webClient;
    }

    /**
     * IAppBridgeHost 인스턴스를 생성하여 제공합니다. (MessageQueue 주입)
     */
    public getAppHost(sendToWeb: (message: string) => void): IAppBridgeHost {
        if (!this._appHost) {
            this._appHost = this.createAppHost(sendToWeb);
        }
        return this._appHost;
    }
}

// 편의를 위한 싱글톤 인스턴스/게터 제공
export const bridgeProvider = BridgeProvider.getInstance();
export const webClient: IWebBridgeClient = bridgeProvider.getWebClient();

/**
 * 현재 실행 환경이 네이티브 앱(WebView) 내부인지 확인합니다.
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

function createDefaultWebClient(): IWebBridgeClient {
    if (canCreateWebBridgeClient()) {
        const webQueue = new MessageQueue<any>();
        return new WebBridgeClient({
            adapter: new NativeBridgeAdapter(),
            version: BRIDGE_PROTOCOL_VERSION,
            timeoutMs: 15000,
            pendingBuffer: webQueue,
        });
    }

    return new NonNativeFailBridgeClient({ version: BRIDGE_PROTOCOL_VERSION });
}

function createDefaultAppHost(sendToWeb: (message: string) => void): IAppBridgeHost {
    const appQueue = new MessageQueue<any>();
    return new AppBridgeHost({
        sendToWeb,
        version: BRIDGE_PROTOCOL_VERSION,
        eventBuffer: appQueue,
    });
}
