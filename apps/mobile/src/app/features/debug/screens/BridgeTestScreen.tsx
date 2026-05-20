import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    useAppBridge,
    useDeviceHandler,
    useOAuthHandler,
    usePermissionHandler,
    useSubscriptionIapHandler,
} from '../../../webview/hooks';
import type { WebMessageType } from '@chatic/app-messages';

type LogType = 'sent' | 'received' | 'info' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

export const BridgeTestScreen = () => {
    const insets = useSafeAreaInsets();
    const webViewRef = useRef<WebView>(null);
    const { bridge, onMessage: originalOnMessage } = useAppBridge(webViewRef);
    const [logs, setLogs] = useState<LogItem[]>([]);
    const flatListRef = useRef<FlatList>(null);

    const { handleOpenShareSheet, handleOpenDocument, handleGetContacts, handleOpenCamera } = useDeviceHandler();
    const { handleRequestPermission } = usePermissionHandler();
    const { handleOAuthLogin, handleOAuthLogout } = useOAuthHandler();
    const {
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
    } = useSubscriptionIapHandler(bridge);

    const addLog = useCallback((type: LogType, message: string) => {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const newLog: LogItem = {
            id: Date.now().toString() + Math.random(),
            type,
            message,
            timestamp: timeString,
        };

        setLogs(prev => [...prev, newLog]);

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, []);

    const handleClearLogs = () => {
        setLogs([]);
    };

    const handleWebViewMessage = useCallback(
        (event: WebViewMessageEvent) => {
            try {
                const parsed = JSON.parse(event.nativeEvent.data);
                if (parsed.type && parsed.refId && parsed.success === undefined) {
                    addLog('received', `[Web -> App] Type: ${parsed.type}`);
                }
            } catch {
                /* empty */
            }
            originalOnMessage(event);
        },
        [addLog, originalOnMessage]
    );

    useEffect(() => {
        bridge.registerHandler('OpenShareSheet', handleOpenShareSheet as any);
        bridge.registerHandler('OpenDocument', handleOpenDocument as any);
        bridge.registerHandler('RequestPermission', handleRequestPermission as any);
        bridge.registerHandler('GetContacts', handleGetContacts as any);
        bridge.registerHandler('OpenCamera', handleOpenCamera as any);
        bridge.registerHandler('OAuthLogin', handleOAuthLogin as any);
        bridge.registerHandler('OAuthLogout', handleOAuthLogout as any);

        // IAP
        bridge.registerHandler('FetchProducts', fetchProducts as any);
        bridge.registerHandler('FetchCurrentPurchases', fetchCurrentPurchases as any);
        bridge.registerHandler('Purchase', handlePurchaseSubscription as any);
        bridge.registerHandler('FinishPurchaseTransaction', handleFinishPurchase as any);
        bridge.registerHandler('OpenSubscriptionManagement', handleOpenSubscriptionManagement as any);

        return () => {
            const types: WebMessageType[] = [
                'OpenShareSheet',
                'OpenDocument',
                'RequestPermission',
                'GetContacts',
                'OpenCamera',
                'OAuthLogin',
                'OAuthLogout',
                'FetchProducts',
                'FetchCurrentPurchases',
                'Purchase',
                'FinishPurchaseTransaction',
                'OpenSubscriptionManagement',
            ];
            types.forEach(type => bridge.unregisterHandler(type));
        };
    }, [
        bridge,
        handleOpenShareSheet,
        handleOpenDocument,
        handleRequestPermission,
        handleGetContacts,
        handleOpenCamera,
        handleOAuthLogin,
        handleOAuthLogout,
        fetchProducts,
        fetchCurrentPurchases,
        handlePurchaseSubscription,
        handleFinishPurchase,
        handleOpenSubscriptionManagement,
    ]);

    // 이벤트 테스트용 함수 (새 규격에 맞는 이벤트 사용)
    const sendTestEventToWeb = () => {
        const testEvent = {
            type: 'OnReceiveNotification',
            success: true,
            data: {
                notification: {
                    title: 'Native Push',
                    body: 'App에서 Web으로 테스트 이벤트를 전송했습니다.',
                },
            },
        } as const;

        bridge.pushEvent<'OnReceiveNotification'>(testEvent);
        addLog('sent', `App -> Web: Sent ${testEvent.type}`);
    };

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'sent') color = '#4A90E2';
        if (item.type === 'received') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';
        if (item.type === 'info') color = '#F5A623';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>{item.message}</Text>
            </View>
        );
    };

    const testHtml = `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <style>
                    body {
                        background-color: #121212;
                        color: #FFFFFF;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        padding: 16px;
                        margin: 0;
                    }
                    h2 {
                        font-size: 16px;
                        margin: 0 0 16px 0;
                        color: #FFFFFF;
                        font-weight: bold;
                    }
                    .button-container {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                        margin-bottom: 16px;
                    }
                    button {
                        background-color: #333333;
                        color: #FFFFFF;
                        border: 1px solid #444444;
                        padding: 12px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        width: 100%;
                    }
                    button:active {
                        background-color: #444444;
                    }
                    .log-container {
                        background-color: #000000;
                        border: 1px solid #333333;
                        border-radius: 8px;
                        padding: 12px;
                        height: 120px;
                        overflow-y: auto;
                        font-family: monospace;
                        font-size: 11px;
                    }
                    .log-item {
                        margin-bottom: 4px;
                        word-break: break-all;
                        border-bottom: 1px solid #222;
                        padding-bottom: 2px;
                    }
                    .log-time {
                        color: #666;
                        margin-right: 6px;
                    }
                    .log-msg {
                        color: #DDD;
                    }
                    .log-received { color: #50E3C2; }
                    .log-sent { color: #4A90E2; }
                    .log-error { color: #FF5A5F; }
                </style>
            </head>
            <body>
                <h2>WebView Area (Mock)</h2>

                <div class="button-container">
                    <button onclick="sendToNative({ type: 'OAuthLogin', payload: { provider: 'google' } })">Google Login</button>
                    <button onclick="sendToNative({ type: 'OAuthLogin', payload: { provider: 'apple' } })">Apple Login</button>
                    <button onclick="sendToNative({ type: 'OAuthLogout', payload: { provider: 'google' } })">Google Logout</button>
                    <button onclick="sendToNative({ type: 'OAuthLogout', payload: { provider: 'apple' } })">Apple Logout</button>
                    <button onclick="sendToNative({ type: 'GetContacts' })">Get Contacts</button>
                    <button onclick="sendToNative({ type: 'OpenCamera', payload: { mediaType: 'photo' } })">Open Camera</button>
                    <button onclick="sendToNative({ type: 'RequestPermission', payload: { permission: 'CAMERA' } })">Req Cam Perm</button>
                    <button onclick="sendToNative({ type: 'OpenShareSheet', payload: { message: 'Hello from WebView!' } })">Open Share</button>
                    <button onclick="sendToNative({ type: 'OpenDocument', payload: { allowMultiSelection: true } })">Open Document</button>

                    <button onclick="sendToNative({ type: 'FetchProducts' })">IAP: Fetch Products</button>
                    <button onclick="sendToNative({ type: 'FetchCurrentPurchases' })">IAP: Fetch Purchases</button>
                    <button onclick="sendToNative({ type: 'Purchase', payload: { id: 'TEST_SKU' }})">IAP: Buy Subscription</button>
                    <button onclick="sendToNative({ type: 'OpenSubscriptionManagement' })">IAP: Manage</button>
                </div>

                <div id="log" class="log-container">
                    <div class="log-item"><span class="log-msg">Ready...</span></div>
                </div>

            <script>
             function log(msg, type = '') {
                    const el = document.getElementById('log');
                    const time = new Date().toLocaleTimeString('ko-KR', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });
                    const typeClass = type ? 'log-' + type : '';

                    const item = document.createElement('div');
                    item.className = 'log-item';
                    item.innerHTML = '<span class="log-time">[' + time + ']</span><span class="log-msg ' + typeClass + '">' + msg + '</span>';

                    el.appendChild(item);
                    el.scrollTop = el.scrollHeight;
                }

                const handleMessage = (event) => {
                    try {
                        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                        log('Received: ' + JSON.stringify(data), 'received');
                    } catch (e) {
                       log('Received: ' + JSON.stringify(e), 'received');
                    }
                };

                window.addEventListener('message', handleMessage);
                document.addEventListener('message', handleMessage);

                function sendToNative(msg) {
                    // 메타데이터 자동 주입 (웹 브릿지 클라이언트의 역할을 모방)
                    msg.refId = Math.random().toString(36).substring(2, 9);
                    msg.version = '2.0.0';

                    const messageStr = JSON.stringify(msg);
                    let sent = false;

                    try {
                        if (window.ChaticMessageHandler && typeof window.ChaticMessageHandler.postMessage === 'function') {
                            window.ChaticMessageHandler.postMessage(messageStr);
                            log('Sent (Android): ' + messageStr, 'sent');
                            sent = true;
                        }
                        else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ChaticMessageHandler) {
                            window.webkit.messageHandlers.ChaticMessageHandler.postMessage(messageStr);
                            log('Sent (iOS): ' + messageStr, 'sent');
                            sent = true;
                        }
                        else if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(messageStr);
                            log('Sent (RN Standard): ' + messageStr, 'sent');
                            sent = true;
                        }
                        if (!sent) {
                            log('Error: No Handler found (ChaticMessageHandler)', 'error');
                        }
                    } catch (e) {
                        log('Error: ' + e.message, 'error');
                    }
                }
            </script>
            </body>
        </html>
    `;

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            <View style={styles.webViewContainer}>
                <WebView
                    ref={webViewRef}
                    source={{ html: testHtml }}
                    onMessage={handleWebViewMessage}
                    style={{ flex: 1, backgroundColor: '#121212' }}
                    containerStyle={{ backgroundColor: '#121212' }}
                />
            </View>

            <View style={styles.logHeader}>
                <Text style={styles.logTitle}>Native Logs</Text>
                <TouchableOpacity onPress={handleClearLogs}>
                    <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                ref={flatListRef}
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>로그가 비어있습니다.</Text>}
            />

            <View style={styles.bottomContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollActionContainer}
                >
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#4A90E2' }]}
                        onPress={sendTestEventToWeb}
                    >
                        <Text style={styles.buttonText}>App to Web Push (Notification)</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#121212',
    },
    webViewContainer: {
        height: 350,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#1E1E1E',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    logTitle: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    clearButtonText: {
        color: '#888',
        fontSize: 12,
    },
    logList: {
        flex: 1,
        backgroundColor: '#000000',
    },
    logContent: {
        padding: 16,
    },
    logRow: {
        marginBottom: 8,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    logTime: {
        color: '#666',
        fontSize: 12,
        marginRight: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logText: {
        fontSize: 14,
        flex: 1,
    },
    emptyText: {
        color: '#444',
        textAlign: 'center',
        marginTop: 20,
    },
    bottomContainer: {
        backgroundColor: '#1E1E1E',
        borderTopWidth: 1,
        borderTopColor: '#333',
        paddingVertical: 12,
    },
    scrollActionContainer: {
        paddingHorizontal: 12,
        alignItems: 'center',
        gap: 8,
    },
    actionButton: {
        height: 44,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        opacity: 0.9,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
