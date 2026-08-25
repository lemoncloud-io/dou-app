import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import Config from 'react-native-config';

import { useAppState, useServices } from '../../../hooks';
import { getDefaultWebviewBaseUrl, useDebugRuntimeStore, useDebugSettingsStore } from '../../../stores';
import { useDebugTheme } from '../theme';
import type { AppLogInfo } from '@chatic/app-messages';

const formatLogTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
};

export const MonitoringScreen = () => {
    const colors = useDebugTheme();
    const { appState, isForeground, isBackground, isInactive } = useAppState();
    const { logUploadQueueService, clipboardService, bootMetricsService } = useServices();
    const webView = useDebugRuntimeStore(state => state.webView);
    const { getResolvedWebviewBaseUrl, mockServiceMode, mockServiceBaseUrl } = useDebugSettingsStore();
    const logUploadHold = useDebugSettingsStore(state => state.logUploadHold);
    const setLogUploadHold = useDebugSettingsStore(state => state.setLogUploadHold);
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [copiedMessage, setCopiedMessage] = useState<string | null>(null);
    const [usedMemoryMb, setUsedMemoryMb] = useState<number | null>(null);

    // The unsent queue, read non-destructively — `ack` is what releases entries,
    // so a viewer can poll it without competing with the uploader. `debug` is
    // never queued, so it never appears here (it goes to the console and the RN
    // local debug pipeline instead).
    const refreshLogs = () => {
        setLogs(logUploadQueueService.fetch(20).reverse());
    };

    useEffect(() => {
        refreshLogs();
        const timer = setInterval(refreshLogs, 2000);
        return () => clearInterval(timer);
    }, [logUploadQueueService]);

    // Perf: app memory footprint, polled on the same cadence as the log view.
    useEffect(() => {
        const readMemory = () => {
            void DeviceInfo.getUsedMemory().then(bytes => setUsedMemoryMb(Math.round(bytes / 1024 / 1024)));
        };
        readMemory();
        const timer = setInterval(readMemory, 2000);
        return () => clearInterval(timer);
    }, []);

    const snapshot = useMemo(
        () => ({
            app: {
                env: Config.VITE_ENV || 'PROD',
                version: DeviceInfo.getVersion(),
                buildNumber: DeviceInfo.getBuildNumber(),
                appState,
                isForeground,
                isBackground,
                isInactive,
            },
            webview: webView,
            settings: {
                defaultBaseUrl: getDefaultWebviewBaseUrl(),
                resolvedBaseUrl: getResolvedWebviewBaseUrl(),
                mockServiceMode,
                mockServiceBaseUrl,
            },
            logQueueSize: logUploadQueueService.getSize(),
            logUploadHold,
        }),
        [
            appState,
            getResolvedWebviewBaseUrl,
            isBackground,
            isForeground,
            isInactive,
            logUploadHold,
            logUploadQueueService,
            mockServiceBaseUrl,
            mockServiceMode,
            webView,
        ]
    );

    const copySnapshot = async () => {
        await clipboardService.setText(JSON.stringify(snapshot, null, 2));
        setCopiedMessage('진단 snapshot을 복사했습니다.');
    };

    // Destructive: these entries were waiting to be sent, so discarding them
    // means the server never sees them. Useful between reproduction attempts,
    // which is why the label says 버리기.
    const discardQueued = async () => {
        logUploadQueueService.clear();
        refreshLogs();
        setCopiedMessage('미전송 큐를 버렸습니다. 서버로 가지 않습니다.');
    };

    const renderStatusRow = (label: string, value: string | number | boolean | null | undefined) => (
        <View style={[styles.statusRow, { borderBottomColor: colors.border }]}>
            <Text style={[styles.statusLabel, { color: colors.subtleText }]}>{label}</Text>
            <Text style={[styles.statusValue, { color: colors.text }]}>{String(value ?? '-')}</Text>
        </View>
    );

    return (
        <ScrollView
            style={[styles.screen, { backgroundColor: colors.background }]}
            contentContainerStyle={styles.content}
        >
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>앱 상태</Text>
                {renderStatusRow('AppState', appState)}
                {renderStatusRow('Foreground', isForeground)}
                {renderStatusRow('Background', isBackground)}
                {renderStatusRow('Inactive', isInactive)}
                {renderStatusRow('Env', Config.VITE_ENV || 'PROD')}
                {renderStatusRow('Version', `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`)}
                {renderStatusRow('Used Memory', usedMemoryMb != null ? `${usedMemoryMb} MB` : null)}
                {renderStatusRow(
                    'Last Resume',
                    bootMetricsService.getLastForegroundResumeMs() != null
                        ? `${bootMetricsService.getLastForegroundResumeMs()} ms`
                        : null
                )}
                {renderStatusRow('WebView Process Kills', bootMetricsService.getContentProcessReloadCount())}
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>웹뷰 상태</Text>
                {renderStatusRow('Current URL', webView.currentUrl)}
                {renderStatusRow('Loading', webView.isLoading)}
                {renderStatusRow('Can Go Back', webView.canGoBack)}
                {renderStatusRow('Can Go Forward', webView.canGoForward)}
                {renderStatusRow('Last Load Start', webView.lastLoadStartUrl)}
                {renderStatusRow('Last Load End', webView.lastLoadEndUrl)}
                {renderStatusRow('Last Error', webView.lastError)}
                {renderStatusRow('Resolved BASE_URL', getResolvedWebviewBaseUrl())}
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.panelHeader}>
                    <Text style={[styles.title, { color: colors.text }]}>미전송 큐</Text>
                    <Text style={[styles.countText, { color: colors.subtleText }]}>
                        {logUploadQueueService.getSize()}개
                    </Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={refreshLogs}>
                        <Text style={styles.primaryButtonText}>새로고침</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.secondaryButton, { borderColor: colors.border }]}
                        onPress={discardQueued}
                    >
                        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>버리기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={copySnapshot}>
                        <Text style={styles.primaryButtonText}>Snapshot 복사</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={[
                        styles.holdToggle,
                        { borderColor: logUploadHold ? '#F59E0B' : colors.border },
                        logUploadHold && styles.holdToggleOn,
                    ]}
                    onPress={() => setLogUploadHold(!logUploadHold)}
                >
                    <Text style={[styles.holdToggleLabel, { color: logUploadHold ? '#B45309' : colors.text }]}>
                        서버 전송 {logUploadHold ? '보류 중' : '보류'}
                    </Text>
                    <Text style={[styles.holdToggleHint, { color: colors.subtleText }]}>
                        {logUploadHold
                            ? '큐를 비우지 않습니다. 재현한 로그가 여기 남습니다. 수집은 계속됩니다.'
                            : '평시에는 전송돼 큐가 비어 있는 것이 정상입니다.'}
                    </Text>
                </TouchableOpacity>
                {logs.map(log => (
                    <View
                        key={`${log.timestamp}-${log.tag}-${log.message}`}
                        style={[styles.logRow, { borderColor: colors.border }]}
                    >
                        <Text style={[styles.logMeta, { color: colors.subtleText }]}>
                            {formatLogTime(log.timestamp ?? 0)} [{log.level}] {log.tag}
                        </Text>
                        <Text style={[styles.logMessage, { color: colors.text }]}>{log.message}</Text>
                    </View>
                ))}
                {logs.length === 0 && (
                    // An empty queue is the expected state while sending is on —
                    // the uploader drains what it ships. Without saying so, this
                    // screen reads as broken.
                    <Text style={[styles.emptyText, { color: colors.subtleText }]}>
                        {logUploadHold
                            ? '보류 중이지만 큐가 비어 있습니다 — 아직 전송할 로그가 없습니다.'
                            : '큐가 비어 있습니다. 전송이 켜져 있으면 정상입니다 — 붙잡아 보려면 위의 보류를 켜세요.'}
                    </Text>
                )}
            </View>

            {copiedMessage && <Text style={[styles.message, { color: colors.mutedText }]}>{copiedMessage}</Text>}
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
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    countText: {
        fontSize: 12,
    },
    statusRow: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 8,
        gap: 4,
    },
    statusLabel: {
        fontSize: 12,
        textTransform: 'uppercase',
    },
    statusValue: {
        fontSize: 14,
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
    holdToggle: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 12,
        gap: 4,
    },
    holdToggleOn: {
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
    },
    holdToggleLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    holdToggleHint: {
        fontSize: 11,
        lineHeight: 16,
    },
    logRow: {
        borderWidth: 1,
        borderRadius: 8,
        padding: 10,
        gap: 4,
    },
    logMeta: {
        fontSize: 11,
    },
    logMessage: {
        fontSize: 13,
    },
    emptyText: {
        fontSize: 13,
    },
    message: {
        fontSize: 13,
    },
});
