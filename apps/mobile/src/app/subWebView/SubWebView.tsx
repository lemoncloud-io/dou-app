import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet } from 'react-native';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import type {
    SubWebViewCloseTrigger,
    SubWebViewContext,
    SubWebViewDisplay,
    SubWebViewPermission,
    SubWebViewRuntimePermission,
} from '@chatic/bridge-messages';
// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; these link and store-URL helpers move to platform-free packages (mini-app protocol, host links)
import { subWebViewAppLinkOfId, subWebViewAppLinkOfOrigin, type SubWebViewTrust } from '@chatic/shared';

import { HapticBridge } from '../bridge';
import { useResolvedTheme } from '../hooks';
import { clipboardService, deviceService, logger, permissionService, subWebViewService } from '../services';
import { resolveAppLanguage, useLanguageStore } from '../stores';
import { getAppLanguage } from '../utils/device';
import { openSubWebViewStorage } from '../services/subWebView/subWebViewStorageFile';
import { originOf } from '../utils/url';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers, permittedSubBridgeHandlers } from './subBridgeHandlers';
import { createSubWebViewCloseGuard } from './subWebViewCloseGuard';
import {
    buildSubWebViewInsetScript,
    NO_SUB_WEBVIEW_SAFE_AREA,
    sameSubWebViewSafeArea,
    subWebViewSafeAreaOf,
} from './subWebViewInsetScript';
import { buildSubWebViewContextScript } from './subWebViewContextScript';
import { decideSubWebViewNavigation } from './subWebViewNavigation';
import { openSubWebViewRuntime } from './subWebViewRuntimeAccess';
import type * as RuntimeBridgeModule from './subWebViewRuntimeBridge';
import { decideSubWebViewBack, useSubWebViewBack } from './useSubWebViewBack';

interface SubWebViewProps {
    viewId: string;
    url: string;
    params: Record<string, unknown>;
    appId?: string;
    permissions: ReadonlySet<SubWebViewPermission>;
    runtimePermissions: ReadonlySet<SubWebViewRuntimePermission>;
    trust: SubWebViewTrust;
    onRequestClose: () => void;
    onTitleChange?: (title: string) => void;
    onTitleRequest?: (title: string | undefined) => void;
    insets?: EdgeInsets;
    display?: SubWebViewDisplay;
}

export const SUB_WEBVIEW_SAFE_AREA_SETTLE_MS = 200;

const openExternal = (url: string) => Linking.openURL(url);
const openShareSheet = (data: { title?: string; message?: string; url?: string }) => deviceService.openShareSheet(data);
const getDeviceId = () => DeviceInfo.getUniqueIdSync();
const openSettings = () => deviceService.openSettings();

export interface SubWebViewHandle {
    requestClose(trigger: SubWebViewCloseTrigger): void;
}

