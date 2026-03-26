import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { type ProductSubscription } from 'react-native-iap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSubscriptionIap } from '../../../common';
import { logger } from '../../../common';

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

export const IapTestScreen = () => {
    const insets = useSafeAreaInsets();
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const flatListRef = useRef<FlatList>(null);

    const togglePanel = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    /**
     * 로그 추가하기
     */
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

    // Logger 서비스 리스너 연동
    useEffect(() => {
        const handleAppLog = (level: string, category: string, message: string, ...args: any[]) => {
            let type: LogType = 'info';
            const lowerLevel = level?.toLowerCase() || 'info';

            if (lowerLevel === 'error') type = 'error';
            else if (lowerLevel === 'warn') type = 'event';

            const extra = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
            addLog(type, `[${category}] ${message}${extra}`);
        };

        // logger 구현체에 리스너 등록 메서드가 있다고 가정 (메서드명에 맞게 수정 필요)
        if (typeof logger.subscribe === 'function') {
            logger.subscribe(handleAppLog);
        }

        return () => {
            if (typeof logger.subscribe === 'function') {
                logger.subscribe(handleAppLog);
            }
        };
    }, [addLog]);

    const { products, currentPurchases, loading, handlePurchase, finishPurchase, openSubscriptionManagement } =
        useSubscriptionIap({
            onPurchaseSuccess: async purchase => {
                addLog('success', `Purchase Success:\n${JSON.stringify(purchase, null, 2)}`);
                addLog('info', `Simulating web server verification...`);
                try {
                    await finishPurchase(purchase);
                    addLog('success', `Transaction Finished: ${purchase.transactionId || purchase.productId}`);
                } catch (e: any) {
                    addLog('error', `Finish Failed: ${e.message}`);
                }
            },
            onPurchaseError: error => {
                addLog('error', `Purchase Failed:\n${JSON.stringify(error, null, 2)}`);
            },
        });

    // 상품 목록 로드 상세 로깅
    useEffect(() => {
        if (products.length > 0) {
            addLog('event', `Loaded ${products.length} products from store:\n${JSON.stringify(products, null, 2)}`);
        }
    }, [products.length, addLog]);

    // 보유 중인 구독권 로드 상세 로깅
    useEffect(() => {
        if (currentPurchases.length > 0) {
            addLog(
                'event',
                `Found ${currentPurchases.length} active purchases:\n${JSON.stringify(currentPurchases, null, 2)}`
            );
        }
    }, [currentPurchases.length, addLog]);

    const getDisplayPrice = useCallback((item: ProductSubscription) => {
        const p = item as any;
        return p.displayPrice || p.localizedPrice || p.price || '가격 문의';
    }, []);

    const handleClearLogs = () => {
        setLogs([]);
    };

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
                                    backgroundColor: loading ? '#F5A623' : '#50E3C2',
                                },
                            ]}
                        />
                        <Text style={styles.statusText}>IAP Debugger</Text>
                        <Text style={styles.toggleIcon}>{isExpanded ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.refreshButton} onPress={handleClearLogs}>
                        <Text style={styles.buttonText}>Clear Logs</Text>
                    </TouchableOpacity>
                </View>

                {isExpanded && (
                    <View style={styles.infoContainer}>
                        <View style={styles.dividerHorizontal} />

                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Status:</Text>
                            <Text style={[styles.deviceStatusValue, { color: loading ? '#F5A623' : '#50E3C2' }]}>
                                {loading ? 'Processing...' : 'Idle'}
                            </Text>
                        </View>
                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Products:</Text>
                            <Text style={styles.deviceStatusValue}>{products.length} items found</Text>
                        </View>
                        <View style={styles.deviceStatusRow}>
                            <Text style={styles.deviceStatusLabel}>Purchased:</Text>
                            <Text style={styles.deviceStatusValue}>{currentPurchases.length} active subscriptions</Text>
                        </View>
                        {currentPurchases.length > 0 && (
                            <View style={styles.deviceStatusRow}>
                                <Text style={styles.deviceStatusLabel}>Active Product:</Text>
                                <Text style={[styles.deviceStatusValue, { fontSize: 10, color: '#AAA' }]}>
                                    {currentPurchases.map(p => p.productId).join(', ')}
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
                    {/* Products List as Buttons */}
                    {products.map(product => {
                        const isPurchased = currentPurchases.some(p => p.productId === product.id);
                        return (
                            <TouchableOpacity
                                key={product.id}
                                style={[
                                    styles.actionButton,
                                    { backgroundColor: isPurchased ? '#2E7D32' : '#4A90E2' },
                                    loading && { opacity: 0.5 },
                                ]}
                                onPress={() => {
                                    addLog('event', `Requesting purchase: ${product.id}`);
                                    handlePurchase(product.id);
                                }}
                                disabled={loading}
                            >
                                <Text style={styles.buttonText}>
                                    {isPurchased ? 'Owned' : 'Buy'} {product.id.split('.').pop()}
                                </Text>
                                <Text style={[styles.buttonText, { fontSize: 10, fontWeight: 'normal' }]}>
                                    {getDisplayPrice(product)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#8E44AD' }]}
                        onPress={openSubscriptionManagement}
                    >
                        <Text style={styles.buttonText}>Manage</Text>
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
    infoContainer: { marginTop: 4, gap: 4 },
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
    logTime: {
        color: '#666',
        fontSize: 12,
        marginRight: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logText: {
        fontSize: 12,
        flex: 1,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
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
        minWidth: 80,
    },
    divider: {
        width: 1,
        height: 24,
        backgroundColor: '#444',
        marginHorizontal: 4,
    },
    buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14, textAlign: 'center' },
});
