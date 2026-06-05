import { Linking, NativeModules, Platform } from 'react-native';

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
                console.log('[DeepLinkManager] Native module initial URL:', url);
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
        this.coldStartPromise = new Promise<void>(resolve => {
            this.coldStartResolve = resolve;
        });

        try {
            // 1. Check standard getInitialURL
            const url = await Linking.getInitialURL();
            if (url) {
                console.log('[DeepLinkManager] Cold start URL from Linking.getInitialURL:', url);
                this.finishColdStart();
                return url;
            }

            // 2. Fallback to buffered native AppDelegate universal link
            const nativeUrl = await this.getNativeInitialUrl();
            if (nativeUrl) {
                console.log('[DeepLinkManager] Cold start URL from native module:', nativeUrl);
                this.finishColdStart();
                return nativeUrl;
            }

            // 3. Fallback: wait briefly for late addEventListener 'url' event delivery
            await new Promise<void>(resolve => {
                this.lateUrlTimeout = setTimeout(() => {
                    console.log('[DeepLinkManager] Late URL wait expired');
                    this.finishColdStart();
                    resolve();
                }, LATE_URL_WAIT_MS);
            });

            return null;
        } catch (err) {
            console.error('[DeepLinkManager] Error getting initial URL:', err);
            this.finishColdStart();
            return null;
        }
    }

    /**
     * Subscribes to incoming URL events (warm starts / late cold starts)
     * and forwards them to React Navigation.
     */
    subscribe(listener: (url: string) => void): () => void {
        this.routerListener = listener;

        const sub = Linking.addEventListener('url', ({ url }) => {
            console.log('[DeepLinkManager] Deep link URL event received:', url);
            if (this.coldStartResolve) {
                console.log('[DeepLinkManager] Forwarding late cold start URL to listener:', url);
                this.finishColdStart();
            }
            this.routerListener?.(url);
        });

        this.linkingSubscription = sub;

        return () => {
            sub.remove();
            this.linkingSubscription = null;
            this.routerListener = null;
            if (this.lateUrlTimeout) {
                clearTimeout(this.lateUrlTimeout);
            }
        };
    }
}
