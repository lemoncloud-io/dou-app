import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_USER_AGENT_PREFIX, getAppLanguage } from '../utils';
import { getVersionCheckResult } from '../hooks/useAppVersionCheck';
import { useKeyboardHeight } from './hooks/useKeyboardHeight';
import {
    getCachedDataScript,
    getConsoleOverrideScript,
    getDeviceInfoScript,
    getSafeAreaScript,
} from './utils/injectionScripts';
import { firebaseInstallationService } from '../services/firebase/firebaseInstallationService';
import { cacheCrudService } from '../storages/cacheCrudService';

interface AppWebViewProps extends WebViewProps {}

// User agent suffix (sync) - appended to default system UA via applicationNameForUserAgent
const appName = Config.VIEW_APP_NAME ?? '';
const appVersion = DeviceInfo.getVersion();
const buildNumber = DeviceInfo.getBuildNumber();
const platformName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const userAgentSuffix = `(${APP_USER_AGENT_PREFIX}; ${appName}/${appVersion}; ${platformName}; Build:${buildNumber})`;

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    const [injectionScript, setInjectionScript] = useState<string | null>(null);
    const [isWebViewLoaded, setIsWebViewLoaded] = useState(false);
    const insets = useSafeAreaInsets();
    const keyboardHeight = useKeyboardHeight();
    const webViewRef = useRef<WebView | null>(null);

    // 최초 1회: deviceInfo 주입 (비동기 초기화 - getUserAgent 제거로 더 빠름)
    useEffect(() => {
        const prepareWebView = async () => {
            const [uniqueId, installationId, cachedClouds] = await Promise.all([
                DeviceInfo.getUniqueId(),
                firebaseInstallationService.getFirebaseId(),
                // NOTE: channels 캐시는 stale 데이터 노출 방지를 위해 제거 — 서버 fast path로 대체
                cacheCrudService.fetchAll({ type: 'cloud' }).catch(() => []),
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
        };
        void prepareWebView();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // insets 변경 시 명령형으로 재주입
    useEffect(() => {
        if (!webViewRef.current || !injectionScript) return;
        webViewRef.current.injectJavaScript(getSafeAreaScript(insets, keyboardHeight));
    }, [insets, keyboardHeight, injectionScript]);

    // 깔끔한 다중 Ref 동기화
    const setRefs = useCallback(
        (node: WebView | null) => {
            webViewRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<WebView | null>).current = node;
        },
        [ref]
    );

    // onLoad를 가로채서 로고 오버레이 해제 + 부모 핸들러 호출
    const { onLoad: propsOnLoad, ...restProps } = props;
    const handleWebViewLoad = useCallback(
        (event: Parameters<NonNullable<WebViewProps['onLoad']>>[0]) => {
            setIsWebViewLoaded(true);
            propsOnLoad?.(event);
        },
        [propsOnLoad]
    );

    // injectionScript가 없으면 WebView를 렌더링할 수 없음 - 흰 화면
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
            />
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
    logoOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    logo: {
        width: 80,
        height: 80,
    },
});
