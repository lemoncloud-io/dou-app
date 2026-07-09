import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { BootRecord } from '../../../services';
import { useServices } from '../../../hooks';
import { useDebugTheme } from '../theme';

const formatRecordTime = (epochMs: number) =>
    new Date(epochMs).toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });

const BOOT_TYPE_LABEL: Record<BootRecord['type'], string> = {
    cold: '콜드부팅',
    reload: '프로세스 리로드',
};

const ms = (value: number | null | undefined) => (value != null ? `${value} ms` : '-');

/**
 * Boot performance history: one persisted record per boot session (native
 * milestones + the merged web snapshot). Tap a record to inspect the full
 * timeline; copy exports every record as JSON for before/after comparisons.
 */
export const BootPerformanceScreen = () => {
    const colors = useDebugTheme();
    const { bootMetricsService, clipboardService } = useServices();
    const [records, setRecords] = useState<BootRecord[]>([]);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
    const [message, setMessage] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setRecords(await bootMetricsService.getRecords());
    }, [bootMetricsService]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const copyAll = async () => {
        await clipboardService.setText(JSON.stringify(records, null, 2));
        setMessage(`부팅 기록 ${records.length}건을 복사했습니다.`);
    };

    const clearAll = async () => {
        await bootMetricsService.clearRecords();
        await refresh();
        setMessage('부팅 기록을 초기화했습니다.');
    };

    const renderRow = (label: string, value: string) => (
        <View style={[styles.statusRow, { borderBottomColor: colors.border }]} key={label}>
            <Text style={[styles.statusLabel, { color: colors.subtleText }]}>{label}</Text>
            <Text style={[styles.statusValue, { color: colors.text }]}>{value}</Text>
        </View>
    );

    const renderDetail = (record: BootRecord) => {
        const { native, web } = record;
        return (
            <View style={styles.detail}>
                <Text style={[styles.sectionTitle, { color: colors.subtleText }]}>네이티브 (JS 엔트리 기준)</Text>
                {renderRow('provider ready', ms(native['provider-ready']))}
                {renderRow('app mount', ms(native['app-mount']))}
                {renderRow('main screen', ms(native['main-screen-mount']))}
                {renderRow('webview load start', ms(native['load-start']))}
                {renderRow('webview load end', ms(native['load-end']))}
                {renderRow('web app ready', ms(native['web-app-ready']))}

                <Text style={[styles.sectionTitle, { color: colors.subtleText }]}>웹 (페이지 로드 기준)</Text>
                {web ? (
                    <>
                        {renderRow('TTFB', ms(web.navigation?.ttfbMs))}
                        {renderRow('DOMContentLoaded', ms(web.navigation?.domContentLoadedMs))}
                        {renderRow('main.tsx start', ms(web.marks.mainStartMs))}
                        {renderRow('app render', ms(web.marks.appRenderMs))}
                        {renderRow('session init', ms(web.marks.sessionInitializedMs))}
                        {(web.assets ?? []).map(asset =>
                            renderRow(
                                asset.name,
                                asset.fromCache
                                    ? `cache · ${asset.durationMs} ms`
                                    : `${Math.round(asset.transferSize / 1024)} KB · ${asset.durationMs} ms`
                            )
                        )}
                    </>
                ) : (
                    <Text style={[styles.emptyText, { color: colors.subtleText }]}>웹 스냅샷 없음 (타임아웃)</Text>
                )}
            </View>
        );
    };

    return (
        <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.panelHeader}>
                    <Text style={[styles.title, { color: colors.text }]}>부팅 성능 기록</Text>
                    <Text style={[styles.countText, { color: colors.subtleText }]}>{records.length}건</Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => void refresh()}>
                        <Text style={styles.primaryButtonText}>새로고침</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={() => void copyAll()}>
                        <Text style={styles.primaryButtonText}>JSON 복사</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.secondaryButton, { borderColor: colors.border }]}
                        onPress={() => void clearAll()}
                    >
                        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>초기화</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {records.map((record, index) => (
                <TouchableOpacity
                    key={`${record.finalizedAt}-${index}`}
                    style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
                    activeOpacity={0.7}
                >
                    <View style={styles.panelHeader}>
                        <Text style={[styles.recordTitle, { color: colors.text }]}>
                            {BOOT_TYPE_LABEL[record.type]} · {ms(record.totalMs)}
                        </Text>
                        <Text style={[styles.countText, { color: colors.subtleText }]}>
                            {formatRecordTime(record.finalizedAt)} · v{record.appVersion}
                        </Text>
                    </View>
                    {expandedIndex === index && renderDetail(record)}
                </TouchableOpacity>
            ))}

            {records.length === 0 && (
                <Text style={[styles.emptyText, { color: colors.subtleText }]}>
                    기록이 없습니다. 앱을 재시작하면 첫 기록이 남습니다.
                </Text>
            )}

            {message && <Text style={[styles.message, { color: colors.mutedText }]}>{message}</Text>}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 32,
        gap: 16,
    },
    panel: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 16,
        gap: 10,
    },
    panelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    recordTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    countText: {
        fontSize: 12,
    },
    sectionTitle: {
        fontSize: 12,
        textTransform: 'uppercase',
        marginTop: 8,
    },
    detail: {
        gap: 4,
    },
    statusRow: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 6,
        gap: 2,
    },
    statusLabel: {
        fontSize: 12,
    },
    statusValue: {
        fontSize: 13,
        fontFamily: 'monospace',
    },
    actions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    primaryButton: {
        backgroundColor: '#2563EB',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontWeight: '700',
    },
    secondaryButton: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    secondaryButtonText: {
        fontWeight: '700',
    },
    emptyText: {
        fontSize: 13,
    },
    message: {
        fontSize: 13,
    },
});
