import { useCallback, useEffect, useState } from 'react';
import { BackNavigationBridge } from '../../bridge';
import { subWebViewService } from '../../services';
import { useAndroidBack } from './useAndroidBack';
import type { WebMessageData } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

export interface WebBackReport {
    canGoBack: boolean;
    includesHistory: boolean;
}

const NO_WEB_REPORT: WebBackReport = { canGoBack: false, includesHistory: false };

export const resolveCanGoBack = (web: WebBackReport, webViewCanGoBack: boolean): boolean =>
    web.includesHistory ? web.canGoBack : web.canGoBack || webViewCanGoBack;

export const nextWebBackReport = (last: WebBackReport, data: WebMessageData<'SetCanGoBack'>['data']): WebBackReport => {
    const includesHistory = data.includesHistory === true;
    return last.canGoBack === data.canGoBack && last.includesHistory === includesHistory
        ? last
        : { canGoBack: data.canGoBack, includesHistory };
};

export const useWebViewNavigation = (bridge: IAppBridgeHost) => {
    const [webReport, setWebReport] = useState<WebBackReport>(NO_WEB_REPORT);

    const [navCanGoBack, setNavCanGoBack] = useState(false);

    const canGoBack = resolveCanGoBack(webReport, navCanGoBack);

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

    const forgetPageReport = useCallback(() => setWebReport(NO_WEB_REPORT), []);

    useAndroidBack(bridge, canGoBack);

    return {
        setNavCanGoBack,
        forgetPageReport,
    };
};
