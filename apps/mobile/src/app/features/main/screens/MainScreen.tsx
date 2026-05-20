import React, { useRef } from 'react';

import { useAppBridge, useVersionCheckHandler } from '../../../webview/hooks';
import type { WebView } from 'react-native-webview';
import type { MainScreenProps } from '../navigation';
import { useColorScheme, View } from 'react-native';

import { useWebViewDeepLink } from '../../../webview/hooks/useWebViewDeepLink';
import { useWebMessageRouter } from '../hooks/useWebMessageRouter';
import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView, FullScreenLoader } from '../../core/components';
import { useThemeStore } from '../../../stores';
import { t } from '../../../utils';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge } = useAppBridge(webViewRef);
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(s => s.theme);
    const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    const { setWebCanGoBack, setNavCanGoBack } = useWebViewNavigation(webViewRef);
    const { initialSource, handleWebViewLoad, deepLinkError, deepLinkErrorReason, handleDismissError } =
        useWebViewDeepLink(webViewRef);

    useVersionCheckHandler(bridge);

    const { handleMessage, isIapLoading } = useWebMessageRouter({
        bridge,
        navigation,
        setWebCanGoBack: setWebCanGoBack,
    });

    if (deepLinkError) {
        return <DeepLinkErrorView onGoHome={handleDismissError} reason={deepLinkErrorReason} />;
    }

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#ffffff' }}>
            <AppWebView
                ref={webViewRef}
                source={initialSource}
                scrollEnabled={false}
                onMessage={handleMessage}
                onLoad={handleWebViewLoad}
                onNavigationStateChange={navState => {
                    setNavCanGoBack(navState.canGoBack);
                }}
            />
            <FullScreenLoader visible={isIapLoading} message={t('loader.paymentProcessing')} />
        </View>
    );
};
