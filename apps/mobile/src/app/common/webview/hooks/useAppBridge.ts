import { useWebViewBridge } from '../index';
import type { WebView } from 'react-native-webview';

export const useAppBridge = (webViewRef: React.RefObject<WebView | null>) => {
    const bridge = useWebViewBridge(webViewRef);

    return { bridge };
};
