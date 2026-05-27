import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, StyleSheet, useColorScheme, View } from 'react-native';
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
import { useThemeStore } from '../stores';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#121212';

const useIsDarkMode = () => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(s => s.theme);
    return theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
};

const ResumeOverlay = ({ isDark }: { isDark: boolean }) => (
    <View style={[styles.resumeOverlay, { backgroundColor: isDark ? DARK_BG : LIGHT_BG }]}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
);

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
    const isDark = useIsDarkMode();
    const bgColor = isDark ? DARK_BG : LIGHT_BG;
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);

    const [isWebAppReady, setIsWebAppReady] = useState(false);
    const webAppReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { isIapLoading } = useWebMessageRouter({
        bridge,
        modalHandler,
        setWebCanGoBack,
    });

    useVersionCheckHandler(bridge);

    // iOS: content process가 OS에 의해 종료된 경우 리로드
    const handleContentProcessDidTerminate = useCallback(() => {
        setInjectionScript(prev => {
            // force re-render of loading state, then reload
            webViewRef.current?.reload();
            return prev;
        });
    }, []);

    // iOS WKWebView 백그라운드 복귀 시 흰 화면 방지
    // 렌더링 레이어가 suspend → repaint 되는 동안 테마 색상 오버레이로 가림
    const [showResumeOverlay, setShowResumeOverlay] = useState(false);
    const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextState => {
            if (nextState === 'background' || nextState === 'inactive') {
                if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
                setShowResumeOverlay(true);
            } else if (nextState === 'active') {
                // WebView에 repaint 신호 요청 — 실제 paint 완료 후 ResumeReady 메시지로 오버레이 해제
                webViewRef.current?.injectJavaScript(`
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ResumeReady' }));
                        });
                    });
                    true;
                `);
                // Fallback: JS 메시지가 안 오는 경우 (content process 종료 등) 최대 1.5초 후 해제
                resumeTimeoutRef.current = setTimeout(() => setShowResumeOverlay(false), 1500);
            }
        });
        return () => {
            subscription.remove();
            if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
        };
    }, []);

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
            // Fallback: WebAppReady 메시지가 도착하지 않는 경우 (웹 앱 에러 등) 최대 1초 후 로더 해제
            if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
            webAppReadyTimeoutRef.current = setTimeout(() => setIsWebAppReady(true), 1000);
        },
        [propsOnLoad]
    );

    // WebAppReady / ResumeReady 메시지를 가로채서 처리, 나머지는 bridge onMessage로 전달
    const handleMessage = useCallback(
        (event: Parameters<NonNullable<WebViewProps['onMessage']>>[0]) => {
            try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data?.type === 'WebAppReady') {
                    if (webAppReadyTimeoutRef.current) clearTimeout(webAppReadyTimeoutRef.current);
                    setIsWebAppReady(true);
                    // Flush MMKV offline push queue when WebView is fully ready
                    const { offlinePushQueue } = require('../services');
                    void offlinePushQueue.flush();
                    return;
                }
                if (data?.type === 'ResumeReady') {
                    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
                    setShowResumeOverlay(false);
                    return;
                }
            } catch {
                // ignore parse errors
            }
            onMessage?.(event);
        },
        [onMessage]
    );

    if (!injectionScript) {
        return (
            <View style={[styles.loadingContainer, { backgroundColor: bgColor }]}>
                <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            </View>
        );
    }

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
                injectedJavaScript={injectionScript}
                injectedJavaScriptBeforeContentLoaded={injectionScript}
                hideKeyboardAccessoryView={true}
                forceDarkOn={false}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                mixedContentMode="always"
                cacheEnabled={true}
                cacheMode="LOAD_DEFAULT"
                {...restProps}
                onLoad={handleWebViewLoad}
                onMessage={handleMessage}
                onContentProcessDidTerminate={handleContentProcessDidTerminate}
            />
            <FullScreenLoader visible={isIapLoading} message={t('loader.paymentProcessing')} />
            {(!isWebAppReady || showResumeOverlay) && <ResumeOverlay isDark={isDark} />}
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
    },
    resumeOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 96,
        height: 96,
    },
});
