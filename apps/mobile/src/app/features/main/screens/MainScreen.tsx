import React, { useMemo, useRef } from 'react';
import type { WebView } from 'react-native-webview';
import { Image, StyleSheet, useColorScheme, View } from 'react-native';

import { useWebViewDeepLink } from '../../../webview/hooks/useWebViewDeepLink';
import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView } from '../../core/components';
import type { MainScreenProps } from '../navigation';
import type { ModalHandler } from '../../../webview/hooks/useModalHandler';
import { useAppBridge } from '../../../webview/hooks';
import { useThemeStore } from '../../../stores';

export const MainScreen = ({ navigation, route }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge, onMessage } = useAppBridge(webViewRef);
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(s => s.theme);
    const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');

    const { setWebCanGoBack, setNavCanGoBack } = useWebViewNavigation(bridge);
    const { source, handleWebViewLoad, deepLinkError, deepLinkErrorReason, handleDismissError } = useWebViewDeepLink(
        webViewRef,
        route
    );

    const modalHandler: ModalHandler = useMemo(
        () => ({
            openModal: ({ url, type, heightRatio, dragHandle }) => {
                navigation.navigate('Modal', { url, type, heightRatio, dragHandle });
            },
            closeModal: () => {
                if (navigation.canGoBack()) {
                    navigation.goBack();
                }
            },
            canGoBack: () => navigation.canGoBack(),
        }),
        [navigation]
    );

    if (!source) {
        return (
            <View style={[loadingStyles.container, { backgroundColor: isDark ? '#121212' : '#ffffff' }]}>
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
        <View style={{ flex: 1, backgroundColor: isDark ? '#121212' : '#ffffff' }}>
            <AppWebView
                ref={webViewRef}
                source={source}
                bridge={bridge}
                onMessage={onMessage}
                scrollEnabled={false}
                onLoad={handleWebViewLoad}
                onNavigationStateChange={navState => {
                    setNavCanGoBack(navState.canGoBack);
                }}
                modalHandler={modalHandler}
                setWebCanGoBack={setWebCanGoBack}
            />
        </View>
    );
};

const loadingStyles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 96,
        height: 96,
    },
});
