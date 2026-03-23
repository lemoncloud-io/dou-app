import { useCallback, useEffect, useState } from 'react';
import type { WebView } from 'react-native-webview';

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

export const useWebViewDeepLink = (webViewRef: React.RefObject<WebView | null>) => {
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const { pendingUrl, pendingEnvs, clearPendingUrl, setWebViewReady } = useDeepLinkStore();

    // WebView 로드 완료 핸들러
    const handleWebViewLoad = useCallback(() => {
        logger.info('WEBVIEW', 'WebView loaded');
        setIsWebViewLoaded(true);
        setWebViewReady(true);
    }, [setWebViewReady]);

    useEffect(() => {
        if (pendingUrl && isWebViewLoaded && webViewRef.current) {
            logger.info('DEEPLINK', `Loading deep link URL: ${pendingUrl}`, pendingEnvs);

            let targetUrl = toLocalUrl(pendingUrl);
            if (pendingEnvs?.backend || pendingEnvs?.wss) {
                const urlObj = new URL(targetUrl);
                if (pendingEnvs?.backend) urlObj.searchParams.set('_backend', pendingEnvs.backend);
                if (pendingEnvs?.wss) urlObj.searchParams.set('_wss', pendingEnvs.wss);
                targetUrl = urlObj.toString();
            }
            const script = `window.location.href = '${targetUrl.replace(/'/g, '%27')}';\ntrue;`;

            webViewRef.current.injectJavaScript(script);
            clearPendingUrl();
        }
    }, [pendingUrl, pendingEnvs, isWebViewLoaded, clearPendingUrl, webViewRef]);

    return { handleWebViewLoad };
};
