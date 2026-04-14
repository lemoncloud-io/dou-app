import React, { useCallback, useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import RNFS from 'react-native-fs';
import { cacheCrudService } from '../../../common/storages';
import { database } from '../../../common/storages/sqlite';
import type { CacheType } from '@chatic/app-messages';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DATA_TYPES: CacheType[] = ['channel', 'cloud', 'chat', 'user', 'join', 'site', 'usertoken', 'invitecloud'];

export const StorageTestScreen = () => {
    const insets = useSafeAreaInsets();

    const [dataType, setDataType] = useState<CacheType>(DATA_TYPES[0]);

    // 데이터 상태 관리
    const [items, setItems] = useState<any[]>([]);
    const [resultLog, setResultLog] = useState<string>('Ready');
    const [isExpanded, setIsExpanded] = useState(true);

    const togglePanel = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setIsExpanded(!isExpanded);
    };

    const logResult = (title: string, message: string) => {
        setResultLog(`[${title}] ${message}`);
    };

    const logError = (title: string, error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setResultLog(`[${title} - ERROR] ${message}`);
    };

    // --- Repository Action Handlers ---

    const fetchItems = useCallback(async () => {
        try {
            const query = { sort: 'desc' };
            const res = await cacheCrudService.fetchAll({ type: dataType, query });
            setItems(res || []);
            logResult('FetchAll', `Loaded ${res?.length || 0} items for ${dataType}.`);
        } catch (e) {
            logError('FetchAll', e);
        }
    }, [dataType]);

    const handleBackup = async () => {
        try {
            const backupPath = `${RNFS.DocumentDirectoryPath}/dou_backup.sqlite`;
            if (await RNFS.exists(backupPath)) {
                await RNFS.unlink(backupPath); // 기존 백업 파일 덮어쓰기를 위해 삭제
            }
            await database.backup(backupPath);
            logResult('Backup', `DB backed up safely to:\n${backupPath}`);
        } catch (e) {
            logError('Backup Error', e);
        }
    };

    const handleRestore = async () => {
        try {
            const backupPath = `${RNFS.DocumentDirectoryPath}/dou_backup.sqlite`;
            if (!(await RNFS.exists(backupPath))) {
                return logError('Restore Error', '백업 파일이 존재하지 않습니다. 먼저 Backup을 실행해주세요.');
            }
            await database.restore(backupPath);
            logResult('Restore', 'Database restored successfully! (Skipped mismatched schema)');
            await fetchItems(); // 복원 완료 후 화면 갱신
        } catch (e) {
            logError('Restore Error', e);
        }
    };

    useEffect(() => {
        void fetchItems();
    }, [dataType, fetchItems]);

    // 리스트 아이템 렌더링
    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.logRow}>
            <View style={styles.logHeader}>
                <Text style={styles.logTime}>
                    [{item.cid ? `${item.cid} / ` : ''}
                    {item.id}]
                </Text>
            </View>
            <Text style={styles.logData}>{item.text || JSON.stringify(item)}</Text>
        </View>
    );

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            {/* 상단 컨트롤 패널 */}
            <View style={styles.controlPanel}>
                <TouchableOpacity style={styles.panelHeader} onPress={togglePanel} activeOpacity={0.7}>
                    <View style={styles.statusRow}>
                        <View style={[styles.dot, { backgroundColor: '#50E3C2' }]} />
                        <Text style={styles.statusText}>Data Source: {dataType}</Text>
                    </View>
                    <Text style={styles.toggleIcon}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={styles.infoContainer}>
                        <View style={styles.dividerHorizontal} />
                        <View style={[styles.infoRow, { alignItems: 'center' }]}>
                            <Text style={styles.infoLabel}>Data Type:</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 8 }}
                            >
                                {DATA_TYPES.map(type => (
                                    <TouchableOpacity
                                        key={type}
                                        style={[styles.cidPill, dataType === type && styles.cidPillSelected]}
                                        onPress={() => setDataType(type)}
                                    >
                                        <Text
                                            style={[
                                                styles.cidPillText,
                                                dataType === type && styles.cidPillTextSelected,
                                            ]}
                                        >
                                            {type}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Result:</Text>
                            <Text
                                style={[
                                    styles.infoValue,
                                    { color: resultLog.includes('ERROR') ? '#FF5A5F' : '#50E3C2' },
                                ]}
                                numberOfLines={2}
                            >
                                {resultLog}
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            {/* 데이터 리스트 */}
            <FlatList
                data={items}
                keyExtractor={(item, index) => `${item.cid || 'default'}_${item.id}_${index}`}
                renderItem={renderItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>데이터가 없습니다.</Text>}
            />

            {/* 하단 액션 버튼 */}
            <View style={styles.bottomContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.actionContainer}
                >
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#2980B9' }]}
                        onPress={fetchItems}
                    >
                        <Text style={styles.buttonText}>Refresh</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#8E44AD' }]}
                        onPress={handleBackup}
                    >
                        <Text style={styles.buttonText}>Backup</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#9B59B6' }]}
                        onPress={handleRestore}
                    >
                        <Text style={styles.buttonText}>Restore</Text>
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
        marginBottom: 8,
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
    cidPill: {
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: '#333',
    },
    cidPillSelected: {
        backgroundColor: '#50E3C2',
    },
    cidPillText: {
        color: '#AAA',
        fontSize: 11,
        fontWeight: '600',
    },
    cidPillTextSelected: {
        color: '#000',
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
        alignItems: 'center',
    },
    logTime: {
        color: '#4A90E2',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontWeight: 'bold',
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
        paddingVertical: 12,
    },
    actionContainer: {
        paddingHorizontal: 16,
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
    divider: {
        width: 1,
        height: 24,
        backgroundColor: '#444',
        marginHorizontal: 4,
    },
    buttonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
});