export const SubWebView = forwardRef<SubWebViewHandle, SubWebViewProps>(function SubWebView(
    {
        viewId,
        url,
        params,
        appId,
        permissions,
        runtimePermissions,
        trust,
        onRequestClose,
        onTitleChange,
        onTitleRequest,
        insets,
        display = 'clean',
    },
    ref
) {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [pageLoad, setPageLoad] = useState(0);
    const backClaimed = useRef(false);
    const closeGuard = useRef(createSubWebViewCloseGuard());
    const loadCount = useRef(pageLoad);
    const { backgroundColor, resolvedTheme } = useResolvedTheme();
    const languagePreference = useLanguageStore(state => state.preference);
    const locale = resolveAppLanguage(languagePreference, getAppLanguage());

    const onTitleRequestRef = useRef(onTitleRequest);
    onTitleRequestRef.current = onTitleRequest;

    const openedOrigin = useMemo(() => originOf(url), [url]);
    const appLink = useMemo(() => {
        if (appId) return subWebViewAppLinkOfId(appId, Config.VITE_ENV === 'PROD' ? 'prod' : 'dev');
        return openedOrigin ? subWebViewAppLinkOfOrigin(openedOrigin) : null;
    }, [appId, openedOrigin]);

    const immersiveInsets = display === 'immersive' ? insets : undefined;
    const measured = immersiveInsets ? subWebViewSafeAreaOf(immersiveInsets) : NO_SUB_WEBVIEW_SAFE_AREA;
    const safeArea = useMemo(
        () => measured,
        // eslint-disable-next-line react-hooks/exhaustive-deps -- by value: a new object with equal edges is no change
        [measured.top, measured.right, measured.bottom, measured.left]
    );

    const context = useMemo<SubWebViewContext>(
        () => ({
            protocolVersion: 1,
            viewId,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            appVersion: DeviceInfo.getVersion(),
            locale,
            theme: resolvedTheme,
            params,
            ...(appLink ? { appLink } : {}),
            display,
            safeArea,
        }),
        [viewId, params, locale, resolvedTheme, appLink, display, safeArea]
    );
    const contextRef = useRef(context);
    contextRef.current = context;

    const [runtimeAccess] = useState(() => openSubWebViewRuntime({ trust, permissions: runtimePermissions }));

    const { host, runtime } = useMemo(() => {
        const load = pageLoad;
        const isCurrent = () => loadCount.current === load;
        const handlers = createSubBridgeHandlers({
            viewId,
            service: subWebViewService,
            clipboard: clipboardService,
            haptic: HapticBridge,
            openExternal,
            setTitle: title => {
                if (isCurrent()) onTitleRequestRef.current?.(title);
            },
            openShareSheet,
            origin: openedOrigin,
            getDeviceId,
            setBackClaim: claimed => {
                if (isCurrent()) backClaimed.current = claimed;
            },
            setCloseGuard: enabled => {
                if (isCurrent()) closeGuard.current.setEnabled(enabled);
            },
            logPageError: report => logger.warn('WEBVIEW', '[sub] page error', report),
            openStorage: () => {
                if (!openedOrigin) return null;
                const storage = openSubWebViewStorage(openedOrigin);
                if (!storage) logger.warn('WEBVIEW', '[sub] storage could not be opened', { origin: openedOrigin });
                return storage;
            },
            permissions: permissionService,
            openSettings,
        });
        let runtime: ReturnType<(typeof RuntimeBridgeModule)['createAppSubWebViewRuntimeBridge']> | null = null;
        let pageHost: ReturnType<typeof createSubBridgeHost> | null = null;
        if (runtimeAccess && openedOrigin) {
            const { createAppSubWebViewRuntimeBridge } =
                require('./subWebViewRuntimeBridge') as typeof RuntimeBridgeModule;
            runtime = createAppSubWebViewRuntimeBridge({
                access: runtimeAccess,
                origin: openedOrigin,
                pageHost: () => (isCurrent() ? pageHost : null),
                onRefused: refusal => logger.warn('WEBVIEW', '[sub] runtime request refused', refusal),
            });
        }
        pageHost = createSubBridgeHost(
            message => webViewRef.current?.postMessage(message),
            { ...permittedSubBridgeHandlers(handlers, permissions), ...(runtime?.handlers ?? {}) },
            () => contextRef.current
        );
        return { host: pageHost, runtime };
    }, [viewId, openedOrigin, pageLoad, permissions, runtimeAccess]);

    useEffect(() => () => runtime?.dispose(), [runtime]);

    const requestClose = useCallback(
        (trigger: SubWebViewCloseTrigger) => {
            if (closeGuard.current.decide(Date.now()) === 'close') {
                onRequestClose();
                return;
            }
            host.pushEvent({ type: 'OnSubWebViewCloseRequested', success: true, data: { trigger } });
        },
        [host, onRequestClose]
    );

    useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);

    const onBack = useCallback(() => {
        const decision = decideSubWebViewBack({ claimed: backClaimed.current, canGoBack });
        if (decision === 'page') host.pushEvent({ type: 'OnBackPressed', success: true, data: {} });
        else if (decision === 'history') webViewRef.current?.goBack();
        else requestClose('back');
    }, [host, canGoBack, requestClose]);

    useSubWebViewBack(onBack);

    const contextScript = useMemo(() => buildSubWebViewContextScript(context, url), [context, url]);
    const insetScript = immersiveInsets ? buildSubWebViewInsetScript(immersiveInsets) : '';
    const pageScript = useMemo(() => contextScript + insetScript, [contextScript, insetScript]);
    useEffect(() => {
        if (insetScript) webViewRef.current?.injectJavaScript(insetScript);
    }, [insetScript]);

    const announcedContext = useRef({ locale, theme: resolvedTheme, safeArea });
    useEffect(() => {
        const previous = announcedContext.current;
        const announce = () => {
            announcedContext.current = { locale, theme: resolvedTheme, safeArea };
            host.pushEvent({
                type: 'OnSubWebViewContextChanged',
                success: true,
                data: { locale, theme: resolvedTheme, safeArea },
            });
        };
        if (previous.locale !== locale || previous.theme !== resolvedTheme) {
            announce();
            return;
        }
        if (sameSubWebViewSafeArea(previous.safeArea, safeArea)) return;
        const settled = setTimeout(announce, SUB_WEBVIEW_SAFE_AREA_SETTLE_MS);
        return () => clearTimeout(settled);
    }, [host, locale, resolvedTheme, safeArea]);

    const onMessage = useCallback(
        (event: WebViewMessageEvent) => {
            if (originOf(event.nativeEvent.url) !== openedOrigin) {
                logger.warn('WEBVIEW', '[sub] message dropped: not the opened origin', { url: event.nativeEvent.url });
                return;
            }
            void host.handleMessage(event.nativeEvent.data);
        },
        [host, openedOrigin]
    );

    const onShouldStartLoadWithRequest = useCallback(
        (request: ShouldStartLoadRequest) => {
            const decision = decideSubWebViewNavigation(request, openedOrigin);
            if (decision === 'external') {
                Linking.openURL(request.url).catch(e => logger.warn('WEBVIEW', '[sub] external open failed', e));
            } else if (decision === 'block') {
                logger.warn('WEBVIEW', '[sub] navigation blocked', { url: request.url });
            }
            return decision === 'load';
        },
        [openedOrigin]
    );

    const onLoadStart = useCallback(() => {
        loadCount.current += 1;
        setPageLoad(loadCount.current);
        backClaimed.current = false;
        closeGuard.current = createSubWebViewCloseGuard();
        onTitleRequestRef.current?.(undefined);
    }, []);

    const reloadedAfterBackgroundKill = useRef(false);
    const closeForProcessGone = useCallback(() => {
        logger.warn('WEBVIEW', '[sub] page process gone; closing the view', { viewId });
        subWebViewService.close(viewId, 'system');
    }, [viewId]);
    const onContentProcessDidTerminate = useCallback(() => {
        if (AppState.currentState === 'background' && !reloadedAfterBackgroundKill.current) {
            reloadedAfterBackgroundKill.current = true;
            logger.warn('WEBVIEW', '[sub] page process ended in the background; reloading once', { viewId });
            webViewRef.current?.reload();
            return;
        }
        closeForProcessGone();
    }, [viewId, closeForProcessGone]);

    const onNavigationStateChange = useCallback(
        (state: WebViewNavigation) => {
            setCanGoBack(state.canGoBack);
            if (state.title && !state.loading) onTitleChange?.(state.title);
        },
        [onTitleChange]
    );

    return (
        <WebView
            ref={webViewRef}
            source={{ uri: url }}
            style={[styles.webView, { backgroundColor }]}
            injectedJavaScriptBeforeContentLoaded={pageScript}
            injectedJavaScript={pageScript}
            contentInsetAdjustmentBehavior="never"
            onLoadStart={onLoadStart}
            onMessage={onMessage}
            originWhitelist={['*']}
            webviewDebuggingEnabled={__DEV__}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            onContentProcessDidTerminate={onContentProcessDidTerminate}
            onRenderProcessGone={closeForProcessGone}
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            allowsInlineMediaPlayback
            mediaCapturePermissionGrantType="grantIfSameHostElseDeny"
        />
    );
});

const styles = StyleSheet.create({
    webView: { flex: 1 },
});
