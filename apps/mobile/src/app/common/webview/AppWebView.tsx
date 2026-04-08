import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAppLanguage, getUserAgent } from '../utils';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { getConsoleOverrideScript, getDeviceInfoScript, getSafeAreaScript } from './utils/injectionScripts';
import { firebaseInstallationService } from '../services/firebase/firebaseInstallationService';

interface AppWebViewProps extends WebViewProps {}

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const [initData, setInitData] = useState<{ userAgent: string; script: string } | null>(null);
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);

    // 최초 1회: deviceInfo 주입 (비동기 초기화)
    useEffect(() => {
        const prepareWebView = async () => {
            const [userAgent, uniqueId, installationId] = await Promise.all([
                getUserAgent(),
                DeviceInfo.getUniqueId(),
                firebaseInstallationService.getFirebaseId(),
            ]);

            const deviceInfoScript = getDeviceInfoScript({
                platform: Platform.OS.toLowerCase(),
                applicationName: DeviceInfo.getApplicationName(),
                stage: Config.VITE_ENV || 'PROD',
                uniqueId: uniqueId || '',
                deviceModel: DeviceInfo.getDeviceId() || '',
                appVersion: DeviceInfo.getVersion(),
                buildNumber: DeviceInfo.getBuildNumber(),
                appLanguage: getAppLanguage(),
                installationId: installationId || '',
            });

            const injectionScript = `
                ${getSafeAreaScript(insets, keyboardHeight)}
                ${deviceInfoScript}
                ${getConsoleOverrideScript()}
            `;

            setInitData({ userAgent, script: injectionScript });
        };
        void prepareWebView();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // insets 변경 시 명령형으로 재주입
    useEffect(() => {
        if (!webViewRef.current || !initData) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(insets, keyboardHeight));
    }, [insets, keyboardHeight, initData]);

    // 깔끔한 다중 Ref 동기화
    const setRefs = useCallback(
        (node: WebView | null) => {
            webViewRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
        },
        [ref]
    );

    if (!initData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#888" />
            </View>
        );
    }

    return (
        <WebView
            ref={setRefs}
            style={{ backgroundColor: '#ffffff' }}
            startInLoadingState={true}
            showsVerticalScrollIndicator={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsBackForwardNavigationGestures={true}
            userAgent={initData.userAgent}
            injectedJavaScript={initData.script}
            injectedJavaScriptBeforeContentLoaded={initData.script}
            hideKeyboardAccessoryView={true}
            forceDarkOn={false}
            originWhitelist={['*']}
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            mixedContentMode="always"
            {...props}
        />
    );
});

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});
