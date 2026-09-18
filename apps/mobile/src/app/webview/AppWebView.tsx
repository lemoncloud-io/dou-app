import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage, t, toEnvStage } from '../utils';
import { getVersionCheckResult, useResolvedTheme } from '../hooks';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { getLogUploadHoldScript, getSafeAreaScript, getSyncInjectionScript } from './utils/injectionScripts';
import { buildDeviceInfoParams, type CachedDeviceInfo } from './utils/buildDeviceInfoParams';
import { NATIVE_RUN_ID } from '../services/log/native/nativeLogContext';
import { useWebMessageRouter } from './hooks/useWebMessageRouter';
import { useFirebaseInstallId, useVersionCheckHandler } from './hooks';
import { FullScreenLoader, ResumeOverlay } from '../features/core/components';
import { bootMetricsService, configKvService, logger, pendingReportQueueService } from '../services';
import { useDebugSettingsStore, useThemeStore } from '../stores';
import type { IAppBridgeHost } from '@chatic/bridges';

interface AppWebViewProps extends WebViewProps {
    /** Mobile bridge host instance (handles native feature routing and event dispatch) */
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
    osVersion: DeviceInfo.getSystemVersion(),
    // Issued by the logging layer at app start; injected so the WebView stamps
    // its entries with the same run identity as the native side.
    runId: NATIVE_RUN_ID,
};

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const { bridge, onMessage, ...restProps } = props;

    const { isDark, backgroundColor } = useResolvedTheme();
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);
    const { onLoad: propsOnLoad } = props;

    const { isIapLoading, showResumeOverlay } = useWebMessageRouter({
        bridge,
    });

    useVersionCheckHandler(bridge);

    // WebView process crash detection (ADR-0097): the web side dies outright and can't report on
    // itself, so native only records the fact into the pending-report queue — the reloaded web app
    // pulls it once its session is ready and relays it on the web's behalf. It doesn't attach a
    // buffer snapshot: the uploader already ships those entries individually from the unified
    // buffer, so copying them here would just get the same log saved into the report a second time.
    const captureWebViewCrash = useCallback((reason: string) => {
        logger.error('WEBVIEW', `[webview-crash] ${reason}`);
        pendingReportQueueService.enqueue({
            category: 'webview-crash',
            message: reason,
            detectedAt: Date.now(),
        });
    }, []);

    // iOS: reload when the content process is terminated by the OS
    const handleContentProcessDidTerminate = useCallback(() => {
        captureWebViewCrash('iOS WebView content process terminated');
        // The forced reload is effectively a full re-boot of the web app —
        // record it as its own boot session so it shows up in the perf history.
        bootMetricsService.startReloadSession();
        webViewRef.current?.reload();
    }, [captureWebViewCrash]);

    // Android: render process crashed/killed — capture and reload the same way as the iOS path
    const handleRenderProcessGone = useCallback(
        (event: { nativeEvent: { didCrash?: boolean } }) => {
            captureWebViewCrash(
                `Android WebView render process gone (didCrash: ${event.nativeEvent?.didCrash ?? 'unknown'})`
            );
            bootMetricsService.startReloadSession();
            webViewRef.current?.reload();
        },
        [captureWebViewCrash]
    );

    const firebaseInstallId = useFirebaseInstallId();
    const versionCheck = getVersionCheckResult();
    const debugModeEnabled = useDebugSettingsStore(state => state.debugModeEnabled);
    const logUploadHold = useDebugSettingsStore(state => state.logUploadHold);
    // Seeds the web's pre-paint script. Only `injectedJavaScriptBeforeContentLoaded` matters for
    // that, which applies to the next load — a live theme change needs no push, since the web
    // initiated it and already knows.
    const theme = useThemeStore(state => state.theme);
    const syncInjectionScript = getSyncInjectionScript({
        insets,
        keyboardHeight,
        debugModeEnabled,
        logUploadHold,
        theme,
        // Read once per script build, not memoized: this mirrors CACHED_DEVICE_INFO's own boot-time
        // snapshot semantics — a shell-lane write goes through `SaveConfigValue` while this WebView
        // instance is alive, and the web's own optimistic store update is what that screen sees
        // immediately. This bag only needs to be current for the NEXT cold start.
        configBag: configKvService.getAll(),
        deviceInfo: buildDeviceInfoParams(CACHED_DEVICE_INFO, {
            stage: toEnvStage(Config.VITE_ENV),
            // Same flag that gates the console subscription in `provider.ts`.
            // Tying them together is the point: the web relays `debug` if and
            // only if something over here will print it.
            consoleEnabled: __DEV__,
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

    // Pushed live rather than only at load: the point of holding is to reproduce
    // a bug while it is on, and a reload would discard the very session being
    // reproduced. Sending on mount too is harmless — the boot script already set
    // the same value.
    useEffect(() => {
        webViewRef.current?.injectJavaScript(getLogUploadHoldScript(logUploadHold));
    }, [logUploadHold]);

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
                style={{ backgroundColor }}
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
                onRenderProcessGone={handleRenderProcessGone}
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
