import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeviceId } from '../../../common';
import { useWebSocket } from '../../../common';

import type { DeviceStatus, WSSConnectParam, WSSEnvelope } from '@lemoncloud/chatic-sockets-api';

// 1. 고정된 시스템 메시지 정의
const MSG_INFO: WSSEnvelope = {
    type: 'system',
    action: 'info',
};

// 로그 타입 정의
type LogType = 'sent' | 'received' | 'info' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

const socketUrl: string = process.env.VITE_WS_ENDPOINT || '';

export const SocketTestScreen = () => {
    const insets = useSafeAreaInsets();
    const deviceId = useDeviceId();

    const { isConnected, lastMessage, connect, disconnect, sendMessage } = useWebSocket<
        WSSEnvelope,
        WSSEnvelope,
        WSSConnectParam
    >(socketUrl, {
        params: {
            deviceId: deviceId ?? undefined,
            deviceName: '레인의 디바이스',
        } as WSSConnectParam,
        enabled: !!deviceId,
        debug: true,
    });

    // 2. UI 상태 관리
    const [text, setText] = useState('');
    const [logs, setLogs] = useState<LogItem[]>([]);

    // ★ 디바이스 현재 상태 (서버에서 받은 값 저장)
    const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | 'unknown'>('unknown');

    const flatListRef = useRef<FlatList>(null);

    // 로그 추가 헬퍼
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

    // 3. [Logic] 연결되면 자동으로 Info 요청 (초기 상태 조회)
    useEffect(() => {
        if (isConnected) {
            addLog('info', '✅ 서버에 연결되었습니다. 상태 정보를 요청합니다...');

            // ★ 연결 직후 Info 메시지 자동 전송
            sendMessage(MSG_INFO);
            addLog('sent', `[Auto-Init] ${JSON.stringify(MSG_INFO)}`);
        } else {
            if (logs.length > 0) {
                addLog('error', '❌ 연결이 해제되었습니다.');
                setDeviceStatus('unknown'); // 연결 끊기면 상태도 초기화
            }
        }
    }, [isConnected]);

    // 4. [Logic] 메시지 수신 처리 및 상태($device.status) 파싱
    useEffect(() => {
        if (lastMessage) {
            if (lastMessage.action === 'pong') return;

            if (lastMessage.payload && lastMessage.payload.status) {
                setDeviceStatus(lastMessage.payload.status);
            }

            // 로그 남기기
            const messageString =
                typeof lastMessage === 'object' ? JSON.stringify(lastMessage, null, 2) : String(lastMessage);
            addLog('received', messageString);
        }
    }, [lastMessage]);

    // 연결 체크 공통 함수
    const checkConnection = (): boolean => {
        if (!isConnected) {
            Alert.alert('알림', '먼저 서버에 연결(Connect)해주세요.');
            return false;
        }
        return true;
    };

    // Info 전송 핸들러 (수동 요청용)
    const handleSendInfo = () => {
        if (!checkConnection()) return;
        sendMessage(MSG_INFO);
        addLog('sent', `[Info] ${JSON.stringify(MSG_INFO)}`);
    };

    // 상태 변경 핸들러
    const handleChangeStatus = (status: 'red' | 'green' | 'yellow') => {
        if (!checkConnection()) return;

        const statusMsg: WSSEnvelope = {
            type: 'presence',
            action: 'status',
            payload: {
                status: status as DeviceStatus,
            },
        };

        sendMessage(statusMsg);

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
        addLog('sent', `${icon} [Status:${status}] ${JSON.stringify(statusMsg)}`);
    };

    // 커스텀 메시지 전송
    const handleSendMessage = () => {
        if (!text.trim()) return;
        if (!checkConnection()) return;

        const customMsg: WSSEnvelope = {
            type: 'system',
            action: 'message',
            payload: {
                message: text,
            },
        };

        sendMessage(customMsg);
        addLog('sent', JSON.stringify(customMsg));
        setText('');
    };

    // 로그 렌더링
    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'sent') color = '#4A90E2';
        if (item.type === 'received') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>
                    {item.type === 'sent' ? '📤 ' : item.type === 'received' ? '📥 ' : ''}
                    {item.message}
                </Text>
            </View>
        );
    };

    // ★ 상태 아이콘 헬퍼
    const getStatusIcon = () => {
        switch (deviceStatus) {
            case 'green':
                return '🟢';
            case 'yellow':
                return '🟡';
            case 'red':
                return '🔴';
            default:
                return '⚪';
        }
    };

    return (
        <KeyboardAvoidingView
            style={[styles.screen, { paddingBottom: insets.bottom }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            {/* 상단 컨트롤 패널 */}
            <View style={styles.controlPanel}>
                <View>
                    {/* 연결 상태 */}
                    <View style={styles.statusIndicator}>
                        <View style={[styles.dot, { backgroundColor: isConnected ? '#50E3C2' : '#FF5A5F' }]} />
                        <Text style={styles.statusText}>{isConnected ? 'Connected' : 'Disconnected'}</Text>
                    </View>

                    {/* ★ 추가됨: 디바이스 상태 표시 */}
                    <View style={styles.deviceStatusRow}>
                        <Text style={styles.deviceStatusLabel}>Device Status:</Text>
                        <Text style={styles.deviceStatusValue}>
                            {getStatusIcon()} {deviceStatus}
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.connectButton, { backgroundColor: isConnected ? '#FF5A5F' : '#4A90E2' }]}
                    onPress={isConnected ? disconnect : connect}
                >
                    <Text style={styles.buttonText}>{isConnected ? 'Disconnect' : 'Connect'}</Text>
                </TouchableOpacity>
            </View>

            {/* 로그 리스트 */}
            <FlatList
                ref={flatListRef}
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>로그가 비어있습니다.</Text>}
            />

            {/* 하단 컨트롤 영역 */}
            <View style={styles.bottomContainer}>
                {/* 1. 빠른 액션 */}
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#8E44AD' }]}
                        onPress={handleSendInfo}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Info</Text>
                    </TouchableOpacity>
                </View>

                {/* 2. 상태 변경 버튼 */}
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

                {/* 3. 메시지 입력창 */}
                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        value={text}
                        onChangeText={setText}
                        placeholder="메시지 입력 (payload.message)"
                        placeholderTextColor="#666"
                        onSubmitEditing={handleSendMessage}
                        returnKeyType="send"
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, { opacity: isConnected ? 1 : 0.5 }]}
                        onPress={handleSendMessage}
                        disabled={!isConnected}
                    >
                        <Text style={styles.buttonText}>Send</Text>
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
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
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
    // ★ 추가됨: 디바이스 상태 스타일
    deviceStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
    },
    deviceStatusLabel: {
        color: '#888',
        fontSize: 12,
        marginRight: 6,
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
    inputRow: {
        flexDirection: 'row',
        marginTop: 4,
    },
    input: {
        flex: 1,
        backgroundColor: '#333',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#FFFFFF',
        marginRight: 10,
    },
    sendButton: {
        backgroundColor: '#4A90E2',
        justifyContent: 'center',
        paddingHorizontal: 20,
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
