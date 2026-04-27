import React, { useRef } from 'react';

import { AppWebView, DeepLinkErrorView, FullScreenLoader, t } from '../../../common';
import { useAppBridge, useVersionCheckHandler } from '../../../common/webview/hooks';
import type { WebView } from 'react-native-webview';
import type { MainScreenProps } from '../navigation';
import { Image, StyleSheet, View } from 'react-native';

import { useWebViewDeepLink } from '../../../common/webview/hooks/useWebViewDeepLink';
import { useWebMessageRouter } from '../hooks/useWebMessageRouter';
import { useWebViewNavigation } from '../../../common/webview/hooks/useWebViewNavigation';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge } = useAppBridge(webViewRef);

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

    const { handleMessage, isIapLoading } = useWebMessageRouter({
        bridge,
        navigation,
        setWebCanGoBack: setWebCanGoBack,
    });

    if (!isColdStartReady || !initialSource) {
        return (
            <View style={loadingStyles.container}>
                <Image
                    source={require('../../../../assets/logo.png')}
                    style={loadingStyles.logo}
                    resizeMode="contain"
                />
            </View>
        );
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
