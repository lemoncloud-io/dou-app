import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage, t } from '../utils';
import { getVersionCheckResult, useResolvedTheme } from '../hooks';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { getSafeAreaScript, getSyncInjectionScript } from './utils/injectionScripts';
import { buildDeviceInfoParams, type CachedDeviceInfo } from './utils/buildDeviceInfoParams';
import { useWebMessageRouter } from './hooks/useWebMessageRouter';
import { useFirebaseInstallId, useVersionCheckHandler } from './hooks';
import { FullScreenLoader, ResumeOverlay } from '../features/core/components';
import { bootMetricsService } from '../services';
import { useDebugSettingsStore } from '../stores';
import type { IAppBridgeHost } from '@chatic/bridges';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#121212';

interface AppWebViewProps extends WebViewProps {
    /** 모바일 브릿지 호스트 인스턴스 (네이티브 기능 라우팅 및 이벤트 발송 담당) */
    bridge: IAppBridgeHost;
}

const appName = Config.VIEW_APP_NAME ?? '';
const appVersion = DeviceInfo.getVersion();
const buildNumber = DeviceInfo.getBuildNumber();
const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const userAgentSuffix = `(${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platformName}; Build:${buildNumber})`;

// Synchronous DeviceInfo bridge calls are read once at module load rather than on every render:
// their values are stable per install/device and sit on the injection-script critical path (the
// script is built before the WebView is created). getUniqueIdSync / getApplicationName / getDeviceId
// each cross the native bridge, so caching them removes those round-trips from the boot path.
const CACHED_DEVICE_INFO: CachedDeviceInfo = {
    platform: Platform.OS.toLowerCase(),
    applicationName: DeviceInfo.getApplicationName(),
    deviceModel: DeviceInfo.getDeviceId() || '',
    appVersion,
    buildNumber,
    deviceId: DeviceInfo.getUniqueIdSync(),
};

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const { bridge, onMessage, ...restProps } = props;

    const { isDark } = useResolvedTheme();
    const bgColor = isDark ? DARK_BG : LIGHT_BG;
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);
    const { onLoad: propsOnLoad } = props;

    const { isIapLoading, showResumeOverlay } = useWebMessageRouter({
        bridge,
    });

    useVersionCheckHandler(bridge);

    // iOS: content process가 OS에 의해 종료된 경우 리로드
    const handleContentProcessDidTerminate = useCallback(() => {
        // The forced reload is effectively a full re-boot of the web app —
        // record it as its own boot session so it shows up in the perf history.
        bootMetricsService.startReloadSession();
        webViewRef.current?.reload();
    }, []);

    const firebaseInstallId = useFirebaseInstallId();
    const versionCheck = getVersionCheckResult();
    const debugModeEnabled = useDebugSettingsStore(state => state.debugModeEnabled);
    const syncInjectionScript = getSyncInjectionScript({
        insets,
        keyboardHeight,
        debugModeEnabled,
        deviceInfo: buildDeviceInfoParams(CACHED_DEVICE_INFO, {
            stage: Config.VITE_ENV || 'PROD',
            appLanguage: getAppLanguage(),
            firebaseInstallId,
            latestVersion: versionCheck?.latestVersion ?? '',
            shouldUpdate: versionCheck?.hasUpdate ?? false,
        }),
    });

    useEffect(() => {
        if (!webViewRef.current) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(insets, keyboardHeight));
    }, [insets, keyboardHeight]);

    const setRefs = useCallback(
        (node: WebView | null) => {
            webViewRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
        },
        [ref]
    );

    return (
        <View style={styles.webViewContainer}>
            <WebView
                ref={setRefs}
                style={{ backgroundColor: bgColor }}
                startInLoadingState={false}
                showsVerticalScrollIndicator={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsBackForwardNavigationGestures={true}
                applicationNameForUserAgent={userAgentSuffix}
                injectedJavaScript={syncInjectionScript}
                injectedJavaScriptBeforeContentLoaded={syncInjectionScript}
                hideKeyboardAccessoryView={true}
                forceDarkOn={false}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                webviewDebuggingEnabled={__DEV__}
                mixedContentMode="always"
                cacheEnabled={true}
                cacheMode="LOAD_DEFAULT"
                {...restProps}
                onLoad={propsOnLoad}
                onMessage={onMessage}
                onContentProcessDidTerminate={handleContentProcessDidTerminate}
            />
            <FullScreenLoader visible={isIapLoading} message={t('loader.paymentProcessing')} />
            {showResumeOverlay && <ResumeOverlay isDark={isDark} />}
        </View>
    );
});

const styles = StyleSheet.create({
    webViewContainer: {
        flex: 1,
    },
});
