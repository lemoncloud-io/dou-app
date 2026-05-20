import React, { useMemo, useRef } from 'react';
import type { WebView } from 'react-native-webview';
import { StyleSheet, View } from 'react-native';

import { useWebViewDeepLink } from '../../../webview/hooks/useWebViewDeepLink';
import { useWebViewNavigation } from '../../../webview/hooks/useWebViewNavigation';
import { AppWebView } from '../../../webview';
import { DeepLinkErrorView } from '../../core/components';
import type { MainScreenProps } from '../navigation';
import type { ModalHandler } from '../../../webview/hooks/useModalHandler';
import { useAppBridge } from '../../../webview/hooks';

export const MainScreen = ({ navigation }: MainScreenProps) => {
    const webViewRef = useRef<WebView>(null);
    const { bridge, onMessage } = useAppBridge(webViewRef);

    const { setWebCanGoBack, setNavCanGoBack } = useWebViewNavigation(bridge);
    const {
        initialSource,
        handleWebViewLoad,
        isColdStartReady,
        deepLinkError,
        deepLinkErrorReason,
        handleDismissError,
    } = useWebViewDeepLink(webViewRef);

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
        backgroundColor: '#ffffff',
    },
    logo: {
        width: 80,
        height: 80,
    },
});
