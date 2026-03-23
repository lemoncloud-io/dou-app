import { useState } from 'react';
import type { WebView } from 'react-native-webview';
import { useAndroidBack } from './index';

/**
 * Hook to manage the back navigation state of the WebView.
 * Used to determine whether the Android hardware back button should navigate back within the web, or exit the app.
 * @param webViewRef - Reference to the WebView component to send back events to
 */
export const useWebViewNavigation = (webViewRef: React.RefObject<WebView | null>) => {
    // State indicating if the web app has open dialogs/modals or internal routing history to go back to
    const [webCanGoBack, setWebCanGoBack] = useState(false);

    // State indicating if the WebView component itself has browser navigation history
    const [navCanGoBack, setNavCanGoBack] = useState(false);

    // If either the web app or the WebView history can go back,
    // this will be true and intercept the hardware back button to prevent app exit
    const canGoBack = webCanGoBack || navCanGoBack;

    // Register Android hardware back button listener
    useAndroidBack(webViewRef, canGoBack);

    return {
        setWebCanGoBack,
        setNavCanGoBack,
    };
};
