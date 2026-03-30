/**
 * Deep Link Manager
 *
 * Central manager for handling all deep link scenarios in hybrid WebView apps:
 * - Immediate deep links (app already installed)
 * - Deferred deep links (first install)
 * - Cold start, warm start, hot start
 *
 * Architecture:
 * - Processes deep link URLs (validation, short URL expansion)
 * - Converts deep link domain to frontend domain
 * - Delegates URL handling to WebView handler (Zustand store manages pending state)
 */

import { Linking, NativeModules, Platform } from 'react-native';

import { handleDeferredDeepLink } from './deferred';
import { isShortUrl, isValidDeepLink } from './parser';
import { convertDeepLinkToFrontendUrl, convertShortUrlWithEnvs, needsConversion } from './urlConverter';

import type { ServiceEndpoints } from './urlConverter';
import type { DeepLinkConfig, DeepLinkSource, WebViewHandler } from './types';

/** Time to wait for a late-arriving Universal Link URL after getInitialURL returns null */
const LATE_URL_WAIT_MS = 500;

const DEFAULT_CONFIG: DeepLinkConfig = {
    deepLinkDomain: 'app.chatic.io',
    frontendDomain: 'dou.chatic.io',
    customSchemes: ['chatic', 'chatic-dev'],
};

export class DeepLinkManager {
    private webViewHandler: WebViewHandler | null = null;
    private linkingSubscription: { remove: () => void } | null = null;
    private config: DeepLinkConfig;
    private isInitialized = false;
    private coldStartResolve: (() => void) | null = null;
    private coldStartPromise: Promise<void> | null = null;
    private lateUrlTimeout: ReturnType<typeof setTimeout> | null = null;
    // App readiness gate: URL capture happens immediately, but processing waits for Firebase etc.
    private appReadyResolve: (() => void) | null = null;
    private appReadyPromise: Promise<void>;

