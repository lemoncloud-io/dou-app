import { useEffect, useState } from 'react';
import { BackNavigationBridge } from '../../bridge';
import { useAndroidBack } from './useAndroidBack';
import type { WebMessageData } from '@chatic/app-messages';
import type { IAppBridgeHost } from '@chatic/bridges';

/**
 * Hook to manage the back navigation state of the WebView.
 * Used to determine whether the Android hardware back button should navigate back within the web, or exit the app.
 */
export const useWebViewNavigation = (bridge: IAppBridgeHost) => {
    // State indicating if the web app has open dialogs/modals or internal routing history to go back to
    const [webCanGoBack, setWebCanGoBack] = useState(false);

    // State indicating if the WebView component itself has browser navigation history
    const [navCanGoBack, setNavCanGoBack] = useState(false);

    // If either the web app or the WebView history can go back,
    // this will be true and intercept the hardware back button to prevent app exit
    const canGoBack = webCanGoBack || navCanGoBack;

    useEffect(() => {
        BackNavigationBridge.setCanGoBack(canGoBack);

        return () => {
            BackNavigationBridge.setCanGoBack(false);
        };
    }, [canGoBack]);

    useEffect(() => {
        const handleSetCanGoBack = (message: WebMessageData<'SetCanGoBack'>) => {
            setWebCanGoBack(message.data.canGoBack);
            return { type: 'OnSetCanGoBack' as const, success: true };
        };

        bridge.registerHandler('SetCanGoBack', handleSetCanGoBack);

        return () => {
            bridge.unregisterHandler('SetCanGoBack');
        };
    }, [bridge]);

    // Register Android hardware back button listener
    useAndroidBack(bridge, canGoBack);

    return {
        setNavCanGoBack,
    };
};
