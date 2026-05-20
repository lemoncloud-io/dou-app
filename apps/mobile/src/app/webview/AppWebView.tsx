import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage } from '../utils';
import { getVersionCheckResult } from '../hooks';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import {
    getCachedDataScript,
    getConsoleOverrideScript,
    getDeviceInfoScript,
    getSafeAreaScript,
} from './utils/injectionScripts';
import { useServices } from '../hooks/useServices';
import { useThemeStore } from '../stores';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#121212';

const useIsDarkMode = () => {
    const systemColorScheme = useColorScheme();
    const theme = useThemeStore(s => s.theme);
    return theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
};

const WebViewLoadingOverlay = ({ isDark }: { isDark: boolean }) => (
    <View style={[styles.logoOverlay, { backgroundColor: isDark ? DARK_BG : LIGHT_BG }]}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
);

interface AppWebViewProps extends WebViewProps {}

// User agent suffix (sync) - appended to default system UA via applicationNameForUserAgent
const appName = Config.VIEW_APP_NAME ?? '';
const appVersion = DeviceInfo.getVersion();
const buildNumber = DeviceInfo.getBuildNumber();
const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const userAgentSuffix = `(${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platformName}; Build:${buildNumber})`;

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const { cacheCrudService, firebaseInstallationService } = useServices();
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const isDark = useIsDarkMode();
    const bgColor = isDark ? DARK_BG : LIGHT_BG;
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);

    // Phase 1: Sync injection script — 첫 렌더에 즉시 사용 가능, async 대기 없음
    // CHATIC_APP_PLATFORM + ChaticMessageHandler 브릿지가 웹앱 부팅의 핵심 (getMobileAppInfo)
    // DEVICE_ID/INSTALLATION_ID는 webCore.init()에 불필요하므로 Phase 2로 지연
    const syncInjectionScript = useMemo(() => {
        const versionCheck = getVersionCheckResult();
        const deviceInfoScript = getDeviceInfoScript({
            platform: Platform.OS.toLowerCase(),
            applicationName: DeviceInfo.getApplicationName(),
            stage: Config.VITE_ENV || 'PROD',
            uniqueId: '',
            deviceModel: DeviceInfo.getDeviceId() || '',
            appVersion: DeviceInfo.getVersion(),
            buildNumber: DeviceInfo.getBuildNumber(),
            appLanguage: getAppLanguage(),
            installationId: '',
            latestVersion: versionCheck?.latestVersion ?? '',
            shouldUpdate: versionCheck?.hasUpdate ?? false,
        });
        return `
            ${getSafeAreaScript(insets, keyboardHeight)}
            ${deviceInfoScript}
            ${getCachedDataScript({ channels: [], clouds: [], timestamp: 0 })}
            ${getConsoleOverrideScript()}
        `;
    }, [insets, keyboardHeight]);

    // Phase 2: 비동기 디바이스 정보 — WebView는 이미 로드 시작, 준비되면 주입
    const [injectionScript, setInjectionScript] = useState<string | null>(null);

    useEffect(() => {
        const prepareAsyncData = async () => {
            const [uniqueId, installationId, cachedClouds] = await Promise.all([
                DeviceInfo.getUniqueId(),
                firebaseInstallationService.getFirebaseId(),
                // NOTE: channels 캐시는 stale 데이터 노출 방지를 위해 제거 — 서버 fast path로 대체
                cacheCrudService.fetchAll({ type: 'invitecloud' }).catch(() => []),
            ]);

            /**
             * TODO
             * 디바이스 아이디 검증을 위해 임시로 uniqueId를 installationId로 교체하였음
             * 안정화 이후 `DeviceInfo.getUniqueId()` 사용할 것
             */
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

            const dedup = <T extends { id?: string }>(items: T[]): T[] => {
                const seen = new Set<string>();
                return items.filter(item => {
                    if (!item.id || seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                });
            };

            const cachedDataScript = getCachedDataScript({
                channels: [],
                clouds: dedup(cachedClouds as { id?: string }[]),
                timestamp: Date.now(),
            });

            const script = `
                ${getSafeAreaScript(insets, keyboardHeight)}
                ${deviceInfoScript}
                ${cachedDataScript}
                ${getConsoleOverrideScript()}
            `;

            setInjectionScript(script);

            // 이미 로드 중인 WebView에 비동기 값을 즉시 주입
            const composedId = `${uniqueId || 'default'}:${installationId || 'default'}`;
            const dedupedClouds = dedup(cachedClouds as { id?: string }[]);
            webViewRef.current?.injectJavaScript(`
                window.CHATIC_APP_DEVICE_ID = '${composedId}';
                window.CHATIC_APP_INSTALLATION_ID = '${installationId || ''}';
                window.CHATIC_CACHED_CLOUDS = ${JSON.stringify(dedupedClouds)};
                window.CHATIC_CACHED_TIMESTAMP = ${Date.now()};
                true;
            `);
        };
        void prepareAsyncData();
    }, [cacheCrudService, firebaseInstallationService, insets, keyboardHeight]);

    // insets 변경 시 명령형으로 재주입
    useEffect(() => {
        if (!webViewRef.current) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(insets, keyboardHeight));
    }, [insets, keyboardHeight]);

    // 깔끔한 다중 Ref 동기화
    const setRefs = useCallback(
        (node: WebView | null) => {
            webViewRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
        },
        [ref]
    );

    // 웹 React 렌더 완료(WebAppReady) 수신 시 오버레이 해제
    const { onMessage: propsOnMessage, ...restProps } = props;
    const handleWebViewMessage = useCallback(
        (event: Parameters<NonNullable<WebViewProps['onMessage']>>[0]) => {
            if (!isWebViewLoaded) {
                try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data?.type === 'WebAppReady') {
                        setIsWebViewLoaded(true);
                    }
                } catch {
                    // ignore parse errors
                }
            }
            propsOnMessage?.(event);
        },
        [propsOnMessage, isWebViewLoaded]
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
                injectedJavaScript={injectionScript ?? syncInjectionScript}
                injectedJavaScriptBeforeContentLoaded={injectionScript ?? syncInjectionScript}
                hideKeyboardAccessoryView={true}
                forceDarkOn={false}
                originWhitelist={['*']}
                allowFileAccess={true}
                allowFileAccessFromFileURLs={true}
                allowUniversalAccessFromFileURLs={true}
                mixedContentMode="always"
                {...restProps}
                onMessage={handleWebViewMessage}
            />
            {!isWebViewLoaded && <WebViewLoadingOverlay isDark={isDark} />}
        </View>
    );
});

const styles = StyleSheet.create({
    webViewContainer: {
        flex: 1,
    },
    logoOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 96,
        height: 96,
    },
    debugBadge: {
        position: 'absolute',
        bottom: 80,
        backgroundColor: 'rgba(255,0,0,0.8)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
    },
    debugText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
});
