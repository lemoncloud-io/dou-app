import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage, t, toEnvStage } from '../utils';
import { getVersionCheckResult, useResolvedTheme } from '../hooks';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import { hostCapabilities } from './utils/hostCapabilities';
import { getLogUploadHoldScript, getSafeAreaScript, getSyncInjectionScript } from './utils/injectionScripts';
import { toWebViewInsets } from './utils/webViewGeometry';
import { buildDeviceInfoParams, type CachedDeviceInfo } from './utils/buildDeviceInfoParams';
import { NATIVE_RUN_ID } from '../services/log/native/nativeLogContext';
import { useWebMessageRouter } from './hooks/useWebMessageRouter';
import { type CrashRecoveryGiveUpReason, useWebViewCrashRecovery } from './hooks/useWebViewCrashRecovery';
import { STORAGE_MEDIA } from './utils/storageRequest.util';
import { useFirebaseInstallId, useVersionCheckHandler } from './hooks';
import { FullScreenLoader, ResumeOverlay } from '../features/core/components';
import { configKvService } from '../services';
import { useDebugSettingsStore, useThemeStore } from '../stores';
import type { IAppBridgeHost } from '@chatic/bridges';
import type { RuntimeOffer } from '@chatic/bridge-messages';

import { launchSessionOwner } from '../services/runtime/launchSessionOwner';
import { runtimeHold } from '../services/runtime/runtimeHold';
import type * as RuntimeOfferModule from '../services/runtime/runtimeOffer';

interface AppWebViewProps extends WebViewProps {
    bridge: IAppBridgeHost;
    onCrashRecoveryFailed: (reason: CrashRecoveryGiveUpReason) => void;
}

const appName = Config.VIEW_APP_NAME ?? '';
const appVersion = DeviceInfo.getVersion();
const buildNumber = DeviceInfo.getBuildNumber();
const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const userAgentSuffix = `(${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platformName}; Build:${buildNumber})`;

const CACHED_DEVICE_INFO: CachedDeviceInfo = {
    platform: Platform.OS.toLowerCase(),
    applicationName: DeviceInfo.getApplicationName(),
    deviceModel: DeviceInfo.getDeviceId() || '',
    appVersion,
    buildNumber,
    deviceId: DeviceInfo.getUniqueIdSync(),
    osVersion: DeviceInfo.getSystemVersion(),
    runId: NATIVE_RUN_ID,
};

let offerModuleOfLaunch: typeof RuntimeOfferModule | null | undefined;
const readRuntimeOffer = (held: boolean): RuntimeOffer | null => {
    if (offerModuleOfLaunch === undefined) {
        offerModuleOfLaunch =
            launchSessionOwner() === 'native'
                ? (require('../services/runtime/runtimeOffer') as typeof RuntimeOfferModule)
                : null;
    }
    return offerModuleOfLaunch?.nativeRuntimeOffer(held) ?? null;
};

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const { bridge, onMessage, onCrashRecoveryFailed, ...restProps } = props;

    const { isDark, backgroundColor } = useResolvedTheme();
    const insets = useSafeAreaInsets();
    const { padding, web: webInsets } = useMemo(() => toWebViewInsets(insets), [insets]);
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);
    const { onLoad: propsOnLoad } = props;

    const { isIapLoading, showResumeOverlay, coverReload } = useWebMessageRouter({
        bridge,
    });

    useVersionCheckHandler(bridge);

    const reloadWebView = useCallback(() => webViewRef.current?.reload(), []);
    const handleTermination = useWebViewCrashRecovery({
        reload: reloadWebView,
        coverReload,
        onGiveUp: onCrashRecoveryFailed,
    });

    const handleContentProcessDidTerminate = useCallback(
        () => handleTermination('iOS WebView content process terminated'),
        [handleTermination]
    );

    const handleRenderProcessGone = useCallback(
        (event: { nativeEvent: { didCrash?: boolean } }) =>
            handleTermination(
                `Android WebView render process gone (didCrash: ${event.nativeEvent?.didCrash ?? 'unknown'})`
            ),
        [handleTermination]
    );

    const firebaseInstallId = useFirebaseInstallId();
    const versionCheck = getVersionCheckResult();
    const debugModeEnabled = useDebugSettingsStore(state => state.debugModeEnabled);
    const logUploadHold = useDebugSettingsStore(state => state.logUploadHold);
    const theme = useThemeStore(state => state.theme);
    const runtimeHeld = useSyncExternalStore(runtimeHold.subscribe, runtimeHold.read);
    const syncInjectionScript = getSyncInjectionScript({
        insets: webInsets,
        keyboardHeight,
        debugModeEnabled,
        logUploadHold,
        theme,
        configBag: configKvService.getAll(),
        storageMedia: STORAGE_MEDIA,
        runtimeOffer: readRuntimeOffer(runtimeHeld),
        capabilities: hostCapabilities(Platform.OS),
        deviceInfo: buildDeviceInfoParams(CACHED_DEVICE_INFO, {
            stage: toEnvStage(Config.VITE_ENV),
            consoleEnabled: __DEV__,
            appLanguage: getAppLanguage(),
            firebaseInstallId,
            latestVersion: versionCheck?.latestVersion ?? '',
            shouldUpdate: versionCheck?.hasUpdate ?? false,
        }),
    });

    useEffect(() => {
        if (!webViewRef.current) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(webInsets, keyboardHeight));
    }, [webInsets, keyboardHeight]);

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
        <View style={[styles.webViewContainer, padding, { backgroundColor }]}>
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
                allowFileAccessFromFileURLs={false}
                allowUniversalAccessFromFileURLs={false}
                webviewDebuggingEnabled={__DEV__}
                mixedContentMode="never"
                allowsInlineMediaPlayback={true}
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
