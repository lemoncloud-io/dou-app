import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { WEBVIEW_URL } from '../utils/constants';
import { logger } from '../../services';
import type { MainStackParamList } from '../../features/core/navigation/type';

const webviewBaseUrl = new URL(WEBVIEW_URL);
export const toLocalUrl = (url: string): string => {
    try {
        if (url.startsWith('/')) {
            const baseUrl = WEBVIEW_URL.endsWith('/') ? WEBVIEW_URL.slice(0, -1) : WEBVIEW_URL;
            return `${baseUrl}${url}`;
        }

        let normalized = url.trim();
        if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(normalized)) {
            normalized = `https://${normalized}`;
        }

        if (normalized.startsWith('chatic://')) {
            normalized = normalized.replace('chatic://', 'https://app.chatic.io/');
        } else if (normalized.startsWith('chatic-dev://')) {
            normalized = normalized.replace('chatic-dev://', 'https://app-dev.chatic.io/');
        }

        const parsed = new URL(normalized);
        const baseUrl = WEBVIEW_URL.endsWith('/') ? WEBVIEW_URL.slice(0, -1) : WEBVIEW_URL;

        let pathname = parsed.pathname;
        if (!pathname.startsWith('/')) {
            pathname = `/${pathname}`;
        }

        return `${baseUrl}${pathname}${parsed.search}${parsed.hash}`;
    } catch (e) {
        logger.error('DEEPLINK', `toLocalUrl failed for: ${url}`, e);
        try {
            const schemeMatch = url.match(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\/(.*)/);
            const pathAndQuery = schemeMatch ? schemeMatch[1] : url;
            const cleanPath = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
            const baseUrl = WEBVIEW_URL.endsWith('/') ? WEBVIEW_URL.slice(0, -1) : WEBVIEW_URL;
            return `${baseUrl}${cleanPath}`;
        } catch {
            return WEBVIEW_URL;
        }
    }
};

export const useWebViewDeepLink = (
    webViewRef: React.RefObject<WebView | null>,
    route: RouteProp<MainStackParamList, 'Main'>
) => {
    const navigation = useNavigation<NavigationProp<MainStackParamList>>();
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);

    const initialUrlParam = route.params?.url;
    const initialError = route.params?.error;
    const hasHandledInitialUrl = useRef(false);

    // WebView source setup
    const [source, setSource] = useState<{ uri: string }>(() => {
        if (initialError) {
            return { uri: WEBVIEW_URL };
        }
        if (initialUrlParam) {
            const targetUrl = toLocalUrl(initialUrlParam);
            logger.info('DEEPLINK', `Cold start deep link configured on mount: ${targetUrl}`);
            hasHandledInitialUrl.current = true;
            return { uri: targetUrl };
        }
        return { uri: WEBVIEW_URL };
    });

    const [deepLinkError, setDeepLinkError] = useState(!!initialError);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(initialError || null);

    const handleWebViewLoad = useCallback(() => {
        logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);
    }, []);

    // Handle warm start deep links via route.params updates
    useEffect(() => {
        logger.info(
            'DEEPLINK',
            `Warm-start useEffect triggered. params: ${JSON.stringify(route.params)}, isWebViewLoaded: ${isWebViewLoaded}`
        );
        if (!route.params) return;

        const { url, error } = route.params;

        if (error) {
            logger.error('DEEPLINK', `Deep link error received in route params: ${error}`);
            setDeepLinkError(true);
            setDeepLinkErrorReason(error);

            // Clear params to prevent reprocessing
            navigation.setParams({ url: undefined, error: undefined });
            return;
        }

        if (!url) return;

        // If this is the initial URL param and we already handled it on mount,
        // we just clear the param to prevent reprocessing.
        if (url === initialUrlParam && hasHandledInitialUrl.current) {
            logger.info('DEEPLINK', `Cold-start deep link already loaded as initial source: ${url}`);
            hasHandledInitialUrl.current = false;
            navigation.setParams({ url: undefined, error: undefined });
            return;
        }

        // If the webview is already loaded and we receive a new URL in route params,
        // update the source state to trigger navigation natively.
        if (isWebViewLoaded) {
            const targetUrl = toLocalUrl(url);
            const separator = targetUrl.includes('?') ? '&' : '?';
            const finalUrl = `${targetUrl}${separator}_t=${Date.now()}`;

            logger.info('DEEPLINK', `Updating WebView source for warm-start: ${finalUrl}`);
            setSource({ uri: finalUrl });

            // Clear params to prevent reprocessing
            navigation.setParams({ url: undefined, error: undefined });
        } else {
            logger.warn('DEEPLINK', `Warm-start injection skipped: isWebViewLoaded=${isWebViewLoaded}`);
        }
    }, [route.params, isWebViewLoaded, navigation, initialUrlParam]);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
        navigation.setParams({ url: undefined, error: undefined });
    }, [navigation]);

    return {
        source,
        handleWebViewLoad,
        isWebViewLoaded,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    };
};