    constructor(config?: Partial<DeepLinkConfig>) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
        this.appReadyPromise = new Promise<void>(resolve => {
            this.appReadyResolve = resolve;
            // Fallback: auto-resolve after 5s in case splash never finishes
            setTimeout(() => {
                if (this.appReadyResolve) {
                    console.warn('[DeepLinkManager] App ready timeout, auto-resolving');
                    this.appReadyResolve();
                    this.appReadyResolve = null;
                }
            }, 5000);
        });
    }

    /**
     * Signal that the app is ready for deep link processing.
     * Call after splash screen / Firebase initialization is complete.
     * URL capture (Linking listeners) starts immediately, but actual processing
     * (Firestore lookup, WebView delivery) waits for this signal.
     */
    setAppReady(): void {
        console.log('[DeepLinkManager] App ready signal received');
        this.appReadyResolve?.();
        this.appReadyResolve = null;
    }

    /**
     * Initialize deep link manager with WebView handler
     * Handler should store URL in Zustand store for WebView navigation
     */
    initialize(handler: WebViewHandler): void {
        if (this.isInitialized) {
            console.log('[DeepLinkManager] Already initialized, skipping');
            return;
        }

        this.webViewHandler = handler;
        this.isInitialized = true;
        this.setupImmediateDeepLinks();
    }

    /**
     * Try to get the initial Universal Link URL from native module.
     * Workaround for React Native race condition: on iOS Release builds,
     * Linking.getInitialURL() may return null because the JS executes before
     * application(_:continue:restorationHandler:) is called by iOS.
     * The native module buffers the URL in AppDelegate.initialUniversalLink.
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
     * Resolve cold start promise and clean up state.
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
     * Setup listeners for immediate deep links.
     * Deferred links are only checked when there is no cold start URL.
     *
     * Uses a 3-layer strategy for cold start URL capture:
     * 1. Linking.getInitialURL() — standard RN API
     * 2. Native module fallback — reads URL buffered in AppDelegate
     * 3. Late URL wait — waits briefly for addEventListener to fire
     */
    private setupImmediateDeepLinks(): void {
        this.coldStartPromise = new Promise<void>(resolve => {
            this.coldStartResolve = resolve;
        });

        // Listen for URL events (warm start OR late-arriving cold start)
        this.linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            if (this.coldStartResolve) {
                // coldStart not yet resolved — this is a late-arriving cold start URL
                console.log('[DeepLinkManager] Late cold start URL via addEventListener:', url);
                this.handleDeepLink(url, 'cold_start').finally(() => this.finishColdStart());
            } else {
                // Normal warm start
                console.log('[DeepLinkManager] Warm start URL:', url);
                this.handleDeepLink(url, 'warm_start');
            }
        });

        // Get initial URL (cold start) with native module fallback
        Linking.getInitialURL()
            .then(async url => {
                if (url) {
                    console.log('[DeepLinkManager] Cold start URL from getInitialURL:', url);
                    await this.handleDeepLink(url, 'cold_start');
                    this.finishColdStart();
                    return;
                }

                // Fallback: try native module (iOS Universal Link buffer)
                const nativeUrl = await this.getNativeInitialUrl();
                if (nativeUrl) {
                    console.log('[DeepLinkManager] Cold start URL from native module:', nativeUrl);
                    await this.handleDeepLink(nativeUrl, 'cold_start');
                    this.finishColdStart();
                    return;
                }

                // Neither source had a URL — wait briefly for late addEventListener delivery.
                // In Release builds, the Universal Link callback may fire AFTER getInitialURL
                // returns null. The addEventListener above will catch it and resolve coldStart.
                console.log('[DeepLinkManager] No initial URL, waiting for late delivery...');
                this.lateUrlTimeout = setTimeout(async () => {
                    if (!this.coldStartResolve) return; // Already resolved by addEventListener
                    console.log('[DeepLinkManager] Late URL wait expired, checking deferred links');
                    await this.handleDeferredLinks();
                    this.finishColdStart();
                }, LATE_URL_WAIT_MS);
            })
            .catch(err => {
                console.error('[DeepLinkManager] Error getting initial URL:', err);
                this.finishColdStart();
            });
    }

    /**
     * Handle deferred deep links (first install scenario)
     */
    private async handleDeferredLinks(): Promise<void> {
        try {
            const deferredUrl = await handleDeferredDeepLink();
            if (deferredUrl) {
                console.log('[DeepLinkManager] Deferred URL:', deferredUrl);
                await this.handleDeepLink(deferredUrl, 'deferred');
            }
        } catch (error) {
            console.error('[DeepLinkManager] Error handling deferred deep links:', error);
        }
    }

    /**
     * Wait for cold start deep link processing to complete.
     */
    async waitForColdStart(): Promise<void> {
        if (this.coldStartPromise) {
            await this.coldStartPromise;
        }
    }

    /**
     * Main deep link handler
     * Processes URL and passes to handler (Zustand store manages pending state)
     *
     * Order: validate → domain conversion → short URL expansion → deliver
     * Domain conversion must happen before short URL expansion because
     * custom schemes (chatic-dev://s/xxx) break isShortUrl() parsing.
     */
    private async handleDeepLink(url: string, source: DeepLinkSource): Promise<void> {
        let processedUrl = url;
        let envs: ServiceEndpoints | undefined;

        // 1. Validate original URL
        if (!isValidDeepLink(processedUrl)) {
            console.error('[DeepLinkManager] Invalid deep link URL:', processedUrl);
            return;
        }

        // 2. Convert custom scheme / deep link domain to frontend URL first
        if (needsConversion(processedUrl)) {
            processedUrl = convertDeepLinkToFrontendUrl(processedUrl);

            if (!processedUrl.startsWith('https://')) {
                console.error('[DeepLinkManager] Converted URL is not HTTPS:', processedUrl);
                return;
            }
        }

        // Wait for app to be ready (Firebase initialized) before Firestore lookup
        // URL capture happens immediately, but processing is gated here
        if (isShortUrl(processedUrl)) {
            console.log('[DeepLinkManager] Waiting for app ready before Firestore lookup...');
            await this.appReadyPromise;
        }

        // 3. Expand short URL (/s/xxx) after domain conversion
        try {
            const result = await convertShortUrlWithEnvs(processedUrl);
            processedUrl = result.url;
            envs = result.envs;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[DeepLinkManager] Error expanding short URL:', message);
            this.webViewHandler?.handleError?.(message);
            return;
        }

        // If URL is still a short URL after expansion, Firestore lookup failed
        if (isShortUrl(processedUrl)) {
            console.error('[DeepLinkManager] Short URL expansion failed, URL unchanged:', processedUrl);
            this.webViewHandler?.handleError?.('Invite link not found');
            return;
        }

        // 4. Deliver to handler
        if (!this.webViewHandler) {
            console.error('[DeepLinkManager] WebView handler not initialized');
            return;
        }

        console.log('[DeepLinkManager] Delivering deep link:', processedUrl, 'source:', source, 'envs:', envs);
        this.webViewHandler.handleDeepLink(processedUrl, source, envs);
    }

    /**
     * Manually handle a deep link URL
     * Useful for handling URLs from push notifications or other sources
     */
    async handleUrl(url: string): Promise<void> {
        await this.handleDeepLink(url, 'warm_start');
    }

    /**
     * Get current configuration
     */
    getConfig(): DeepLinkConfig {
        return { ...this.config };
    }

    /**
     * Cleanup
     */
    cleanup(): void {
        if (this.lateUrlTimeout) {
            clearTimeout(this.lateUrlTimeout);
            this.lateUrlTimeout = null;
        }
        this.linkingSubscription?.remove();
        this.linkingSubscription = null;
        this.webViewHandler = null;
        this.isInitialized = false;
        this.coldStartResolve?.();
        this.coldStartResolve = null;
        this.coldStartPromise = null;
        this.appReadyResolve?.();
        this.appReadyResolve = null;
    }
}

// Singleton instance
let instance: DeepLinkManager | null = null;

/**
 * Get or create DeepLinkManager singleton instance
 */
export const getDeepLinkManager = (config?: Partial<DeepLinkConfig>): DeepLinkManager => {
    if (!instance) {
        instance = new DeepLinkManager(config);
    }
    return instance;
};

/**
 * Reset singleton instance (useful for testing)
 */
export const resetDeepLinkManager = (): void => {
    instance?.cleanup();
    instance = null;
};
