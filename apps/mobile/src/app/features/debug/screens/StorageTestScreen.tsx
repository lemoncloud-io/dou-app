import React, { useCallback, useEffect, useState } from 'react';
import {
    FlatList,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FileManagerBridge } from '../../../bridge';
import type { CacheType } from '@chatic/app-messages';
import { provider } from '../../../services';
import { useDebugTheme } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DATA_TYPES: CacheType[] = ['channel', 'chat', 'user', 'join', 'site', 'invitecloud', 'profile', 'meta'];

// `meta` rows are sync cursors (e.g. `channel-sync:<cid>`): `syncedAt` is the server watermark and
// `__cacheMeta` carries the local save time + expiry the TTL is computed from. Surface them readably
// so cold-cache staleness (an idle cursor past the delta window) can be diagnosed on-device.
const formatTime = (ms?: number): string => {
    if (!ms) return '-';
    const d = new Date(ms);
    const ago = Math.round((Date.now() - ms) / 1000);
    return `${d.toLocaleTimeString()} (${ago}s ago)`;
};

const describeMeta = (item: any): string => {
    const cacheMeta = item?.__cacheMeta ?? {};
    const expired = typeof cacheMeta.expiresAt === 'number' ? cacheMeta.expiresAt <= Date.now() : undefined;
    return [
        `syncedAt: ${formatTime(item?.syncedAt)}`,
        `savedAt:  ${formatTime(cacheMeta.lastSyncedAt)}`,
        `expiresAt: ${formatTime(cacheMeta.expiresAt)}${expired === undefined ? '' : expired ? ' [EXPIRED]' : ' [valid]'}`,
    ].join('\n');
};

// `profile` rows are place-scoped display profiles keyed by `<sid>@<uid>`, and their `thumbnail` is a
// base64 blob — never render it, it would flood the list. Report identity (nick/sid/owner uid) plus
// whether a thumbnail exists and how big it is, which is what missing-photo reports need to be triaged.
const describeProfile = (item: any): string => {
    const thumbnail = typeof item?.thumbnail === 'string' ? item.thumbnail : '';
    // `uid` is the profile owner; a `userId` that disagrees means the row was written with a wrong scope.
    const owner = item?.uid ?? '-';
    const userId = item?.userId;
    return [
        `nick: ${item?.nick || '-'}`,
        `sid: ${item?.sid || '-'}`,
        `uid: ${owner}${userId && userId !== owner ? ` (userId: ${userId})` : ''}`,
        `thumbnail: ${thumbnail ? `yes (${thumbnail.length} chars)` : 'none'}`,
    ].join('\n');
};

// Per-type starter row for one-click create. cid/uid default to 'default' so the row is writable
// without a live session; edit the JSON before saving to target a specific scope.
const makeTemplate = (type: CacheType): Record<string, unknown> => {
    const id = `dbg-${type}-${Date.now().toString(36)}`;
    const base = { id, cid: 'default', uid: 'default' };
    switch (type) {
        case 'channel':
            return { ...base, sid: '', name: 'Debug Channel' };
        case 'chat':
            return { ...base, channelId: '', chatNo: 0, content: 'debug message' };
        case 'user':
            return { ...base, name: 'Debug User' };
        case 'join':
            return { ...base, channelId: '', userId: '', readNo: 0 };
        case 'site':
            return { ...base, name: 'Debug Place' };
        case 'invitecloud':
            return { ...base, name: 'Debug Cloud' };
        case 'profile': {
            // Profile rows are keyed by the canonical `<sid>@<uid>` id (not the `dbg-<type>-<ts>` scheme),
            // where `uid` is the profile owner; edit sid/uid and the id together to target a real place.
            const sid = 'debug-site';
            return {
                ...base,
                id: `${sid}@${base.uid}`,
                sid,
                userId: base.uid,
                nick: 'Debug Profile',
                thumbnail: '',
                updatedAtMs: Date.now(),
            };
        }
        case 'meta':
            // Sync-cursor row: id is the cursor kind, `syncedAt` the server watermark.
            return { id: `channel-sync:${base.cid}`, cid: base.cid, uid: base.uid, syncedAt: Date.now() };
        default:
            return base;
    }
};

