import React, { forwardRef, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';

import { getAppLanguage, getUserAgent } from '../utils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AppWebViewProps extends WebViewProps {}

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const [initData, setInitData] = useState<{ userAgent: string; script: string } | null>(null);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        /**
         * 웹 스크립트 주입을 통해 디바이스 정보 저장
         */
        const prepareWebView = async () => {
            const [userAgent, uniqueId] = await Promise.all([getUserAgent(), DeviceInfo.getUniqueId()]);

            const appVersion = DeviceInfo.getVersion();
            const buildNumber = DeviceInfo.getBuildNumber();
            const deviceModel = DeviceInfo.getDeviceId();
            const applicationName = DeviceInfo.getApplicationName();
            const appLanguage = getAppLanguage();
            const platform = Platform.OS === 'ios' ? 'iOS' : 'Android';
            const stage = Config.VITE_ENV || 'PROD';

            const safeAreaScript = `
                const root = document.documentElement;
                root.style.setProperty('--safe-top', '${insets.top}px');
                root.style.setProperty('--safe-bottom', '${insets.bottom}px');
                root.style.setProperty('--safe-left', '${insets.left}px');
                root.style.setProperty('--safe-right', '${insets.right}px');
            `;

            const deviceInfoScript = `
                window.CHATIC_APP_PLATFORM = '${platform}';
                window.CHATIC_APP_APPLICATION = '${applicationName}';
                window.CHATIC_APP_STAGE = '${stage}';
                window.CHATIC_APP_DEVICE_ID = '${uniqueId || ''}';
                window.CHATIC_APP_DEVICE_MODEL = '${deviceModel || ''}';
                window.CHATIC_APP_CURRENT_VERSION = '${appVersion}';
                window.CHATIC_APP_BUILD_NUMBER = '${buildNumber}';
                window.CHATIC_APP_CURRENT_LANGUAGE = '${appLanguage}';
            `;

            const injectionScript = `
                (function() {
                    ${safeAreaScript}
                    ${deviceInfoScript}
                })();
                true;
            `;

            setInitData({
                userAgent: userAgent,
                script: injectionScript,
            });
        };
        void prepareWebView();
    }, [insets]);

    if (!initData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#888" />
            </View>
        );
    }

    return (
        <WebView
            ref={ref}
            startInLoadingState={true}
            showsVerticalScrollIndicator={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsBackForwardNavigationGestures={true}
            userAgent={initData.userAgent}
            injectedJavaScriptBeforeContentLoaded={initData.script}
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
