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
    const { logBufferService, clipboardService } = useServices();
    const webView = useDebugRuntimeStore(state => state.webView);
    const { getResolvedWebviewBaseUrl, mockServiceMode, mockServiceBaseUrl } = useDebugSettingsStore();
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [copiedMessage, setCopiedMessage] = useState<string | null>(null);

    const refreshLogs = () => {
        setLogs(logBufferService.peek(20).reverse());
    };

    useEffect(() => {
        refreshLogs();
        const timer = setInterval(refreshLogs, 2000);
        return () => clearInterval(timer);
    }, [logBufferService]);

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
            logBufferSize: logBufferService.getSize(),
        }),
        [
            appState,
            getResolvedWebviewBaseUrl,
            isBackground,
            isForeground,
            isInactive,
            logBufferService,
            mockServiceBaseUrl,
            mockServiceMode,
            webView,
        ]
    );

    const copySnapshot = async () => {
        await clipboardService.setText(JSON.stringify(snapshot, null, 2));
        setCopiedMessage('진단 snapshot을 복사했습니다.');
    };

    const clearLogs = async () => {
        await logBufferService.clear();
        refreshLogs();
        setCopiedMessage('로그 버퍼를 비웠습니다.');
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
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.title, { color: colors.text }]}>웹뷰 상태</Text>
                {renderStatusRow('Current URL', webView.currentUrl)}
                {renderStatusRow('Loading', webView.isLoading)}
                {renderStatusRow('Ready', webView.isWebAppReady)}
                {renderStatusRow('Can Go Back', webView.canGoBack)}
                {renderStatusRow('Can Go Forward', webView.canGoForward)}
                {renderStatusRow('Last Load Start', webView.lastLoadStartUrl)}
                {renderStatusRow('Last Load End', webView.lastLoadEndUrl)}
                {renderStatusRow('Last Error', webView.lastError)}
                {renderStatusRow('Resolved BASE_URL', getResolvedWebviewBaseUrl())}
            </View>

            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.panelHeader}>
                    <Text style={[styles.title, { color: colors.text }]}>로그</Text>
                    <Text style={[styles.countText, { color: colors.subtleText }]}>{logBufferService.getSize()}개</Text>
                </View>
                <View style={styles.actions}>
                    <TouchableOpacity style={styles.primaryButton} onPress={refreshLogs}>
                        <Text style={styles.primaryButtonText}>새로고침</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.secondaryButton, { borderColor: colors.border }]}
                        onPress={clearLogs}
                    >
                        <Text style={[styles.secondaryButtonText, { color: colors.text }]}>비우기</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryButton} onPress={copySnapshot}>
                        <Text style={styles.primaryButtonText}>Snapshot 복사</Text>
                    </TouchableOpacity>
                </View>
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
                    <Text style={[styles.emptyText, { color: colors.subtleText }]}>로그가 없습니다.</Text>
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
