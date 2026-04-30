import React, { useRef, useState, useEffect } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEFAULT_APP_ICON_NAME, dynamicAppIconService } from '../../../common';

type LogType = 'info' | 'success' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

export const AppIconTestScreen = () => {
    const insets = useSafeAreaInsets();
    const [logs, setLogs] = useState<LogItem[]>([]);

    const [currentIconName, setCurrentIconName] = useState('unknown');
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        handleFetchCurrentIcon();
    }, []);

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

    const handleClearLogs = () => {
        setLogs([]);
    };

    const handleFetchCurrentIcon = async () => {
        try {
            addLog('info', 'Fetching current app icon...');
            const name = await dynamicAppIconService.fetchCurrentIcon();
            setCurrentIconName(name);
            addLog('success', `Current Icon is: ${name}`);
        } catch (e: any) {
            addLog('error', `Fetch Failed: ${e.message}`);
        }
    };

    const handleSetIcon = async (iconName?: string | null) => {
        try {
            const targetName = iconName ?? DEFAULT_APP_ICON_NAME;
            addLog('info', `Attempting to set icon: ${targetName}...`);

            const isSuccess = await dynamicAppIconService.setAppIcon(iconName);

            if (isSuccess) {
                addLog('success', `Successfully changed to: ${targetName}`);
                await handleFetchCurrentIcon();
            } else {
                addLog('error', `Failed to change icon to: ${targetName}`);
            }
        } catch (e: any) {
            addLog('error', `Exception caught: ${e.message}`);
        }
    };

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'success') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';
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
            <View style={styles.header}>
                <Text style={styles.headerTitle}>App Icon Tester</Text>
                <TouchableOpacity onPress={handleClearLogs} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>Clear Logs</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.statusContainer}>
                <Text style={styles.statusText}>Platform: {Platform.OS}</Text>
                <Text style={styles.statusText}>Current Config: {currentIconName}</Text>
            </View>

            <FlatList
                ref={flatListRef}
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>No logs.</Text>}
            />

            <View style={styles.bottomContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollActionContainer}
                >
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#4A90E2' }]}
                        onPress={handleFetchCurrentIcon}
                    >
                        <Text style={styles.buttonText}>현재 아이콘 확인</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {/* ✨ 단일 진실 공급원 기반 동적 버튼 렌더링 ✨ */}
                    {dynamicAppIconService.getAvailableIcons().map(iconOption => {
                        const isCurrent = currentIconName === (iconOption.id || DEFAULT_APP_ICON_NAME);
                        return (
                            <TouchableOpacity
                                key={iconOption.id || 'default'}
                                style={[styles.actionButton, { backgroundColor: isCurrent ? '#27AE60' : '#333' }]}
                                onPress={() => handleSetIcon(iconOption.id)}
                            >
                                <Text style={styles.buttonText}>{iconOption.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#121212' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1E1E1E',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    clearButton: { padding: 8 },
    clearButtonText: { color: '#888', fontSize: 12 },
    statusContainer: {
        padding: 16,
        backgroundColor: '#181818',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        gap: 8,
    },
    statusText: { color: '#CCCCCC', fontSize: 13, fontWeight: 'bold' },
    logList: { flex: 1, backgroundColor: '#000000' },
    logContent: { padding: 16 },
    logRow: { marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap' },
    logTime: {
        color: '#666',
        fontSize: 12,
        marginRight: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logText: { fontSize: 14, flex: 1 },
    emptyText: { color: '#444', textAlign: 'center', marginTop: 20 },
    bottomContainer: {
        backgroundColor: '#1E1E1E',
        borderTopWidth: 1,
        borderTopColor: '#333',
        paddingVertical: 12,
    },
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
    divider: {
        width: 1,
        height: '100%',
        backgroundColor: '#333',
        marginHorizontal: 8,
    },
});
