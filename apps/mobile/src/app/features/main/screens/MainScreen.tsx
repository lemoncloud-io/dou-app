import React, { useRef } from 'react';

import { AppWebView, FullScreenLoader, t } from '../../../common';
import { useAppBridge } from '../../../common/webview/hooks';
import type { WebView } from 'react-native-webview';
import type { MainScreenProps } from '../navigation';
import { View } from 'react-native';

import { useWebViewDeepLink } from '../../../common/webview/hooks/useWebViewDeepLink';
import { useWebMessageRouter } from '../hooks/useWebMessageRouter';
import { useWebViewNavigation } from '../../../common/webview/hooks/useWebViewNavigation';
import { WEBVIEW_URL } from '../../../common/webview/utils/constants';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge } = useAppBridge(webViewRef);

    const { setWebCanGoBack, setNavCanGoBack } = useWebViewNavigation(webViewRef);
    const { handleWebViewLoad } = useWebViewDeepLink(webViewRef);

    const { handleMessage, isIapLoading } = useWebMessageRouter({
        bridge,
        navigation,
        setWebCanGoBack: setWebCanGoBack,
    });

    return (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            <AppWebView
                ref={webViewRef}
                source={{ uri: WEBVIEW_URL }}
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
