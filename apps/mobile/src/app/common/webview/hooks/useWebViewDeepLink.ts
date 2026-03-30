import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WebView } from 'react-native-webview';

import { getDeepLinkManager } from '@chatic/deeplinks';

import { logger, useDeepLinkStore } from '../../index';
import { WEBVIEW_URL } from '../utils/constants';

const webviewBaseUrl = new URL(WEBVIEW_URL);
const toLocalUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        parsed.protocol = webviewBaseUrl.protocol;
        parsed.host = webviewBaseUrl.host;
        return parsed.toString();
    } catch {
        return url;
    }
};

const buildTargetUrl = (url: string, envs?: { backend?: string; wss?: string } | null): string => {
    let targetUrl = toLocalUrl(url);
    if (envs?.backend || envs?.wss) {
        const urlObj = new URL(targetUrl);
        if (envs.backend) urlObj.searchParams.set('_backend', envs.backend);
        if (envs.wss) urlObj.searchParams.set('_wss', envs.wss);
        targetUrl = urlObj.toString();
    }
    return targetUrl;
};

export const useWebViewDeepLink = (webViewRef: React.RefObject<WebView | null>) => {
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const [isColdStartReady, setIsColdStartReady] = useState(false);
    const coldStartUrlRef = useRef<string | null>(null);
    const {
        pendingUrl,
        pendingEnvs,
        source,
        deepLinkError,
        deepLinkErrorReason,
        clearPendingUrl,
        setWebViewReady,
        setDeepLinkError,
    } = useDeepLinkStore();

    // Wait for cold start deep link resolution before allowing WebView to load.
    // Accepts both 'cold_start' and 'warm_start' sources because on iOS Release builds,
    // a late-arriving Universal Link URL may be classified as 'warm_start' by the manager
    // if it arrived via addEventListener after getInitialURL returned null.
    useEffect(() => {
        const manager = getDeepLinkManager();
        manager
            .waitForColdStart()
            .then(() => {
                const state = useDeepLinkStore.getState();
                if (state.deepLinkError) {
                    setIsColdStartReady(true);
                    return;
                }
                if (state.pendingUrl) {
                    const targetUrl = buildTargetUrl(state.pendingUrl, state.pendingEnvs);
                    coldStartUrlRef.current = targetUrl;
                    logger.info('DEEPLINK', `Cold start URL captured (source: ${state.source}): ${targetUrl}`);
                    state.clearPendingUrl();
                }
                setIsColdStartReady(true);
            })
            .catch(err => {
                logger.error('DEEPLINK', `Cold start wait failed: ${err}`);
                setIsColdStartReady(true);
            });
    }, []);

    // Initial WebView source: use cold start deep link URL or default WEBVIEW_URL
    const initialSource = useMemo(() => {
        if (!isColdStartReady) return null;
        const uri = coldStartUrlRef.current ?? WEBVIEW_URL;
        logger.info('DEEPLINK', `WebView initial source: ${uri}`);
        return { uri };
    }, [isColdStartReady]);

    const handleWebViewLoad = useCallback(() => {
        logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);
        setWebViewReady(true);
    }, [setWebViewReady]);

    // Handle warm start / deferred deep links via injectJavaScript
    useEffect(() => {
        if (!pendingUrl || !isWebViewLoaded || !webViewRef.current) return;
        if (source === 'cold_start') {
            clearPendingUrl();
            return;
        }

        logger.info('DEEPLINK', `Injecting deep link URL: ${pendingUrl}`, pendingEnvs);
        const targetUrl = buildTargetUrl(pendingUrl, pendingEnvs);
        // Add timestamp to prevent WebView from ignoring navigation to the same URL
        const urlWithCacheBust = new URL(targetUrl);
        urlWithCacheBust.searchParams.set('_t', Date.now().toString());
        const finalUrl = urlWithCacheBust.toString().replace(/'/g, '%27');
        const script = `window.location.href = '${finalUrl}';\ntrue;`;
        webViewRef.current.injectJavaScript(script);
        clearPendingUrl();
    }, [pendingUrl, pendingEnvs, source, isWebViewLoaded, clearPendingUrl, webViewRef]);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
    }, [setDeepLinkError]);

    return {
        initialSource,
        handleWebViewLoad,
        isColdStartReady,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    };
};
