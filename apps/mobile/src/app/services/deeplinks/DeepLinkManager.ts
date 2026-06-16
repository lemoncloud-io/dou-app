import { Linking, NativeModules, Platform } from 'react-native';

import type { ILogService } from '../log';

const LATE_URL_WAIT_MS = 500;

/**
 * DeepLinkManager
 *
 * Captures raw deep link URLs from the OS.
 * Handles React Native deep link events, cold start (getInitialURL),
 * and native iOSAppDelegate universal link buffering workaround.
 */
export class DeepLinkManager {
    private linkingSubscription: { remove: () => void } | null = null;
    private coldStartResolve: (() => void) | null = null;
    private coldStartPromise: Promise<void> | null = null;
    private lateUrlTimeout: ReturnType<typeof setTimeout> | null = null;
    private routerListener: ((url: string) => void) | null = null;

    constructor(private readonly logger?: ILogService) {}

    private trace(message: string, data?: Record<string, unknown>): void {
        this.logger?.info('DEEPLINK', `[DeepLinkManager] ${message}`, data);
    }

    private traceError(message: string, error?: unknown): void {
        this.logger?.error('DEEPLINK', `[DeepLinkManager] ${message}`, error);
    }

    /**
     * Retrieves the initial universal link buffered in AppDelegate on iOS Release builds.
     * Workaround for standard Linking.getInitialURL() race condition.
     */
    private async getNativeInitialUrl(): Promise<string | null> {
        if (Platform.OS !== 'ios') return null;
        try {
            const { InitialUrlModule } = NativeModules;
            if (!InitialUrlModule?.getInitialUniversalLink) return null;
            const url = await InitialUrlModule.getInitialUniversalLink();
            if (url) {
                this.trace('Native module initial URL captured', { url });
            }
            return url ?? null;
        } catch {
            return null;
        }
    }

    /**
     * Completes the cold start phase and clears timeouts.
     */
    private finishColdStart(): void {
        if (this.lateUrlTimeout) {
            clearTimeout(this.lateUrlTimeout);
            this.lateUrlTimeout = null;
        }
        this.coldStartResolve?.();
        this.coldStartResolve = null;
    }

    /**
     * Wait for cold start deep link capture to complete.
     */
    async waitForColdStart(): Promise<void> {
        if (this.coldStartPromise) {
            await this.coldStartPromise;
        }
    }

    /**
     * Resolves the initial URL for React Navigation's getInitialURL method.
     */
    async getInitialUrl(): Promise<string | null> {
        this.trace('getInitialUrl started');
        this.coldStartPromise = new Promise<void>(resolve => {
            this.coldStartResolve = resolve;
        });

        try {
            // 1. Check standard getInitialURL
            const url = await Linking.getInitialURL();
            if (url) {
                this.trace('Cold start URL captured from Linking.getInitialURL', { url });
                this.finishColdStart();
                return url;
            }

            // 2. Fallback to buffered native AppDelegate universal link
            const nativeUrl = await this.getNativeInitialUrl();
            if (nativeUrl) {
                this.trace('Cold start URL captured from native module', { url: nativeUrl });
                this.finishColdStart();
                return nativeUrl;
            }

            // 3. Fallback: wait briefly for late addEventListener 'url' event delivery
            await new Promise<void>(resolve => {
                this.lateUrlTimeout = setTimeout(() => {
                    this.trace('Late URL wait expired without URL');
                    this.finishColdStart();
                    resolve();
                }, LATE_URL_WAIT_MS);
            });

            this.trace('getInitialUrl completed without URL');
            return null;
        } catch (err) {
            this.traceError('Error getting initial URL', err);
            this.finishColdStart();
            return null;
        }
    }

    /**
     * Subscribes to incoming URL events (warm starts / late cold starts)
     * and forwards them to React Navigation.
     */
    subscribe(listener: (url: string) => void): () => void {
        this.trace('Subscribing to Linking url events');
        this.routerListener = listener;

        const sub = Linking.addEventListener('url', ({ url }) => {
            this.trace('Hot/warm URL event received from OS', { url, hasRouterListener: !!this.routerListener });
            if (this.coldStartResolve) {
                this.trace('Forwarding late cold start URL to router listener', { url });
                this.finishColdStart();
            }
            this.routerListener?.(url);
        });

        this.linkingSubscription = sub;

        return () => {
            this.trace('Unsubscribing from Linking url events');
            sub.remove();
            this.linkingSubscription = null;
            this.routerListener = null;
            if (this.lateUrlTimeout) {
                clearTimeout(this.lateUrlTimeout);
            }
        };
    }
}
