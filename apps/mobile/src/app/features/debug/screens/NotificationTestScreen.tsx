import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { AuthorizationStatus } from '@react-native-firebase/messaging';
import { useServices } from '../../../hooks';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

type LogType = 'info' | 'success' | 'error' | 'event';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

export const NotificationTestScreen = () => {
    const insets = useSafeAreaInsets();
    const { notificationService, firebaseInstallationService } = useServices();
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [token, setToken] = useState<string>('');
    const [installId, setInstallId] = useState<string>('');
    const [permissionStatus, setPermissionStatus] = useState<string>('Checking...');
    const [isExpanded, setIsExpanded] = useState(true);

    // 수신된 Data 페이로드를 화면에 표시하기 위한 상태
    const [receivedData, setReceivedData] = useState<any>(null);

    const flatListRef = useRef<FlatList>(null);

    const togglePanel = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    /**
     * 로그 추가하기
     */
    const addLog = useCallback(
        (type: LogType, message: string) => {
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
        },
        [setLogs]
    );

    /**
     * 권한 상태 확인
     */
    const checkPermission = useCallback(async () => {
        try {
            const authStatus = await notificationService.hasPermission();
            let statusStr = '';
            switch (authStatus) {
                case AuthorizationStatus.NOT_DETERMINED:
                    statusStr = 'NOT_DETERMINED';
                    break;
                case AuthorizationStatus.DENIED:
                    statusStr = 'DENIED';
                    break;
                case AuthorizationStatus.AUTHORIZED:
                    statusStr = 'AUTHORIZED';
                    break;
                case AuthorizationStatus.PROVISIONAL:
                    statusStr = 'PROVISIONAL';
                    break;
                case AuthorizationStatus.EPHEMERAL:
                    statusStr = 'EPHEMERAL';
                    break;
                default:
                    statusStr = 'UNKNOWN';
                    break;
            }
            setPermissionStatus(statusStr);
            addLog('info', `Permission Status: ${statusStr}`);
        } catch (error: any) {
            addLog('error', `Check Permission Failed: ${error.message}`);
        }
    }, [addLog, notificationService, setPermissionStatus]);

    /**
     * 권한 요청
     */
    const handleRequestPermission = useCallback(async () => {
        try {
            addLog('info', 'Requesting permission...');
            const enabled = await notificationService.requestPermission();
            addLog(enabled ? 'success' : 'error', `Request Result: ${enabled ? 'Granted' : 'Denied'}`);
            await checkPermission();
        } catch (error: any) {
            addLog('error', `Request Permission Error: ${error.message}`);
        }
    }, [addLog, checkPermission, notificationService]);

    /**
     * Device Token 가져오기
     */
    const handleGetToken = useCallback(async () => {
        try {
            addLog('info', `Fetching ${Platform.OS === 'ios' ? 'APNs' : 'FCM'} Token...`);

            let token: string | null = null;

            if (Platform.OS === 'ios') {
                await notificationService.registerAPNs();
                token = await notificationService.getAPNSToken();
            } else {
                token = await notificationService.getToken();
            }

            if (token) {
                setToken(token);
                addLog('success', `${Platform.OS === 'ios' ? 'APNs' : 'FCM'} Token Received`);
            } else {
                addLog(
                    'error',
                    `Failed to get token (null). Check ${Platform.OS === 'ios' ? 'APNs' : 'FCM'} settings.`
                );
            }
        } catch (error: any) {
            addLog('error', `Get Token Error: ${error.message}`);
        }
    }, [addLog, notificationService, setToken]);

    /**
     * Firebase Installation ID 가져오기
     */
    const handleGetInstallId = useCallback(async () => {
        try {
            addLog('info', 'Fetching Firebase Installation ID...');
            const id = await firebaseInstallationService.getFirebaseId();

            if (id) {
                setInstallId(id);
                addLog('success', 'Installation ID Received');
            } else {
                addLog('error', 'Failed to get Installation ID (null)');
            }
        } catch (error: any) {
            addLog('error', `Get Install ID Error: ${error.message}`);
        }
    }, [addLog, firebaseInstallationService, setInstallId]);

    /**
     * iOS APNs 기기 등록 (수동)
     */
    const handleRegisterDevice = useCallback(async () => {
        if (Platform.OS !== 'ios') {
            Alert.alert('Info', 'iOS Only');
            return;
        }
        try {
            addLog('info', 'Registering for Remote Messages (APNs)...');
            await notificationService.registerAPNs();
            addLog('success', 'APNs Registration Call Completed');
        } catch (error: any) {
            addLog('error', `APNs Register Error: ${error.message}`);
        }
    }, [addLog, notificationService]);

    /**
     * 토큰 삭제 (Refresh 테스트용)
     */
    const handleDeleteToken = useCallback(async () => {
        try {
            await notificationService.deleteToken();
            setToken('');
            addLog('info', 'Token Deleted. Request new token to refresh.');
        } catch (error: any) {
            addLog('error', `Delete Token Error: ${error.message}`);
        }
    }, [addLog, notificationService, setToken]);

    /**
     * 알림 데이터 파싱 헬퍼
     */
    const handleRemoteMessage = useCallback(
        (tag: string, remoteMessage: any) => {
            addLog('event', `[${tag}] RAW: ${JSON.stringify(remoteMessage)}`);

            const notification = remoteMessage?.notification ? JSON.stringify(remoteMessage.notification) : 'none';
            const data = remoteMessage?.data ? JSON.stringify(remoteMessage.data) : 'none';

            addLog('event', `[${tag}] Notification: ${notification}`);
            addLog('event', `[${tag}] Data: ${data}`);

            if (remoteMessage?.data) {
                setReceivedData(remoteMessage.data);
            }
        },
        [addLog, setReceivedData]
    );
    /**
     * 초기화 및 리스너 등록
     */
    useEffect(() => {
        addLog('info', 'Initializing Device Token listeners...');
        checkPermission();

        const unsubscribeOnMessage = notificationService.onMessage(async remoteMessage => {
            console.log(`TEST // ${remoteMessage}`);
            handleRemoteMessage('OpenedApp', remoteMessage);
        });

        const unsubscribeOnNotificationOpenedApp = notificationService.onNotificationOpenedApp(remoteMessage => {
            handleRemoteMessage('OpenedApp', remoteMessage);
        });

        const unsubscribeOnTokenRefresh = notificationService.onTokenRefresh(newToken => {
            setToken(newToken);
            addLog('event', `[TokenRefresh] New Token...`);
        });

        return () => {
            unsubscribeOnMessage();
            unsubscribeOnNotificationOpenedApp();
            unsubscribeOnTokenRefresh();
        };
    }, [addLog, checkPermission, handleRemoteMessage, notificationService, setToken]);

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'success') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';
        if (item.type === 'event') color = '#F5A623';
        if (item.type === 'info') color = '#4A90E2';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>{item.message}</Text>
            </View>
        );
    };

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            <View style={styles.controlPanel}>
                <View style={styles.panelHeader}>
                    <TouchableOpacity style={styles.statusIndicatorButton} onPress={togglePanel} activeOpacity={0.7}>
                        <View
                            style={[
                                styles.dot,
                                {
                                    backgroundColor:
                                        permissionStatus === 'AUTHORIZED' || permissionStatus === 'PROVISIONAL'
                                            ? '#50E3C2'
                                            : '#FF5A5F',
                                },
                            ]}
                        />
                        <Text style={styles.statusText}>Device Token Debugger</Text>
                        <Text style={styles.toggleIcon}>{isExpanded ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.refreshButton} onPress={checkPermission}>
                        <Text style={styles.buttonText}>Check Status</Text>
                    </TouchableOpacity>
                </View>

                {isExpanded && (
                    <View style={styles.infoContainer}>
                        <View style={styles.dividerHorizontal} />

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Permission:</Text>
                            <Text style={[styles.deviceStatusValue, { color: '#F5A623' }]}>{permissionStatus}</Text>
                        </View>

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Device Token:</Text>
                            <Text
                                style={[styles.deviceStatusValue, { fontSize: 10, color: '#AAA' }]}
                                numberOfLines={2}
                                ellipsizeMode="middle"
                                onPress={() => {
                                    if (token) {
                                        Clipboard.setString(token);
                                        Alert.alert('Copied', 'Token copied to clipboard');
                                        addLog('info', 'Token copied to clipboard');
                                    }
                                }}
                            >
                                {token || '(Not Fetched)'}
                            </Text>
                        </View>

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Install ID:</Text>
                            <Text
                                style={[styles.deviceStatusValue, { fontSize: 10, color: '#AAA' }]}
                                numberOfLines={2}
                                ellipsizeMode="middle"
                                onPress={() => {
                                    if (installId) {
                                        Clipboard.setString(installId);
                                        Alert.alert('Copied', 'Install ID copied to clipboard');
                                        addLog('info', 'Install ID copied to clipboard');
                                    }
                                }}
                            >
                                {installId || '(Not Fetched)'}
                            </Text>
                        </View>

                        {/* 가장 최근에 받은 Data 페이로드 표시 영역 */}
                        {receivedData && (
                            <View style={[styles.deviceStatusRow, { alignItems: 'flex-start', marginTop: 8 }]}>
                                <Text style={[styles.deviceStatusLabel, { color: '#50E3C2' }]}>Last Data:</Text>
                                <Text
                                    style={[styles.deviceStatusValue, { fontSize: 10, color: '#50E3C2' }]}
                                    numberOfLines={5}
                                >
                                    {JSON.stringify(receivedData, null, 2)}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
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
                        onPress={handleRequestPermission}
                    >
                        <Text style={styles.buttonText}>Req Perm</Text>
                    </TouchableOpacity>

                    {Platform.OS === 'ios' && (
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#8E44AD' }]}
                            onPress={handleRegisterDevice}
                        >
                            <Text style={styles.buttonText}>Reg APNs</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#50E3C2' }]}
                        onPress={handleGetToken}
                    >
                        <Text style={styles.buttonText}>Get Token</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#F39C12' }]}
                        onPress={handleGetInstallId}
                    >
                        <Text style={styles.buttonText}>Get FID</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#FF5A5F' }]}
                        onPress={handleDeleteToken}
                    >
                        <Text style={styles.buttonText}>Del Token</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#121212' },
    controlPanel: {
        flexDirection: 'column',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
    statusIndicatorButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
    toggleIcon: { color: '#888', fontSize: 12, marginLeft: 8 },
    infoContainer: { marginTop: 4, gap: 8 },
    dividerHorizontal: { height: 1, backgroundColor: '#333', marginVertical: 8 },
    deviceStatusRow: { flexDirection: 'row', alignItems: 'center' },
    deviceStatusLabel: { color: '#888', fontSize: 11, width: 85 },
    deviceStatusValue: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold', flex: 1 },
    refreshButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: '#333',
        alignItems: 'center',
    },
    logList: { flex: 1, backgroundColor: '#000000' },
    logContent: { padding: 16 },
    logRow: { marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap' },
    logTime: { color: '#666', fontSize: 12, marginRight: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    logText: { fontSize: 14, flex: 1 },
    emptyText: { color: '#444', textAlign: 'center', marginTop: 20 },
    bottomContainer: { backgroundColor: '#1E1E1E', borderTopWidth: 1, borderTopColor: '#333', paddingVertical: 12 },
    scrollActionContainer: { paddingHorizontal: 12, alignItems: 'center', gap: 8 },
    actionButton: {
        height: 44,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        opacity: 0.9,
    },
    buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
