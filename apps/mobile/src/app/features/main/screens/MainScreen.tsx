import React, { useRef } from 'react';

import { useAppBridge, useVersionCheckHandler } from '../../../webview/hooks';
import type { WebView } from 'react-native-webview';
import type { MainScreenProps } from '../navigation';
import { StyleSheet, View } from 'react-native';

import { useWebViewDeepLink } from '../../../webview/hooks/useWebViewDeepLink';
import { useWebMessageRouter } from '../hooks/useWebMessageRouter';
import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView, FullScreenLoader } from '../../core/components';
import { t } from '../../../utils';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge, onMessage } = useAppBridge(webViewRef);

    const { setWebCanGoBack, setNavCanGoBack } = useWebViewNavigation(webViewRef);
    const {
        initialSource,
        handleWebViewLoad,
        isColdStartReady,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    } = useWebViewDeepLink(webViewRef);

    useVersionCheckHandler(bridge);

    const { isIapLoading } = useWebMessageRouter({
        bridge,
        navigation,
        setWebCanGoBack: setWebCanGoBack,
    });

    if (!isColdStartReady || !initialSource) {
        return <View style={loadingStyles.container}></View>;
    }

    if (deepLinkError) {
        return <DeepLinkErrorView onGoHome={handleDismissError} reason={deepLinkErrorReason} />;
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
            <AppWebView
                ref={webViewRef}
                source={initialSource}
                scrollEnabled={false}
                onMessage={onMessage}
                onLoad={handleWebViewLoad}
                onNavigationStateChange={navState => {
                    setNavCanGoBack(navState.canGoBack);
                }}
            />
            <FullScreenLoader visible={isIapLoading} message={t('loader.paymentProcessing')} />
        </View>
    );
};

const loadingStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#ffffff',
    },
    logo: {
        width: 80,
        height: 80,
    },
});
