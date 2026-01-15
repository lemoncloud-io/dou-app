import React, { forwardRef } from 'react';
import { WebView, type WebViewProps } from 'react-native-webview';

interface AppWebViewProps extends WebViewProps {}

export const AppWebView = forwardRef<WebView, AppWebViewProps>((props, ref) => {
    return (
        <WebView
            ref={ref}
            startInLoadingState={true}
            showsVerticalScrollIndicator={false}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsBackForwardNavigationGestures={true}
            {...props}
        />
    );
});
