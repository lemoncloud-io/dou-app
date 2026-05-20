import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage, t } from '../utils';
import { getVersionCheckResult, useServices } from '../hooks';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { getConsoleOverrideScript, getDeviceInfoScript, getSafeAreaScript } from './utils/injectionScripts';
import { useWebMessageRouter } from './hooks/useWebMessageRouter';
import { useVersionCheckHandler } from './hooks';
import { FullScreenLoader } from '../features/core/components';
import type { ModalHandler } from './hooks/useModalHandler';
import type { IAppBridgeHost } from '@chatic/bridges';

interface AppWebViewProps extends WebViewProps {
    bridge: IAppBridgeHost;
    modalHandler: ModalHandler;
    setWebCanGoBack: (back: boolean) => void;
}

const appName = Config.VIEW_APP_NAME ?? '';
const appVersion = DeviceInfo.getVersion();
const buildNumber = DeviceInfo.getBuildNumber();
const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const userAgentSuffix = `(${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platformName}; Build:${buildNumber})`;

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const { bridge, onMessage, modalHandler, setWebCanGoBack, ...restProps } = props;

    const { cacheCrudService, firebaseInstallationService } = useServices();
    const [injectionScript, setInjectionScript] = useState<string | null>(null);
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);

    const { isIapLoading } = useWebMessageRouter({
        bridge,
        modalHandler,
        setWebCanGoBack,
    });

    useVersionCheckHandler(bridge);

    useEffect(() => {
        const prepareWebView = async () => {
            const [uniqueId, installationId] = await Promise.all([
                DeviceInfo.getUniqueId(),
                firebaseInstallationService.getFirebaseId(),
            ]);

            const versionCheck = getVersionCheckResult();
            const deviceInfoScript = getDeviceInfoScript({
                platform: Platform.OS.toLowerCase(),
                applicationName: DeviceInfo.getApplicationName(),
                stage: Config.VITE_ENV || 'PROD',
                uniqueId: `${uniqueId || 'default'}:${installationId || 'default'}`,
                deviceModel: DeviceInfo.getDeviceId() || '',
                appVersion: DeviceInfo.getVersion(),
                buildNumber: DeviceInfo.getBuildNumber(),
                appLanguage: getAppLanguage(),
                installationId: installationId || '',
                latestVersion: versionCheck?.latestVersion ?? '',
                shouldUpdate: versionCheck?.hasUpdate ?? false,
            });

            const script = `
                ${getSafeAreaScript(insets, keyboardHeight)}
                ${deviceInfoScript}
                ${getConsoleOverrideScript()}
            `;

            setInjectionScript(script);
        };
        void prepareWebView();
    }, [cacheCrudService, firebaseInstallationService, insets, keyboardHeight]);

    useEffect(() => {
        if (!webViewRef.current || !injectionScript) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(insets, keyboardHeight));
    }, [insets, keyboardHeight, injectionScript]);

    const setRefs = useCallback(
        (node: WebView | null) => {
            webViewRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
        },
        [ref]
    );

    const { onLoad: propsOnLoad } = props;
    const handleWebViewLoad = useCallback(
        (event: Parameters<NonNullable<WebViewProps['onLoad']>>[0]) => {
            propsOnLoad?.(event);
        },
        [propsOnLoad]
    );

    if (!injectionScript) {
        return <View style={styles.loadingContainer}></View>;
    }

    return (
        <View style={styles.webViewContainer}>
            <WebView
                ref={setRefs}
                style={{ backgroundColor: '#ffffff' }}
                startInLoadingState={false}
                showsVerticalScrollIndicator={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsBackForwardNavigationGestures={true}
                applicationNameForUserAgent={userAgentSuffix}
                injectedJavaScript={injectionScript}
                injectedJavaScriptBeforeContentLoaded={injectionScript}
                hideKeyboardAccessoryView={true}
                forceDarkOn={false}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                mixedContentMode="always"
                {...restProps}
                onLoad={handleWebViewLoad}
                onMessage={onMessage}
            />
            <FullScreenLoader visible={isIapLoading} message={t('loader.paymentProcessing')} />
        </View>
    );
});

const styles = StyleSheet.create({
    webViewContainer: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});
