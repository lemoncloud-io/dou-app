import { Linking } from 'react-native';

import type { DeepLinkManager } from './DeepLinkManager';
import {
    getAppScheme,
    resolveDeepLink,
    resolvePushTapPath,
    type DeepLinkResolution,
    type PushNavigationData,
} from './deeplinkUtils';
import type { Logger } from '@chatic/logger';

export interface IDeeplinkService {
    getInitialUrl(): Promise<string | null>;
    subscribe(listener: (url: string) => void): () => void;
    waitForColdStart(): Promise<void>;
    handleUrl(url: string): Promise<void>;
    resolveInbound(url: string): DeepLinkResolution;
    resolvePushTap(data: PushNavigationData | null | undefined): string | null;
}

export class DeeplinkService implements IDeeplinkService {
    private readonly scheme: string;

    constructor(
        private readonly manager: DeepLinkManager,
        private readonly logger: Logger
    ) {
        this.scheme = getAppScheme();
    }

    async getInitialUrl(): Promise<string | null> {
        this.logger.debug('DEEPLINK', '[DeeplinkService] getInitialUrl requested');
        return this.manager.getInitialUrl();
    }

    subscribe(listener: (url: string) => void): () => void {
        this.logger.debug('DEEPLINK', '[DeeplinkService] Subscribed to deep link events');
        return this.manager.subscribe(listener);
    }

    async waitForColdStart(): Promise<void> {
        return this.manager.waitForColdStart();
    }

    async handleUrl(url: string): Promise<void> {
        if (!url || url.trim().length === 0) {
            this.logger.warn('DEEPLINK', '[DeeplinkService] handleUrl received empty URL');
            return;
        }

        let targetUrl = url.trim();
        this.logger.debug('DEEPLINK', `[DeeplinkService] Processing URL: ${targetUrl}`);

        if (targetUrl.startsWith('/')) {
            targetUrl = `${this.scheme}://${targetUrl.slice(1)}`;
            this.logger.debug(
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

    resolveInbound(url: string): DeepLinkResolution {
        return resolveDeepLink(url, this.logger);
    }

    resolvePushTap(data: PushNavigationData | null | undefined): string | null {
        return resolvePushTapPath(data);
    }
}
