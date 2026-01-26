import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeviceId, useWebSocket } from '../../../common';

import type { ClientStatusType, ClientSyncPayload, WSSConnectParam, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

type LogType = 'sent' | 'received' | 'info' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

const socketUrl: string = process.env.VITE_WS_ENDPOINT || '';

export const SocketTestScreen = () => {
    const STATUS_ICONS: Record<ClientStatusType, string> = {
        green: '🟢',
        yellow: '🟡',
        red: '🔴',
        '': '⚪',
    };

    const insets = useSafeAreaInsets();
    const deviceId = useDeviceId();

    const { isConnected, lastMessage, connect, disconnect, sendMessage } = useWebSocket<
        WSSEnvelope,
        WSSEnvelope,
        WSSConnectParam
    >(socketUrl, {
        params: {
            deviceId: deviceId ?? undefined,
            deviceName: deviceId ? 'TEST:' + deviceId : undefined,
        } as WSSConnectParam,
        enabled: !!deviceId,
    });

    const [logs, setLogs] = useState<LogItem[]>([]);
    const [clientStatus, setClientStatus] = useState<ClientStatusType>('');
    const [lastMessageId, setLastMessageId] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const flatListRef = useRef<FlatList>(null);
    const statusIcon = STATUS_ICONS[clientStatus];

    const createSystemInfoMessage = (): WSSEnvelope => ({
        type: 'system',
        action: 'info',
    });

    const createSyncInfoMessage = (): WSSEnvelope => ({
        type: 'sync',
        action: 'info',
    });

    const createStatusMessage = (
        status: ClientStatusType,
        tick: number,
        lastMessageId: string
    ): WSSEnvelope<ClientSyncPayload> => ({
        type: 'sync',
        action: 'update',
        payload: {
            tick: tick,
            ref: lastMessageId,
            status: status,
        } as ClientSyncPayload,
    });

    /**
     * 로그 추가하기
     * @param type 로그 타입 색상 표기 목적
     * @param message 로그 본문
     */
    const addLog = (type: LogType, message: string) => {
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
    };

    const checkConnection = (): boolean => {
        if (!isConnected) {
            Alert.alert('알림', '먼저 서버에 연결(Connect)해주세요.');
            return false;
        }
        return true;
    };

    /**
     * 디바이스 정보 요청
     */
    const handleSendSystemInfo = () => {
        if (!checkConnection()) return;
        const systemInfoMessage: WSSEnvelope = createSystemInfoMessage();

        sendMessage(systemInfoMessage);
        addLog('sent', `[Info] ${JSON.stringify(systemInfoMessage)}`);
    };

    /**
     * 동기화 정보 요청
     */
    const handleSendSyncInfo = () => {
        if (!checkConnection()) return;
        const syncInfoMessage: WSSEnvelope = createSyncInfoMessage();

        sendMessage(syncInfoMessage);
        addLog('sent', `[Info] ${JSON.stringify(syncInfoMessage)}`);
    };

    /**
     * 상태 변경
     * @param status red | green | yellow
     */
    const handleChangeStatus = (status: ClientStatusType) => {
        if (!checkConnection()) return;
        if (!lastMessageId) return;

        const statusMessage = createStatusMessage(status, tick, lastMessageId);

        sendMessage(statusMessage);

        let icon = '';
        switch (status) {
            case 'red':
                icon = '🔴';
                break;
            case 'yellow':
                icon = '🟡';
                break;
            case 'green':
                icon = '🟢';
                break;
            default:
                icon = '⚪';
                break;
        }
        addLog('sent', `${icon} [Status:${status}] ${JSON.stringify(statusMessage)}`);
    };

    /**
     * 로그 텍스트 UI 컴포넌트 렌더링
     * @param item
     */
    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'sent') color = '#4A90E2';
        if (item.type === 'received') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>{item.message}</Text>
            </View>
        );
    };

    /**
     * 최초 연결시, 소켓 정보 읽어오기
     */
    useEffect(() => {
        if (isConnected) {
            addLog('info', '서버에 연결되었습니다. 상태 정보를 요청합니다...');
            try {
                const systemInfoMessage: WSSEnvelope = createSystemInfoMessage();
                const syncInfoMessage: WSSEnvelope = createSyncInfoMessage();

                sendMessage(systemInfoMessage);
                sendMessage(syncInfoMessage);
            } catch {
                addLog('error', '초기 메시지 전송 실패');
            }
        }
    }, [isConnected]);

    /**
     * 응답 데이터 도착 시 핸들링
     */
    useEffect(() => {
        if (!lastMessage) return;

        if (lastMessage.action === 'pong') return;
        if (lastMessage.action === 'ping') return;

        addLog('received', lastMessage.action);
        addLog('received', JSON.stringify(lastMessage.payload, null, 2));

        if (lastMessage.type === 'sync' && lastMessage.payload) {
            const payload = lastMessage.payload as ClientSyncPayload;

            if (lastMessage.payload.id) {
                setLastMessageId(lastMessage.payload.id);
            }

            setClientStatus(payload.status);
            setTick(payload.tick);
        }

        addLog('received', JSON.stringify(lastMessage, null, 2));
    }, [lastMessage]);

    return (
        <KeyboardAvoidingView
            style={[styles.screen, { paddingBottom: insets.bottom }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={styles.controlPanel}>
                <View>
                    <View style={styles.statusIndicator}>
                        <View style={[styles.dot, { backgroundColor: isConnected ? '#50E3C2' : '#FF5A5F' }]} />
                        <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
                    </View>

                    <View style={styles.infoContainer}>
                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Client Status:</Text>
                            <Text style={styles.deviceStatusValue}>
                                {statusIcon} {clientStatus}
                            </Text>
                        </View>
                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Device ID:</Text>
                            <Text
                                style={[styles.deviceStatusValue, { fontSize: 10, color: '#AAA' }]}
                                numberOfLines={1}
                                ellipsizeMode="middle"
                            >
                                {deviceId ?? 'Unknown'}
                            </Text>
                        </View>

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Server Tick:</Text>
                            <Text style={styles.deviceStatusValue}>#{tick}</Text>
                        </View>

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Last Msg ID:</Text>
                            <Text style={[styles.deviceStatusValue, { fontSize: 10, color: '#AAA' }]}>
                                {lastMessageId ?? '-'}
                            </Text>
                        </View>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.connectButton, { backgroundColor: isConnected ? '#FF5A5F' : '#4A90E2' }]}
                    onPress={isConnected ? disconnect : connect}
                >
                    <Text style={styles.buttonText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
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
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#8E44AD', marginRight: 8 }]}
                        onPress={handleSendSystemInfo}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>System Info</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#2980B9' }]}
                        onPress={handleSendSyncInfo}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Sync Info</Text>
                    </TouchableOpacity>
                </View>

                <Text style={styles.sectionLabel}>Change Status</Text>
                <View style={styles.statusRow}>
                    <TouchableOpacity
                        style={[styles.statusButton, { backgroundColor: '#FF5A5F' }]} // Red
                        onPress={() => handleChangeStatus('red')}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Red</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.statusButton, { backgroundColor: '#F5A623', marginHorizontal: 8 }]} // Yellow
                        onPress={() => handleChangeStatus('yellow')}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Yellow</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.statusButton, { backgroundColor: '#50E3C2' }]} // Green
                        onPress={() => handleChangeStatus('green')}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Green</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#121212',
    },
    controlPanel: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start', // 상단 정렬로 변경
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    dot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    statusText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // ★ 복구 및 개선된 스타일
    infoContainer: {
        gap: 4, // 간격 조정
    },
    deviceStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    deviceStatusLabel: {
        color: '#888',
        fontSize: 12,
        width: 80,
    },
    deviceStatusValue: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    connectButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginTop: 4,
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
        padding: 12,
    },
    actionRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    actionButton: {
        flex: 1,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        opacity: 0.9,
    },
    sectionLabel: {
        color: '#888',
        fontSize: 12,
        marginBottom: 6,
        marginLeft: 2,
    },
    statusRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    statusButton: {
        flex: 1,
        height: 36,
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
