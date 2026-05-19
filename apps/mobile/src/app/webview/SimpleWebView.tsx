import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewProps } from 'react-native-webview';

/**
 * A simple, "dumb" WebView component for displaying web content without the complex
 * message routing and business logic contained in AppWebView.
 *
 * Ideal for simple use cases like modals or content display where two-way communication
 * is not required.
 */
export const SimpleWebView = forwardRef<WebView, WebViewProps>((props, ref) => {
    return (
        <View style={styles.container}>
            <WebView
                ref={ref}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                originWhitelist={['*']}
                {...props}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    webview: {
        flex: 1,
        backgroundColor: '#ffffff',
    },
});
