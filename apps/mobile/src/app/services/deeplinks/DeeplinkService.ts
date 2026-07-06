import { Linking } from 'react-native';
import Config from 'react-native-config';

import type { DeepLinkManager } from './DeepLinkManager';
import { resolveDeepLink, resolvePushTapPath, type DeepLinkResolution, type PushNavigationData } from './deeplinkUtils';
import type { ILogService } from '../log';

/**
 * IDeeplinkService
 *
 * Interface for deep link coordination in the mobile app.
 */
export interface IDeeplinkService {
    getInitialUrl(): Promise<string | null>;
    subscribe(listener: (url: string) => void): () => void;
    waitForColdStart(): Promise<void>;
    handleUrl(url: string): Promise<void>;
    resolveInbound(url: string): DeepLinkResolution;
    resolvePushTap(data: PushNavigationData | null | undefined): string | null;
}

/**
 * DeeplinkService
 *
 * Central coordinator for deep link routing, capturing, and verification.
 * Serves as the delegation target for React Navigation's linking config.
 */
export class DeeplinkService implements IDeeplinkService {
    private readonly scheme: string;

    constructor(
        private readonly manager: DeepLinkManager,
        private readonly logger: ILogService
    ) {
        this.scheme = Config.VITE_ENV === 'DEV' ? 'chatic-dev' : 'chatic';
    }

    /**
     * Resolves the initial deep link URL.
     */
    async getInitialUrl(): Promise<string | null> {
        this.logger.info('DEEPLINK', '[DeeplinkService] getInitialUrl requested');
        return this.manager.getInitialUrl();
    }

    /**
     * Subscribes to deep link URL events.
     */
    subscribe(listener: (url: string) => void): () => void {
        this.logger.info('DEEPLINK', '[DeeplinkService] Subscribed to deep link events');
        return this.manager.subscribe(listener);
    }

    /**
     * Waits for cold start deep link capture to settle.
     */
    async waitForColdStart(): Promise<void> {
        return this.manager.waitForColdStart();
    }

    /**
     * Normalized entry point to trigger deep link routing from anywhere in the app
     * (e.g. FCM push notification banner clicks, local buttons).
     *
     * Prepends the app's custom scheme if relative paths are provided.
     */
    async handleUrl(url: string): Promise<void> {
        if (!url || url.trim().length === 0) {
            this.logger.warn('DEEPLINK', '[DeeplinkService] handleUrl received empty URL');
            return;
        }

        let targetUrl = url.trim();
        this.logger.info('DEEPLINK', `[DeeplinkService] Processing URL: ${targetUrl}`);

        // If URL is a relative path, normalize it to custom scheme (e.g. /chats/ch_1 -> chatic://chats/ch_1)
        if (targetUrl.startsWith('/')) {
            targetUrl = `${this.scheme}://${targetUrl.slice(1)}`;
            this.logger.info(
                'DEEPLINK',
                `[DeeplinkService] Normalized relative path to custom scheme URL: ${targetUrl}`
            );
        }

        try {
            const supported = await Linking.canOpenURL(targetUrl);
            if (supported) {
                await Linking.openURL(targetUrl);
            } else {
                this.logger.error('DEEPLINK', `[DeeplinkService] URL scheme is not supported: ${targetUrl}`);
            }
        } catch (error) {
            this.logger.error('DEEPLINK', `[DeeplinkService] Failed to open URL: ${targetUrl}`, error);
        }
    }

    /**
     * Resolves an inbound deep link (OS universal link / custom scheme / invite link) into a routing
     * decision. The coordinator applies `web` results via an OnNavigate bridge event and `native`
     * results imperatively through navigationRef; `invalid` surfaces the deep link error screen.
     */
    resolveInbound(url: string): DeepLinkResolution {
        return resolveDeepLink(url, this.logger);
    }

    /**
     * Resolves a push notification tap payload into a WEBVIEW_URL-relative path (cid/sid merged from
     * the payload), or null when the payload carries no link. Shares the deep link OnNavigate contract.
     */
    resolvePushTap(data: PushNavigationData | null | undefined): string | null {
        return resolvePushTapPath(data);
    }
}