export const StorageTestScreen = () => {
    const insets = useSafeAreaInsets();
    const colors = useDebugTheme();
    // Debug screen (not on the boot path): reading these getters here constructs the SQLite database
    // on demand when the screen opens. See boot-optimization.md 4.4.
    const { sqliteDatabase, cacheCrudService, clipboardService } = provider;

    const [dataType, setDataType] = useState<CacheType>(DATA_TYPES[0]);

    // 데이터 상태 관리
    const [items, setItems] = useState<any[]>([]);
    const [resultLog, setResultLog] = useState<string>('Ready');
    const [isExpanded, setIsExpanded] = useState(true);

    // 편집기(생성/수정) 상태
    const [editorVisible, setEditorVisible] = useState(false);
    const [editorText, setEditorText] = useState('');

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

    const fetchItems = useCallback(async () => {
        try {
            // Provide placeholder cid and uid for debug purposes
            const res = await cacheCrudService.fetchAll({ type: dataType });
            setItems(res || []);
            logResult('FetchAll', `Loaded ${res?.length || 0} items for ${dataType}.`);
        } catch (e) {
            logError('FetchAll', e);
        }
    }, [cacheCrudService, dataType]);

    const handleClear = async () => {
        try {
            // Provide placeholder cid and uid for debug purposes
            await cacheCrudService.clear({ type: dataType });
            logResult('Clear', `Successfully cleared all data in ${dataType}.`);
            await fetchItems();
        } catch (e) {
            logError('Clear Error', e);
        }
    };

    const handleCopy = async (item: any) => {
        try {
            await clipboardService.setText(JSON.stringify(item, null, 2));
            logResult('Copy', `Copied ${item.id} to clipboard.`);
        } catch (e) {
            logError('Copy', e);
        }
    };

    const handleDelete = async (item: any) => {
        try {
            await cacheCrudService.delete({
                type: dataType,
                id: item.id,
                cid: item.cid ?? 'default',
                uid: item.uid ?? 'default',
            });
            logResult('Delete', `Deleted ${item.id} in ${dataType}.`);
            await fetchItems();
        } catch (e) {
            logError('Delete', e);
        }
    };

    // 생성: 이 타입의 템플릿으로 편집기를 연다.
    const openCreate = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEditorText(JSON.stringify(makeTemplate(dataType), null, 2));
        setEditorVisible(true);
    };

    // 수정: 기존 행의 JSON으로 편집기를 채운다. 같은 id로 저장 → save가 upsert.
    const openEdit = (item: any) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEditorText(JSON.stringify(item, null, 2));
        setEditorVisible(true);
    };

    const handleSave = async () => {
        try {
            const parsed = JSON.parse(editorText);
            if (!parsed?.id) {
                return logError('Save', 'id 필드가 필요합니다.');
            }
            await cacheCrudService.save({
                type: dataType,
                id: parsed.id,
                item: parsed,
                cid: parsed.cid ?? 'default',
                uid: parsed.uid ?? 'default',
            });
            logResult('Save', `Saved ${parsed.id} in ${dataType}.`);
            setEditorVisible(false);
            setEditorText('');
            await fetchItems();
        } catch (e) {
            logError('Save', e);
        }
    };

    const closeEditor = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setEditorVisible(false);
        setEditorText('');
    };

    const handleBackup = async () => {
        try {
            const backupPath = `${FileManagerBridge.DocumentDirectoryPath}/dou_backup.sqlite`;
            if (await FileManagerBridge.exists(backupPath)) {
                await FileManagerBridge.unlink(backupPath);
            }
            await sqliteDatabase.backup(backupPath);
            logResult('Backup', `DB backed up safely to:\n${backupPath}`);
        } catch (e) {
            logError('Backup Error', e);
        }
    };

    const handleRestore = async () => {
        try {
            const backupPath = `${FileManagerBridge.DocumentDirectoryPath}/dou_backup.sqlite`;
            if (!(await FileManagerBridge.exists(backupPath))) {
                return logError('Restore Error', '백업 파일이 존재하지 않습니다. 먼저 Backup을 실행해주세요.');
            }
            await sqliteDatabase.restore(backupPath);
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
        <View style={[styles.logRow, { borderBottomColor: colors.border }]}>
            <View style={styles.logHeader}>
                <Text style={styles.logTime}>
                    [{item.cid ? `${item.cid} / ` : ''}
                    {item.id}]
                </Text>
            </View>
            <Text style={[styles.logData, { color: colors.mutedText }]}>
                {dataType === 'meta'
                    ? describeMeta(item)
                    : dataType === 'profile'
                      ? describeProfile(item)
                      : item.content || item.name || item.text || JSON.stringify(item)}
            </Text>
            <View style={styles.rowActions}>
                <TouchableOpacity style={styles.rowActionButton} onPress={() => void handleCopy(item)}>
                    <Text style={[styles.rowActionText, { color: colors.subtleText }]}>복사</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rowActionButton} onPress={() => openEdit(item)}>
                    <Text style={[styles.rowActionText, { color: '#4A90E2' }]}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rowActionButton} onPress={() => void handleDelete(item)}>
                    <Text style={[styles.rowActionText, { color: '#FF5A5F' }]}>삭제</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom, backgroundColor: colors.background }]}>
            {/* 상단 컨트롤 패널 */}
            <View style={[styles.controlPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity style={styles.panelHeader} onPress={togglePanel} activeOpacity={0.7}>
                    <View style={styles.statusRow}>
                        <View style={[styles.dot, { backgroundColor: '#50E3C2' }]} />
                        <Text style={[styles.statusText, { color: colors.text }]}>Data Source: {dataType}</Text>
                    </View>
                    <Text style={[styles.toggleIcon, { color: colors.subtleText }]}>{isExpanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                    <View style={styles.infoContainer}>
                        <View style={[styles.dividerHorizontal, { backgroundColor: colors.border }]} />
                        <View style={[styles.infoRow, { alignItems: 'center' }]}>
                            <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Data Type:</Text>
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
                            <Text style={[styles.infoLabel, { color: colors.mutedText }]}>Result:</Text>
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

            {/* 생성/수정 편집기 */}
            {editorVisible && (
                <View
                    style={[styles.editorPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
                >
                    <Text style={[styles.editorTitle, { color: colors.text }]}>데이터 추가/수정 (JSON)</Text>
                    <TextInput
                        style={[styles.editorInput, { color: colors.text, borderColor: colors.border }]}
                        value={editorText}
                        onChangeText={setEditorText}
                        multiline
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder='{ "id": "...", ... }'
                        placeholderTextColor={colors.subtleText}
                    />
                    <View style={styles.editorActions}>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#27AE60' }]}
                            onPress={() => void handleSave()}
                        >
                            <Text style={styles.buttonText}>저장</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#555' }]}
                            onPress={closeEditor}
                        >
                            <Text style={styles.buttonText}>취소</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* 데이터 리스트 */}
            <FlatList
                data={items}
                keyExtractor={(item, index) => `${item.cid || 'default'}_${item.id}_${index}`}
                renderItem={renderItem}
                style={[styles.logList, { backgroundColor: colors.logBackground }]}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={
                    <Text style={[styles.emptyText, { color: colors.subtleText }]}>데이터가 없습니다.</Text>
                }
            />

            {/* 하단 액션 버튼 */}
            <View style={[styles.bottomContainer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
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

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#27AE60' }]}
                        onPress={openCreate}
                    >
                        <Text style={styles.buttonText}>생성</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#E74C3C' }]}
                        onPress={handleClear}
                    >
                        <Text style={styles.buttonText}>Clear</Text>
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
    screen: { flex: 1, backgroundColor: '#121212' },
    controlPanel: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: '#1E1E1E' },
    panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    statusText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
    toggleIcon: { color: '#888', fontSize: 12 },
    infoContainer: { marginTop: 4 },
    dividerHorizontal: { height: 1, backgroundColor: '#333', marginVertical: 12 },
    infoRow: { flexDirection: 'row', marginBottom: 8 },
    infoLabel: { color: '#888', fontSize: 12, width: 80 },
    infoValue: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold', flex: 1 },
    cidPill: { paddingVertical: 4, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#333' },
    cidPillSelected: { backgroundColor: '#50E3C2' },
    cidPillText: { color: '#AAA', fontSize: 11, fontWeight: '600' },
    cidPillTextSelected: { color: '#000' },
    editorPanel: { padding: 16, borderBottomWidth: 1 },
    editorTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
    editorInput: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        minHeight: 120,
        maxHeight: 220,
        fontSize: 12,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        textAlignVertical: 'top',
    },
    editorActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
    logList: { flex: 1, backgroundColor: '#000000' },
    logContent: { padding: 16 },
    logRow: { marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#222', paddingBottom: 8 },
    logHeader: { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
    logTime: {
        color: '#4A90E2',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontWeight: 'bold',
    },
    logData: { color: '#888', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginLeft: 4 },
    rowActions: { flexDirection: 'row', gap: 16, marginTop: 8, marginLeft: 4 },
    rowActionButton: { paddingVertical: 2 },
    rowActionText: { fontSize: 12, fontWeight: '600' },
    emptyText: { color: '#444', textAlign: 'center', marginTop: 20 },
    bottomContainer: { backgroundColor: '#1E1E1E', borderTopWidth: 1, borderTopColor: '#333', paddingVertical: 12 },
    actionContainer: { paddingHorizontal: 16, alignItems: 'center', gap: 8 },
    actionButton: {
        height: 44,
        paddingHorizontal: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        opacity: 0.9,
    },
    divider: { width: 1, height: 24, backgroundColor: '#444', marginHorizontal: 4 },
    buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
});
