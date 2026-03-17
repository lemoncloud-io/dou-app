import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    LayoutAnimation,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { oAuthService } from '../../../common/services/oauth';
import { logger } from '../../../common';
import type { OAuthLoginProvider, OAuthTokenResult } from '@chatic/app-messages';

type LogType = 'info' | 'error' | 'success' | 'warn';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
    data?: any;
}

export const OAuthTestScreen = () => {
    const insets = useSafeAreaInsets();
    const [result, setResult] = useState<OAuthTokenResult | null>(null);
    const [loading, setLoading] = useState<OAuthLoginProvider | 'logout' | null>(null);
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        const unsubscribe = logger.subscribe((level, tag, message, data, error) => {
            if (tag !== 'OAUTH') return;

            let type: LogType = 'info';
            if (level === 'error') type = 'error';
            if (level === 'warn') type = 'warn';
            if (message.includes('Success')) type = 'success';

            addLog(type, message, data || error);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const addLog = (type: LogType, message: string, data?: any) => {
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
            data,
        };

        setLogs(prev => [...prev, newLog]);

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const handleLogin = async (provider: OAuthLoginProvider) => {
        setLoading(provider);
        setResult(null);
        try {
            const tokenResult = await oAuthService.login(provider);
            if (tokenResult) {
                setResult(tokenResult);
                addLog('success', `${provider} Login Result`, tokenResult);
            }
        } finally {
            setLoading(null);
        }
    };

    const handleLogout = async (provider: OAuthLoginProvider) => {
        setLoading('logout');
        try {
            await oAuthService.logout(provider);
            setResult(null);
        } finally {
            setLoading(null);
        }
    };

    const togglePanel = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'success') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';
        if (item.type === 'warn') color = '#F5A623';

        return (
            <View style={styles.logRow}>
                <View style={styles.logHeader}>
                    <Text style={styles.logTime}>[{item.timestamp}]</Text>
                    <Text style={[styles.logText, { color }]}>{item.message}</Text>
                </View>
                {item.data && <Text style={styles.logData}>{JSON.stringify(item.data, null, 2)}</Text>}
            </View>
        );
    };

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            {/* 상단 컨트롤 패널 */}
            <View style={styles.controlPanel}>
                <TouchableOpacity style={styles.panelHeader} onPress={togglePanel} activeOpacity={0.7}>
                    <View style={styles.statusRow}>
                        <View style={[styles.dot, { backgroundColor: result ? '#50E3C2' : '#888' }]} />
                        <Text style={styles.statusText}>{result ? 'Authenticated' : 'Not Authenticated'}</Text>
                    </View>
                    <Text style={styles.toggleIcon}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && result && (
                    <View style={styles.infoContainer}>
                        <View style={styles.dividerHorizontal} />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Provider:</Text>
                            <Text style={styles.infoValue}>{result.provider}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Platform:</Text>
                            <Text style={styles.infoValue}>{result.platform}</Text>
                        </View>
                        {'user' in result && result.user && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>User ID:</Text>
                                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="middle">
                                    {typeof result.user === 'string' ? result.user : JSON.stringify(result.user)}
                                </Text>
                            </View>
                        )}
                        {'email' in result && result.email && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Email:</Text>
                                <Text style={styles.infoValue}>{result.email}</Text>
                            </View>
                        )}
                        {'accessToken' in result && result.accessToken && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>AccessToken:</Text>
                                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                                    {result.accessToken}
                                </Text>
                            </View>
                        )}
                        {'idToken' in result && result.idToken && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>ID Token:</Text>
                                <Text style={styles.infoValue} numberOfLines={1} ellipsizeMode="tail">
                                    {result.idToken}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
            </View>

            {/* 로그 리스트 */}
            <FlatList
                ref={flatListRef}
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>로그 대기 중...</Text>}
            />

            {/* 하단 액션 버튼 */}
            <View style={styles.bottomContainer}>
                <View style={styles.actionContainer}>
                    {/* Google */}
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#DB4437', flex: 1 }]}
                        onPress={() => handleLogin('google')}
                        disabled={!!loading}
                    >
                        {loading === 'google' ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <Text style={styles.buttonText}>Google Login</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#757575', width: 80 }]}
                        onPress={() => handleLogout('google')}
                        disabled={!!loading}
                    >
                        <Text style={styles.buttonText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                {Platform.OS === 'ios' && (
                    <View style={[styles.actionContainer, { marginTop: 8 }]}>
                        {/* Apple */}
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#000000', flex: 1 }]}
                            onPress={() => handleLogin('apple')}
                            disabled={!!loading}
                        >
                            {loading === 'apple' ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.buttonText}>Apple Login</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#757575', width: 80 }]}
                            onPress={() => handleLogout('apple')}
                            disabled={!!loading}
                        >
                            <Text style={styles.buttonText}>Logout</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#121212',
    },
    controlPanel: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        backgroundColor: '#1E1E1E',
    },
    panelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusRow: {
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
    toggleIcon: {
        color: '#888',
        fontSize: 12,
    },
    infoContainer: {
        marginTop: 4,
    },
    dividerHorizontal: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 12,
    },
    infoRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    infoLabel: {
        color: '#888',
        fontSize: 12,
        width: 80,
    },
    infoValue: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: 'bold',
        flex: 1,
    },
    logList: {
        flex: 1,
        backgroundColor: '#000000',
    },
    logContent: {
        padding: 16,
    },
    logRow: {
        marginBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        paddingBottom: 8,
    },
    logHeader: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    logTime: {
        color: '#666',
        fontSize: 11,
        marginRight: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logText: {
        fontSize: 13,
        flex: 1,
        fontWeight: '500',
    },
    logData: {
        color: '#888',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginLeft: 4,
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
        padding: 16,
    },
    actionContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
