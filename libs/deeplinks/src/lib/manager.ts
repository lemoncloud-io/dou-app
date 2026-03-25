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
import { isValidDeepLink } from './parser';
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
        this.handleDeferredLinks();
    }

    /**
     * Setup listeners for immediate deep links
     */
    private setupImmediateDeepLinks(): void {
        // Get initial URL (cold start)
        Linking.getInitialURL()
            .then(url => {
                if (url) {
                    console.log('[DeepLinkManager] Cold start URL:', url);
                    this.handleDeepLink(url, 'cold_start');
                }
            })
            .catch(err => console.error('[DeepLinkManager] Error getting initial URL:', err));

        // Listen for URL events (app already running - warm start)
        this.linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            console.log('[DeepLinkManager] Warm start URL:', url);
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

        // 3. Expand short URL (/s/xxx) after domain conversion
        try {
            const result = await convertShortUrlWithEnvs(processedUrl);
            processedUrl = result.url;
            envs = result.envs;
        } catch (error) {
            console.error('[DeepLinkManager] Error expanding short URL:', error);
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
        this.linkingSubscription?.remove();
        this.linkingSubscription = null;
        this.webViewHandler = null;
        this.isInitialized = false;
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
