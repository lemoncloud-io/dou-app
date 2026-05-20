import { useCallback, useEffect, useState } from 'react';
import type { WebView } from 'react-native-webview';

import { getDeepLinkManager } from '@chatic/deeplinks';

import { WEBVIEW_URL } from '../utils/constants';
import { useDeepLinkStore } from '../../stores';
import { logger } from '../../services';

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

const buildTargetUrl = (
    url: string,
    envs?: { backend?: string; wss?: string } | null,
    site?: { id?: string; name?: string } | null,
    cloud?: { id?: string; name?: string } | null
): string => {
    let targetUrl = toLocalUrl(url);
    if (envs?.backend || envs?.wss) {
        const urlObj = new URL(targetUrl);
        if (envs.backend) urlObj.searchParams.set('_backend', envs.backend);
        if (envs.wss) urlObj.searchParams.set('_wss', envs.wss);
        targetUrl = urlObj.toString();
    }
    if (site?.id || site?.name) {
        const urlObj = new URL(targetUrl);
        if (site.id) urlObj.searchParams.set('_siteId', site.id);
        if (site.name) urlObj.searchParams.set('_siteName', site.name);
        targetUrl = urlObj.toString();
    }
    if (cloud?.id || cloud?.name) {
        const urlObj = new URL(targetUrl);
        if (cloud.id) urlObj.searchParams.set('_cloudId', cloud.id);
        if (cloud.name) urlObj.searchParams.set('_cloudName', cloud.name);
        targetUrl = urlObj.toString();
    }
    return targetUrl;
};

export const useWebViewDeepLink = (webViewRef: React.RefObject<WebView | null>) => {
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    // WebView는 기본 URL로 즉시 로드를 시작 — cold start 딥링크 해결을 기다리지 않음
    // 딥링크가 발견되면 source 변경으로 WebView가 해당 URL로 내비게이션
    const [initialSource, setInitialSource] = useState<{ uri: string }>({ uri: WEBVIEW_URL });
    const {
        pendingUrl,
        pendingEnvs,
        pendingSite,
        pendingCloud,
        source,
        deepLinkError,
        deepLinkErrorReason,
        clearPendingUrl,
        setWebViewReady,
        setDeepLinkError,
    } = useDeepLinkStore();

    // Cold start 딥링크 해결 — 백그라운드에서 실행, WebView 로드를 차단하지 않음.
    // 딥링크가 발견되면 source 변경으로 WebView가 즉시 해당 URL로 내비게이션.
    // iOS Release 빌드에서 addEventListener로 늦게 도착하는 Universal Link도 처리.
    useEffect(() => {
        const manager = getDeepLinkManager();
        manager
            .waitForColdStart()
            .then(() => {
                const state = useDeepLinkStore.getState();
                if (state.deepLinkError) return;
                if (state.pendingUrl) {
                    const targetUrl = buildTargetUrl(
                        state.pendingUrl,
                        state.pendingEnvs,
                        state.pendingSite,
                        state.pendingCloud
                    );
                    logger.info('DEEPLINK', `Cold start URL, updating source (source: ${state.source}): ${targetUrl}`);
                    setInitialSource({ uri: targetUrl });
                    state.clearPendingUrl();
                }
            })
            .catch(err => {
                logger.error('DEEPLINK', `Cold start wait failed: ${err}`);
            });
    }, []);

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
        const targetUrl = buildTargetUrl(pendingUrl, pendingEnvs, pendingSite, pendingCloud);
        // Add timestamp to prevent WebView from ignoring navigation to the same URL
        const urlWithCacheBust = new URL(targetUrl);
        urlWithCacheBust.searchParams.set('_t', Date.now().toString());
        const finalUrl = urlWithCacheBust.toString().replace(/'/g, '%27');
        const script = `window.location.href = '${finalUrl}';\ntrue;`;
        webViewRef.current.injectJavaScript(script);
        clearPendingUrl();
    }, [pendingUrl, pendingEnvs, pendingSite, pendingCloud, source, isWebViewLoaded, clearPendingUrl, webViewRef]);

    const handleDismissError = useCallback(() => {
        setDeepLinkError(false);
    }, [setDeepLinkError]);

    return {
        initialSource,
        handleWebViewLoad,
        isWebViewLoaded,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    };
};
