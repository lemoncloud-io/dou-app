import { useCallback, useEffect, useState } from 'react';
import { BackNavigationBridge } from '../../bridge';
import { subWebViewService } from '../../services';
import { useAndroidBack } from './useAndroidBack';
import type { WebMessageData } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

/** What the page last said through `SetCanGoBack`. */
export interface WebBackReport {
    canGoBack: boolean;
    /** The page's `canGoBack` counts its own history as well as its open overlays (bridge 2.34.0). */
    includesHistory: boolean;
}

const NO_WEB_REPORT: WebBackReport = { canGoBack: false, includesHistory: false };

/**
 * Whether an Android back press belongs to the web, or goes on to the app's own exit handling.
 *
 * A page that says `includesHistory` is the only judge: it knows its router's index and its open
 * overlays exactly. The WebView's own `canGoBack` is not consulted then: for the page's pushState
 * entries it is read as the history update is reported, and it does not follow the page — on an
 * API 36 emulator it stayed false on every pushed screen, so back offered to exit from them. When it
 * is true while the page sits on its first screen, a press is sent to a page with nothing to do with
 * it, and back does nothing at all.
 *
 * A page from before bridge 2.34.0 reports open overlays only, so the WebView's history still stands
 * in for its history there, as it always has.
 */
export const resolveCanGoBack = (web: WebBackReport, webViewCanGoBack: boolean): boolean =>
    web.includesHistory ? web.canGoBack : web.canGoBack || webViewCanGoBack;

/**
 * The report after a `SetCanGoBack`. It replaces the last one whole — so a page reloaded into an older
 * build, which sends no `includesHistory`, goes back to adding the WebView's history — but an unchanged
 * answer keeps the same object: the page reports on every DOM change, and React skips an update to the
 * same state instead of rendering the screen again.
 */
export const nextWebBackReport = (last: WebBackReport, data: WebMessageData<'SetCanGoBack'>['data']): WebBackReport => {
    const includesHistory = data.includesHistory === true;
    return last.canGoBack === data.canGoBack && last.includesHistory === includesHistory
        ? last
        : { canGoBack: data.canGoBack, includesHistory };
};

/**
 * Hook to manage the back navigation state of the WebView.
 * Used to determine whether the Android hardware back button should navigate back within the web, or exit the app.
 */
export const useWebViewNavigation = (bridge: IAppBridgeHost) => {
    // What the web app last reported: open dialogs, and — from a current page — its own routing history
    const [webReport, setWebReport] = useState<WebBackReport>(NO_WEB_REPORT);

    // State indicating if the WebView component itself has browser navigation history
    const [navCanGoBack, setNavCanGoBack] = useState(false);

    // When true, the hardware back button is the web's and does not exit the app
    const canGoBack = resolveCanGoBack(webReport, navCanGoBack);

    // The sub WebView handles back in its own React Native listener, which Android reaches only while
    // the press is armed here. The main page underneath may sit on its first screen, so its answer
    // alone would send a press over a mini app to the app's exit instead of to the view.
    const [subViewShowing, setSubViewShowing] = useState(() => subWebViewService.current() !== null);
    useEffect(() => subWebViewService.subscribe(() => setSubViewShowing(subWebViewService.current() !== null)), []);
    const armed = canGoBack || subViewShowing;

    useEffect(() => {
        BackNavigationBridge.setCanGoBack(armed);

        return () => {
            BackNavigationBridge.setCanGoBack(false);
        };
    }, [armed]);

    useEffect(() => {
        const handleSetCanGoBack = (message: WebMessageData<'SetCanGoBack'>) => {
            setWebReport(last => nextWebBackReport(last, message.data));
            return { type: 'OnSetCanGoBack' as const, success: true };
        };

        bridge.registerHandler('SetCanGoBack', handleSetCanGoBack);

        return () => {
            bridge.unregisterHandler('SetCanGoBack');
        };
    }, [bridge]);

    // The page that reported is going away: a new document is starting, or an error view replaced the
    // WebView. Its report may have been deep in its stack, and the next page reports only once it has
    // booted — over a second on a dev build. Until then the WebView's history stands in, as it does for
    // a page that never reports, so a press is not sent to a page that cannot spend it.
    const forgetPageReport = useCallback(() => setWebReport(NO_WEB_REPORT), []);

    // Register Android hardware back button listener
    useAndroidBack(bridge, canGoBack);

    return {
        setNavCanGoBack,
        forgetPageReport,
    };
};
