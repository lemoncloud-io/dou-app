import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import type { SubWebViewCloseTrigger, SubWebViewContext } from '@chatic/bridge-messages';

import { HapticBridge } from '../bridge';
import { useResolvedTheme } from '../hooks';
import { clipboardService, deviceService, logger, subWebViewService } from '../services';
import { resolveAppLanguage, useLanguageStore } from '../stores';
import { getAppLanguage } from '../utils/device';
import { originOf } from '../utils/url';
import { createSubBridgeHost } from './createSubBridgeHost';
import { createSubBridgeHandlers } from './subBridgeHandlers';
import { createSubWebViewCloseGuard } from './subWebViewCloseGuard';
import { buildSubWebViewContextScript } from './subWebViewContextScript';
import { decideSubWebViewNavigation } from './subWebViewNavigation';
import { decideSubWebViewBack, useSubWebViewBack } from './useSubWebViewBack';

interface SubWebViewProps {
    viewId: string;
    url: string;
    params: Record<string, unknown>;
    /** Close the view as `user`; called once the page's close guard, if any, lets the close through. */
    onRequestClose: () => void;
    /** The document's own title, each time it changes. */
    onTitleChange?: (title: string) => void;
    /** A title the page asked for with `SetSubWebViewTitle`; `undefined` when a new page starts loading. */
    onTitleRequest?: (title: string | undefined) => void;
}

const openExternal = (url: string) => Linking.openURL(url);
const openShareSheet = (data: { title?: string; message?: string; url?: string }) => deviceService.openShareSheet(data);
// The id the main WebView is given as `CHATIC_APP_UNIQUE_DEVICE_ID`; only a key derived from it reaches a page.
const getDeviceId = () => DeviceInfo.getUniqueIdSync();

/** What the screen around the view may ask of it. */
export interface SubWebViewHandle {
    /** The user asked to close: through the page's close guard when it has one on, else closes. */
    requestClose(trigger: SubWebViewCloseTrigger): void;
}

/**
 * The second WebView. Built apart from `AppWebView` on purpose: it gets none of the main WebView's
 * injected globals (device and install ids, the bridge handler) and none of its handlers — a page
 * that asks gets a key derived from the device id and its own origin, never the id. Its bridge
 * is a host of its own that answers only the subset a page may use, and only for the origin the view
 * was opened on. Camera, microphone and file pickers are left to the OS and the WebView's own
 * defaults: what may run here is decided by what is allowed to be deployed to the allowlisted
 * domains, not by switching features off.
 */
export const SubWebView = forwardRef<SubWebViewHandle, SubWebViewProps>(function SubWebView(
    { viewId, url, params, onRequestClose, onTitleChange, onTitleRequest },
    ref
) {
    const webViewRef = useRef<WebView>(null);
    const [canGoBack, setCanGoBack] = useState(false);
    // One host per page load: a host stays "ready" after its page's first message, so a reloaded
    // page would get pushes before it listens. A new host buffers them until the new page's handshake.
    const [pageLoad, setPageLoad] = useState(0);
    // What the current page load claimed. Reset with each load, so a page never inherits the last
    // one's claim on back or its close guard.
    const backClaimed = useRef(false);
    const closeGuard = useRef(createSubWebViewCloseGuard());
    // Bumped in the load callback itself, before the state that rebuilds the host, so a late reply
    // from the old host is already stale by then.
    const loadCount = useRef(pageLoad);
    const { backgroundColor, resolvedTheme } = useResolvedTheme();
    const languagePreference = useLanguageStore(state => state.preference);
    const locale = resolveAppLanguage(languagePreference, getAppLanguage());

    const onTitleRequestRef = useRef(onTitleRequest);
    onTitleRequestRef.current = onTitleRequest;

    const openedOrigin = useMemo(() => originOf(url), [url]);

    const context = useMemo<SubWebViewContext>(
        () => ({
            protocolVersion: 1,
            viewId,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
            appVersion: DeviceInfo.getVersion(),
            locale,
            theme: resolvedTheme,
            params,
        }),
        [viewId, params, locale, resolvedTheme]
    );
    // The handshake reports the context as it is when the page asks, not as it was at load.
    const contextRef = useRef(context);
    contextRef.current = context;

    const host = useMemo(() => {
        // A request from the previous load can be answered after the next one started; its title
        // and claims must not stick to the new page.
        const load = pageLoad;
        const isCurrent = () => loadCount.current === load;
        return createSubBridgeHost(
            message => webViewRef.current?.postMessage(message),
            createSubBridgeHandlers({
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
            }),
            () => contextRef.current
        );
    }, [viewId, openedOrigin, pageLoad]);

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

    // The page read the context once; a change after that arrives as an event. The host holds it
    // until the page's handshake, so a page still loading misses nothing.
    const announcedContext = useRef({ locale, theme: resolvedTheme });
    useEffect(() => {
        const previous = announcedContext.current;
        if (previous.locale === locale && previous.theme === resolvedTheme) return;
        announcedContext.current = { locale, theme: resolvedTheme };
        host.pushEvent({ type: 'OnSubWebViewContextChanged', success: true, data: { locale, theme: resolvedTheme } });
    }, [host, locale, resolvedTheme]);

    // Only the origin the view was opened on may talk to the app. A page it navigated to — another
    // allowlisted one included — and any frame on another origin get no answer at all.
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

    const onShouldStartLoadWithRequest = useCallback((request: ShouldStartLoadRequest) => {
        const decision = decideSubWebViewNavigation(request);
        if (decision === 'external') {
            Linking.openURL(request.url).catch(e => logger.warn('WEBVIEW', '[sub] external open failed', e));
        } else if (decision === 'block') {
            logger.warn('WEBVIEW', '[sub] navigation blocked', { url: request.url });
        }
        return decision === 'load';
    }, []);

    // A new document: a fresh host for it, and the last page's title and claims no longer apply.
    const onLoadStart = useCallback(() => {
        loadCount.current += 1;
        setPageLoad(loadCount.current);
        backClaimed.current = false;
        closeGuard.current = createSubWebViewCloseGuard();
        onTitleRequestRef.current?.(undefined);
    }, []);

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
            injectedJavaScriptBeforeContentLoaded={contextScript}
            // Again at load end: on Android the first run does not always precede the page's own
            // scripts. The script stops when it finds the context already defined.
            injectedJavaScript={contextScript}
            onLoadStart={onLoadStart}
            onMessage={onMessage}
            // Everything, so every navigation reaches the decision below: react-native-webview checks
            // this list first and hands whatever fails it straight to the OS, the app's own schemes
            // included, without asking `onShouldStartLoadWithRequest`.
            originWhitelist={['*']}
            // Inspectable from Safari Web Inspector and `chrome://inspect` in a development build,
            // as the main WebView is; iOS 16.4+ shows no WebView there without it.
            webviewDebuggingEnabled={__DEV__}
            onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
            onNavigationStateChange={onNavigationStateChange}
            // `target=_blank` and `window.open` load in this view, through the same check, instead
            // of opening a window this screen does not manage.
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
        />
    );
});

const styles = StyleSheet.create({
    webView: { flex: 1 },
});
