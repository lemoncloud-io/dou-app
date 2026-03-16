import React, { forwardRef, useEffect, useRef, useState } from 'react';
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
    const webViewRef = useRef<WebView | null>(null);

    // 최초 1회: deviceInfo + 초기 safeArea 주입
    useEffect(() => {
        const prepareWebView = async () => {
            const [userAgent, uniqueId] = await Promise.all([getUserAgent(), DeviceInfo.getUniqueId()]);

            const appVersion = DeviceInfo.getVersion();
            const buildNumber = DeviceInfo.getBuildNumber();
            const deviceModel = DeviceInfo.getDeviceId();
            const applicationName = DeviceInfo.getApplicationName();
            const appLanguage = getAppLanguage();
            const platform = Platform.OS.toLowerCase();
            const stage = Config.VITE_ENV || 'PROD';

            // Android WebView already handles navigation bar, so no additional bottom padding needed
            const safeBottom = Platform.OS === 'android' ? 0 : insets.bottom;

            const deviceInfoScript = `
                window.CHATIC_APP_PLATFORM = '${platform}';
                window.CHATIC_APP_APPLICATION = '${applicationName}';
                window.CHATIC_APP_STAGE = '${stage}';
                window.CHATIC_APP_DEVICE_ID = '${uniqueId || ''}';
                window.CHATIC_APP_DEVICE_MODEL = '${deviceModel || ''}';
                window.CHATIC_APP_CURRENT_VERSION = '${appVersion}';
                window.CHATIC_APP_BUILD_NUMBER = '${buildNumber}';
                window.CHATIC_APP_CURRENT_LANGUAGE = '${appLanguage}';

                const bridge = {
                    postMessage: function(msg) {
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(msg);
                        }
                    }
                };

                window.ChaticMessageHandler = bridge;
                if (window.webkit && window.webkit.messageHandlers) {
                    window.webkit.messageHandlers.ChaticMessageHandler = bridge;
                }
            `;

            const injectionScript = `
                (function() {
                    const root = document.documentElement;
                    root.style.setProperty('--safe-top', '${insets.top}px');
                    root.style.setProperty('--safe-bottom', '${safeBottom}px');
                    root.style.setProperty('--safe-left', '${insets.left}px');
                    root.style.setProperty('--safe-right', '${insets.right}px');
                    ${deviceInfoScript}
                    const _origLog = console.log.bind(console);
                    const _origError = console.error.bind(console);
                    console.log = (...args) => {
                        _origLog(...args);
                        try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: '__console__', level: 'log', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') })); } catch(e) {}
                    };
                    console.error = (...args) => {
                        _origError(...args);
                        try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: '__console__', level: 'error', msg: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') })); } catch(e) {}
                    };
                })();
                true;
            `;

            setInitData({ userAgent, script: injectionScript });
        };
        void prepareWebView();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // insets 변경 시 명령형으로 재주입
    useEffect(() => {
        const target = (ref as React.RefObject<WebView>)?.current ?? webViewRef.current;
        if (!target || !initData) return;

        // Android WebView already handles navigation bar, so no additional bottom padding needed
        const safeBottom = Platform.OS === 'android' ? 0 : insets.bottom;

        const safeAreaScript = `
            (function() {
                const root = document.documentElement;
                root.style.setProperty('--safe-top', '${insets.top}px');
                root.style.setProperty('--safe-bottom', '${safeBottom}px');
                root.style.setProperty('--safe-left', '${insets.left}px');
                root.style.setProperty('--safe-right', '${insets.right}px');
            })();
            true;
        `;
        target.injectJavaScript(safeAreaScript);
    }, [insets, ref, initData]);

    if (!initData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#888" />
            </View>
        );
    }

    return (
        <WebView
            ref={node => {
                webViewRef.current = node;
                if (typeof ref === 'function') ref(node);
                else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
            }}
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
            onMessage={event => {
                props.onMessage?.(event);
            }}
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
