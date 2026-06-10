import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { WEBVIEW_URL } from '../utils/constants';
import { logger } from '../../services';
import type { MainStackParamList } from '../../features/core/navigation';

export const toLocalUrl = (url: string, webViewBaseUrl = WEBVIEW_URL): string => {
    try {
        if (url.startsWith('/')) {
            const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;
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
        const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;

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
            const baseUrl = webViewBaseUrl.endsWith('/') ? webViewBaseUrl.slice(0, -1) : webViewBaseUrl;
            return `${baseUrl}${cleanPath}`;
        } catch {
            return webViewBaseUrl;
        }
    }
};

const appendRedirectNonce = (url: string): string => {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_t=${Date.now()}`;
};

type DeepLinkRouteParams = {
    url?: string;
    error?: string;
};

type ResolvedDeepLinkRouteParams = DeepLinkRouteParams & {
    isNestedNavigatorParams: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const resolveDeepLinkRouteParams = (params: unknown): ResolvedDeepLinkRouteParams => {
    if (!isRecord(params)) {
        return { isNestedNavigatorParams: false };
    }

    const directUrl = typeof params.url === 'string' ? params.url : undefined;
    const directError = typeof params.error === 'string' ? params.error : undefined;

    if (directUrl || directError) {
        return {
            url: directUrl,
            error: directError,
            isNestedNavigatorParams: false,
        };
    }

    if (isRecord(params.params)) {
        const nestedUrl = typeof params.params.url === 'string' ? params.params.url : undefined;
        const nestedError = typeof params.params.error === 'string' ? params.params.error : undefined;

        if (nestedUrl || nestedError) {
            return {
                url: nestedUrl,
                error: nestedError,
                isNestedNavigatorParams: true,
            };
        }
    }

    return { isNestedNavigatorParams: false };
};

export const useWebViewDeepLink = (
    webViewRef: React.RefObject<WebView | null>,
    route: RouteProp<MainStackParamList, 'Main'>,
    options?: {
        webViewBaseUrl?: string;
        reloadToken?: number;
    }
) => {
    const navigation = useNavigation<NavigationProp<MainStackParamList>>();
    const webViewBaseUrl = options?.webViewBaseUrl || WEBVIEW_URL;
    const reloadToken = options?.reloadToken ?? 0;
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const resolvedRouteParams = resolveDeepLinkRouteParams(route.params);

    const initialUrlParam = resolvedRouteParams.url;
    const initialError = resolvedRouteParams.error;
    const hasHandledInitialUrl = useRef(false);
    const pendingRedirectUrlRef = useRef<string | null>(null);
    const handledRouteUrlRef = useRef<string | null>(null);
    const lastReloadTokenRef = useRef(reloadToken);

    // WebView source setup
    const [source, setSource] = useState<{ uri: string }>(() => {
        if (initialError) {
            return { uri: webViewBaseUrl };
        }
        if (initialUrlParam) {
            const targetUrl = toLocalUrl(initialUrlParam, webViewBaseUrl);
            logger.info('DEEPLINK', `Cold start deep link configured on mount: ${targetUrl}`);
            hasHandledInitialUrl.current = true;
            return { uri: targetUrl };
        }
        return { uri: webViewBaseUrl };
    });

    const [deepLinkError, setDeepLinkError] = useState(!!initialError);
    const [deepLinkErrorReason, setDeepLinkErrorReason] = useState<string | null>(initialError || null);

    const redirectWebView = useCallback(
        (url: string, reason: 'warm-start' | 'pending') => {
            const redirectScript = `
                console.log('[DEEPLINK] WebView redirect requested: ${reason}', ${JSON.stringify(url)});
                window.location.replace(${JSON.stringify(url)});
                true;
            `;

            if (webViewRef.current?.injectJavaScript) {
                logger.info('DEEPLINK', '[useWebViewDeepLink] Injecting WebView redirect script', {
                    reason,
                    url,
                });
                webViewRef.current.injectJavaScript(redirectScript);
                return;
            }

            logger.warn('DEEPLINK', '[useWebViewDeepLink] WebView ref unavailable; falling back to source update', {
                reason,
                url,
            });
            setSource({ uri: url });
        },
        [webViewRef]
    );

    const clearDeepLinkRouteParams = useCallback(
        (isNestedNavigatorParams: boolean) => {
            const nextParams = isNestedNavigatorParams
                ? { params: { url: undefined, error: undefined } }
                : { url: undefined, error: undefined };

            logger.info('DEEPLINK', '[useWebViewDeepLink] Clearing route params after URL handling', {
                isNestedNavigatorParams,
                nextParams,
            });
            navigation.setParams(nextParams as never);
        },
        [navigation]
    );

    const handleWebViewLoad = useCallback(() => {
        logger.info('WEBVIEW', 'WebView loaded');
        logger.info('DEEPLINK', '[useWebViewDeepLink] handleWebViewLoad', {
            hasPendingRedirect: !!pendingRedirectUrlRef.current,
            pendingRedirectUrl: pendingRedirectUrlRef.current,
        });
        setIsWebViewLoaded(true);

        if (pendingRedirectUrlRef.current) {
            const pendingUrl = pendingRedirectUrlRef.current;
            pendingRedirectUrlRef.current = null;
            redirectWebView(pendingUrl, 'pending');
        }
    }, [redirectWebView]);

    useEffect(() => {
        if (reloadToken === lastReloadTokenRef.current) return;

        lastReloadTokenRef.current = reloadToken;
        setIsWebViewLoaded(false);
        hasHandledInitialUrl.current = false;
        pendingRedirectUrlRef.current = null;
        handledRouteUrlRef.current = null;
        setSource({ uri: webViewBaseUrl });
        logger.info('WEBVIEW', 'WebView source reset by debug settings', { webViewBaseUrl, reloadToken });
    }, [reloadToken, webViewBaseUrl]);

    // Handle warm start deep links via route.params updates
    useEffect(() => {
        logger.info('DEEPLINK', '[useWebViewDeepLink] Route params effect triggered', {
            params: route.params,
            resolvedParams: resolvedRouteParams,
            isWebViewLoaded,
            currentSource: source.uri,
            hasPendingRedirect: !!pendingRedirectUrlRef.current,
            handledRouteUrl: handledRouteUrlRef.current,
        });
        if (!route.params) return;

        const { url, error, isNestedNavigatorParams } = resolvedRouteParams;

        if (error) {
            logger.error('DEEPLINK', `Deep link error received in route params: ${error}`);
            setDeepLinkError(true);
            setDeepLinkErrorReason(error);

            // Clear params to prevent reprocessing
            clearDeepLinkRouteParams(isNestedNavigatorParams);
            return;
        }

        if (!url) {
            handledRouteUrlRef.current = null;
            return;
        }

        // If this is the initial URL param and we already handled it on mount,
        // we just clear the param to prevent reprocessing.
        if (url === initialUrlParam && hasHandledInitialUrl.current) {
            logger.info('DEEPLINK', `Cold-start deep link already loaded as initial source: ${url}`);
            hasHandledInitialUrl.current = false;
            handledRouteUrlRef.current = url;
            clearDeepLinkRouteParams(isNestedNavigatorParams);
            return;
        }

        if (url === handledRouteUrlRef.current) {
            logger.info('DEEPLINK', '[useWebViewDeepLink] Warm-start URL already handled for current route params', {
                url,
            });
            return;
        }
        handledRouteUrlRef.current = url;

        const targetUrl = appendRedirectNonce(toLocalUrl(url, webViewBaseUrl));
        logger.info('DEEPLINK', '[useWebViewDeepLink] Warm-start URL converted for WebView', {
            rawUrl: url,
            targetUrl,
            isWebViewLoaded,
            hasWebViewRef: !!webViewRef.current,
            isNestedNavigatorParams,
        });

        if (isWebViewLoaded) {
            redirectWebView(targetUrl, 'warm-start');
        } else {
            logger.info('DEEPLINK', '[useWebViewDeepLink] WebView is not loaded yet; queued warm-start URL', {
                targetUrl,
            });
            pendingRedirectUrlRef.current = targetUrl;
        }

        // Clear params to prevent reprocessing. Pending URL is kept in pendingRedirectUrlRef.
        clearDeepLinkRouteParams(isNestedNavigatorParams);
    }, [
        route.params,
        resolvedRouteParams,
        isWebViewLoaded,
        initialUrlParam,
        redirectWebView,
        clearDeepLinkRouteParams,
        source.uri,
        webViewBaseUrl,
        webViewRef,
    ]);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
        setDeepLinkErrorReason(null);
        clearDeepLinkRouteParams(resolvedRouteParams.isNestedNavigatorParams);
    }, [clearDeepLinkRouteParams, resolvedRouteParams.isNestedNavigatorParams]);

    return {
        source,
        handleWebViewLoad,
        isWebViewLoaded,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    };
};
