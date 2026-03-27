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

import { Linking } from 'react-native';

import { handleDeferredDeepLink } from './deferred';
import { isShortUrl, isValidDeepLink } from './parser';
import { convertDeepLinkToFrontendUrl, convertShortUrlWithEnvs, needsConversion } from './urlConverter';

import type { ServiceEndpoints } from './urlConverter';
import type { DeepLinkConfig, DeepLinkSource, WebViewHandler } from './types';

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
    // DEBUG: deep link event counter for diagnosing real device issues
    private deepLinkCount = 0;

    constructor(config?: Partial<DeepLinkConfig>) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
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
     * Setup listeners for immediate deep links.
     * Deferred links are only checked when there is no cold start URL.
     */
    private setupImmediateDeepLinks(): void {
        this.coldStartPromise = new Promise<void>(resolve => {
            this.coldStartResolve = resolve;
        });

        // Get initial URL (cold start)
        Linking.getInitialURL()
            .then(async url => {
                if (url) {
                    console.log('[DeepLinkManager] Cold start URL:', url);
                    await this.handleDeepLink(url, 'cold_start');
                } else {
                    await this.handleDeferredLinks();
                }
            })
            .catch(err => console.error('[DeepLinkManager] Error getting initial URL:', err))
            .finally(() => {
                this.coldStartResolve?.();
                this.coldStartResolve = null;
            });

        // Listen for URL events (app already running - warm start)
        this.linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            this.deepLinkCount++;
            console.log(
                `[DeepLinkManager] 🔗 WARM START #${this.deepLinkCount} | ${new Date().toISOString()} | URL: ${url}`
            );
            this.handleDeepLink(url, 'warm_start');
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
        const tag = `[DeepLink #${this.deepLinkCount}]`;
        let processedUrl = url;
        let envs: ServiceEndpoints | undefined;

        // 1. Validate original URL
        if (!isValidDeepLink(processedUrl)) {
            console.error(`${tag} ❌ STEP1 FAILED: invalid URL: ${processedUrl}`);
            return;
        }
        console.log(`${tag} ✅ STEP1: validated`);

        // 2. Convert custom scheme / deep link domain to frontend URL first
        if (needsConversion(processedUrl)) {
            processedUrl = convertDeepLinkToFrontendUrl(processedUrl);

            if (!processedUrl.startsWith('https://')) {
                console.error(`${tag} ❌ STEP2 FAILED: not HTTPS: ${processedUrl}`);
                return;
            }
        }
        console.log(`${tag} ✅ STEP2: converted → ${processedUrl}`);

        // 3. Expand short URL (/s/xxx) after domain conversion
        try {
            const result = await convertShortUrlWithEnvs(processedUrl);
            processedUrl = result.url;
            envs = result.envs;
            console.log(`${tag} ✅ STEP3: expanded → ${processedUrl}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error(`${tag} ❌ STEP3 FAILED: short URL expansion error:`, message);
            this.webViewHandler?.handleError?.(message);
            return;
        }

        // If URL is still a short URL after expansion, Firestore lookup failed
        if (isShortUrl(processedUrl)) {
            console.error(`${tag} ❌ STEP3 FAILED: short URL unchanged (Firestore lookup failed):`, processedUrl);
            this.webViewHandler?.handleError?.('Invite link not found');
            return;
        }

        // 4. Deliver to handler
        if (!this.webViewHandler) {
            console.error(`${tag} ❌ STEP4 FAILED: no WebView handler`);
            return;
        }

        console.log(`${tag} ✅ STEP4: delivering to WebView | source: ${source}`);
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
        this.linkingSubscription?.remove();
        this.linkingSubscription = null;
        this.webViewHandler = null;
        this.isInitialized = false;
        this.coldStartResolve?.();
        this.coldStartResolve = null;
        this.coldStartPromise = null;
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
