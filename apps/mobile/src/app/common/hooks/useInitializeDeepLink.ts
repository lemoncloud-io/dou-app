import { useEffect } from 'react';
import type { DeepLinkSource, ServiceEndpoints } from '@chatic/deeplinks';
import { getDeepLinkManager } from '@chatic/deeplinks';
import { useDeepLinkStore } from '../stores';
import { logger } from '../services';

/**
 * Hook that initializes and manages deep link reception globally across the app.
 * It detects when the app is opened via a deep link or when a deep link is received in the foreground.
 * It stores the received information in the global state (useDeepLinkStore),
 * so that the component responsible for actual routing or webview processing can consume it.
 */
export const useInitializeDeepLink = () => {
    useEffect(() => {
        const manager = getDeepLinkManager();

        // Register callback and initialize listener to be executed upon receiving a deep link
        manager.initialize({
            handleDeepLink: (url: string, source: DeepLinkSource, envs?: ServiceEndpoints) => {
                logger.info('DEEPLINK', `[App] Deep link received: url, 'source:', source, 'envs:', envs`);
                useDeepLinkStore.getState().setPendingUrl(url, source, envs);
            },
            handleError: (reason: string) => {
                logger.error('DEEPLINK', `[App] Deep link processing failed: ${reason}`);
                useDeepLinkStore.getState().setDeepLinkError(true, reason);
            },
        });

        return () => {
            manager.cleanup();
        };
    }, []);
};
