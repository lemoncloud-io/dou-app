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
import { cacheRepository } from '../../../common/storages';
import { database } from '../../../common/storages/sqlite';
import type { CacheType } from '@chatic/app-messages';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const StorageTestScreen = () => {
    const insets = useSafeAreaInsets();

    const [cloudIds] = useState(['cloud-1', 'cloud-2', 'cloud-3']);
    const dataType: CacheType = 'chat';
    const [targetCid, setTargetCid] = useState(cloudIds[0]);

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

    // 테스트용 랜덤 채팅 메시지 생성기
    const createRandomChat = (cid: string, id: string) => ({
        id,
        cid,
        channelId: 'ch-general-test', // 테스트용 기본 채널 ID
        text: `Random message @ ${new Date().toLocaleTimeString()}`,
        createdAt: Date.now(),
        ownerId: `user-${Math.floor(Math.random() * 100)}`,
        ownerName: 'Random User',
        isSystem: false,
    });

    // --- Repository Action Handlers ---

    const fetchItems = useCallback(async () => {
        try {
            // 명시적으로 sort를 문자열로 주입하여 toUpperCase 에러 방지
            const query = targetCid ? { cid: targetCid, sort: 'desc' } : { sort: 'desc' };
            const res = await cacheRepository.fetchAll({ type: dataType, query });
            setItems(res || []);
            logResult('FetchAll', `Loaded ${res?.length || 0} items.`);
        } catch (e) {
            logError('FetchAll', e);
        }
    }, [targetCid, dataType]);

    const handleSaveRandom = async () => {
        try {
            const id = `msg-${Date.now()}`;
            const item = createRandomChat(targetCid, id);
            await cacheRepository.save({ type: dataType, id, cid: targetCid, item });
            logResult('Save', `Saved message ${id}`);
            await fetchItems(); // 저장 후 즉시 새로고침
        } catch (e) {
            logError('Save', e);
        }
    };

    const handleSaveMultipleRandom = async () => {
        try {
            const newItems = Array.from({ length: 5 }).map((_, i) => {
                const id = `msg-batch-${Date.now()}-${i}`;
                return createRandomChat(targetCid, id);
            });
            await cacheRepository.saveAll({ type: dataType, items: newItems, cid: targetCid || undefined });
            logResult('SaveAll', 'Saved 5 messages.');
            await fetchItems(); // 저장 후 즉시 새로고침
        } catch (e) {
            logError('SaveAll', e);
        }
    };

    const handleDeleteSingle = async (id: string) => {
        try {
            await cacheRepository.delete({ type: dataType, id, cid: targetCid });
            logResult('Delete', `Deleted message ${id}`);
            await fetchItems(); // 삭제 후 즉시 새로고침
        } catch (e) {
            logError('Delete', e);
        }
    };

    const handleDeleteAll = async () => {
        if (items.length === 0) return logResult('DeleteAll', '삭제할 데이터가 없습니다.');
        const ids = items.map(item => item.id).filter(Boolean);
        try {
            await cacheRepository.deleteAll({ type: dataType, ids, cid: targetCid });
            logResult('DeleteAll', `Deleted ${ids.length} messages.`);
            await fetchItems(); // 삭제 후 즉시 새로고침
        } catch (e) {
            logError('DeleteAll', e);
        }
    };

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
    }, [targetCid, dataType, fetchItems]);

    // 리스트 아이템 렌더링
    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.logRow}>
            <View style={styles.logHeader}>
                <Text style={styles.logTime}>[{item.id}]</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                    onPress={() => handleDeleteSingle(item.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
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
                            <Text style={styles.infoLabel}>Target CID:</Text>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 8 }}
                            >
                                {cloudIds.map(cid => (
                                    <TouchableOpacity
                                        key={cid}
                                        style={[styles.cidPill, targetCid === cid && styles.cidPillSelected]}
                                        onPress={() => setTargetCid(cid)}
                                    >
                                        <Text
                                            style={[
                                                styles.cidPillText,
                                                targetCid === cid && styles.cidPillTextSelected,
                                            ]}
                                        >
                                            {cid}
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
                keyExtractor={item => item.id}
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
                        style={[styles.actionButton, { backgroundColor: '#27AE60' }]}
                        onPress={handleSaveRandom}
                    >
                        <Text style={styles.buttonText}>+ 1 Add</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#F39C12' }]}
                        onPress={handleSaveMultipleRandom}
                    >
                        <Text style={styles.buttonText}>+ 5 Add</Text>
                    </TouchableOpacity>
                    <View style={styles.divider} />
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#C0392B' }]}
                        onPress={handleDeleteAll}
                    >
                        <Text style={styles.buttonText}>Clear All</Text>
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
    deleteText: {
        color: '#FF5A5F',
        fontSize: 11,
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
