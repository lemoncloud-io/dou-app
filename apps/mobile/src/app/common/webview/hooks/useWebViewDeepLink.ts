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

    // Wait for cold start deep link resolution before allowing WebView to load
    useEffect(() => {
        const manager = getDeepLinkManager();
        manager.waitForColdStart().then(() => {
            const state = useDeepLinkStore.getState();
            // If error occurred during cold start, don't set source — let MainScreen show error
            if (state.deepLinkError) {
                setIsColdStartReady(true);
                return;
            }
            if (state.pendingUrl && state.source === 'cold_start') {
                const targetUrl = buildTargetUrl(state.pendingUrl, state.pendingEnvs);
                coldStartUrlRef.current = targetUrl;
                logger.info('DEEPLINK', `Cold start URL captured for initial source: ${targetUrl}`);
                state.clearPendingUrl();
            }
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
        logger.info(
            'DEEPLINK',
            `🔍 Effect triggered | pendingUrl: ${pendingUrl ?? 'null'} | loaded: ${isWebViewLoaded} | hasRef: ${!!webViewRef.current} | source: ${source ?? 'null'}`
        );

        if (!pendingUrl || !isWebViewLoaded || !webViewRef.current) {
            if (pendingUrl) {
                logger.info(
                    'DEEPLINK',
                    `⚠️ URL pending but blocked: loaded=${isWebViewLoaded}, hasRef=${!!webViewRef.current}`
                );
            }
            return;
        }
        if (source === 'cold_start') {
            clearPendingUrl();
            return;
        }

        const targetUrl = buildTargetUrl(pendingUrl, pendingEnvs);
        // Add timestamp to prevent WebView from ignoring navigation to the same URL
        const urlWithCacheBust = new URL(targetUrl);
        urlWithCacheBust.searchParams.set('_t', Date.now().toString());
        const finalUrl = urlWithCacheBust.toString().replace(/'/g, '%27');
        const script = `window.location.href = '${finalUrl}';\ntrue;`;
        logger.info('DEEPLINK', `✅ Injecting JS into WebView: ${finalUrl}`);
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
