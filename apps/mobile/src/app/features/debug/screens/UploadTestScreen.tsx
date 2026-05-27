import React, { useCallback, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { deviceService, uploadService } from '../../../services';

interface LogItem {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'sent' | 'received';
    message: string;
    timestamp: string;
}

interface UploadItem {
    uploadId: string;
    fileName: string;
    fileSize: number;
    fileUri: string;
    mimeType: string;
    progress: number;
    uploadedBytes: number;
    status: 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
}

export const UploadTestScreen = () => {
    const insets = useSafeAreaInsets();

    // Config states
    const [uploadUrl, setUploadUrl] = useState('http://localhost:8080/upload');
    const [chunkSize, setChunkSize] = useState(1024 * 1024); // 1MB Default

    // Staged picked files list
    const [selectedFiles, setSelectedFiles] = useState<
        Array<{
            uri: string;
            name: string;
            type?: string;
            size: number;
        }>
    >([]);

    // List of multiple active/completed upload tasks
    const [uploads, setUploads] = useState<UploadItem[]>([]);

    // Console logs state
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [isLogsExpanded, setIsLogsExpanded] = useState(true);
    const flatListRef = useRef<FlatList>(null);

    const addLog = useCallback(
        (type: 'info' | 'success' | 'warning' | 'error' | 'sent' | 'received', message: string) => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('ko-KR', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });

            const newLog: LogItem = {
                id: `${Date.now()}-${Math.random()}`,
                type,
                message,
                timestamp: timeString,
            };

            setLogs(prev => [...prev, newLog]);

            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        },
        []
    );

    const handleClearLogs = () => {
        setLogs([]);
    };

    // 1. Pick Multiple Files via native deviceService (allowMultiSelection: true)
    const pickFile = async () => {
        addLog('info', '[Picker] Opening native document picker with multi-selection enabled...');
        try {
            const results = await deviceService.openDocument(true);
            if (results && results.length > 0) {
                const newFiles = results.map(doc => {
                    const fileSize = doc.size ?? 0;
                    return {
                        uri: doc.uri,
                        name: doc.name ?? 'unknown_file',
                        type: doc.type ?? undefined,
                        size: fileSize,
                    };
                });
                setSelectedFiles(prev => [...prev, ...newFiles]);
                addLog('success', `[Picker] Successfully picked and staged ${newFiles.length} file(s).`);
            } else {
                addLog('warning', '[Picker] No files selected.');
            }
        } catch (e: any) {
            addLog('error', `[Picker] Error picking documents: ${e.message}`);
        }
    };

    // 2. Start Native Chunked Upload for all staged files in parallel
    const startUpload = async () => {
        if (selectedFiles.length === 0) {
            addLog('warning', '[Upload] No staged files selected to upload.');
            return;
        }

        const filesToUpload = [...selectedFiles];
        setSelectedFiles([]); // Clear staging area immediately

        addLog('info', `[Upload] Initiating concurrent chunked upload for ${filesToUpload.length} file(s)...`);

        filesToUpload.forEach(async file => {
            const newUploadId = `native-upload-${Math.random().toString(36).substring(2, 9)}`;

            const newUploadTask: UploadItem = {
                uploadId: newUploadId,
                fileName: file.name,
                fileSize: file.size,
                fileUri: file.uri,
                mimeType: file.type || 'application/octet-stream',
                progress: 0,
                uploadedBytes: 0,
                status: 'uploading',
            };

            setUploads(prev => [newUploadTask, ...prev]);
            addLog(
                'info',
                `[Upload - ${newUploadId.substring(14)}] Starting task for ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
            );

            try {
                await uploadService.uploadFile(
                    {
                        uploadId: newUploadId,
                        fileUri: file.uri,
                        fileName: file.name,
                        fileSize: file.size,
                        mimeType: newUploadTask.mimeType,
                        uploadUrl: uploadUrl,
                        chunkSize: chunkSize,
                    },
                    progressPayload => {
                        // onProgress callback
                        setUploads(prev =>
                            prev.map(u =>
                                u.uploadId === progressPayload.uploadId
                                    ? {
                                          ...u,
                                          progress: progressPayload.progress,
                                          uploadedBytes: progressPayload.uploadedBytes,
                                          status: progressPayload.status,
                                      }
                                    : u
                            )
                        );

                        const percent = Math.round(progressPayload.progress * 100);
                        addLog(
                            'info',
                            `[Progress - ${progressPayload.uploadId.substring(14)}] ${percent}% | Status: ${progressPayload.status}`
                        );
                    },
                    completePayload => {
                        // onComplete callback
                        setUploads(prev =>
                            prev.map(u =>
                                u.uploadId === completePayload.uploadId
                                    ? {
                                          ...u,
                                          status: completePayload.success ? 'completed' : 'failed',
                                          progress: completePayload.success ? 1.0 : u.progress,
                                          uploadedBytes: completePayload.success ? u.fileSize : u.uploadedBytes,
                                      }
                                    : u
                            )
                        );

                        if (completePayload.success) {
                            addLog(
                                'success',
                                `[Complete - ${completePayload.uploadId.substring(14)}] Upload completed successfully!`
                            );
                        } else {
                            addLog(
                                'error',
                                `[Complete - ${completePayload.uploadId.substring(14)}] Upload failed: ${completePayload.error?.message ?? 'Unknown error'}`
                            );
                        }
                    },
                    cancelledId => {
                        // onCancel callback
                        setUploads(prev =>
                            prev.map(u =>
                                u.uploadId === cancelledId
                                    ? { ...u, status: 'cancelled', progress: 0, uploadedBytes: 0 }
                                    : u
                            )
                        );
                        addLog('warning', `[Cancel - ${cancelledId.substring(14)}] Native upload task cancelled.`);
                    }
                );
            } catch (e: any) {
                setUploads(prev => prev.map(u => (u.uploadId === newUploadId ? { ...u, status: 'failed' } : u)));
                addLog('error', `[Upload - ${newUploadId.substring(14)}] Loop startup failed: ${e.message}`);
            }
        });
    };

    // 3. Pause Upload
    const handlePause = (item: UploadItem) => {
        addLog('info', `[Upload - ${item.uploadId.substring(14)}] Requesting PAUSE...`);
        uploadService.pauseUpload(item.uploadId);
    };

    // 4. Resume Upload
    const handleResume = (item: UploadItem) => {
        addLog('info', `[Upload - ${item.uploadId.substring(14)}] Requesting RESUME...`);

        setUploads(prev => prev.map(u => (u.uploadId === item.uploadId ? { ...u, status: 'uploading' } : u)));

        uploadService.uploadFile(
            {
                uploadId: item.uploadId,
                fileUri: item.fileUri,
                fileName: item.fileName,
                fileSize: item.fileSize,
                mimeType: item.mimeType,
                uploadUrl: uploadUrl,
                chunkSize: chunkSize,
            },
            progressPayload => {
                setUploads(prev =>
                    prev.map(u =>
                        u.uploadId === progressPayload.uploadId
                            ? {
                                  ...u,
                                  progress: progressPayload.progress,
                                  uploadedBytes: progressPayload.uploadedBytes,
                                  status: progressPayload.status,
                              }
                            : u
                    )
                );
                const percent = Math.round(progressPayload.progress * 100);
                addLog(
                    'info',
                    `[Progress - ${progressPayload.uploadId.substring(14)}] ${percent}% | Status: ${progressPayload.status}`
                );
            },
            completePayload => {
                setUploads(prev =>
                    prev.map(u =>
                        u.uploadId === completePayload.uploadId
                            ? {
                                  ...u,
                                  status: completePayload.success ? 'completed' : 'failed',
                                  progress: completePayload.success ? 1.0 : u.progress,
                                  uploadedBytes: completePayload.success ? u.fileSize : u.uploadedBytes,
                              }
                            : u
                    )
                );
                if (completePayload.success) {
                    addLog(
                        'success',
                        `[Complete - ${completePayload.uploadId.substring(14)}] Upload completed successfully!`
                    );
                } else {
                    addLog(
                        'error',
                        `[Complete - ${completePayload.uploadId.substring(14)}] Upload failed: ${completePayload.error?.message ?? 'Unknown error'}`
                    );
                }
            },
            cancelledId => {
                setUploads(prev =>
                    prev.map(u =>
                        u.uploadId === cancelledId ? { ...u, status: 'cancelled', progress: 0, uploadedBytes: 0 } : u
                    )
                );
                addLog('warning', `[Cancel - ${cancelledId.substring(14)}] Native upload task cancelled.`);
            }
        );
    };

    // 5. Cancel Upload
    const handleCancel = (item: UploadItem) => {
        addLog('info', `[Upload - ${item.uploadId.substring(14)}] Requesting CANCEL...`);
        uploadService.cancelUpload(item.uploadId);
    };

    // Get color for status badge
    const getStatusColor = (status: UploadItem['status']) => {
        switch (status) {
            case 'uploading':
                return '#2ECC71';
            case 'paused':
                return '#F1C40F';
            case 'cancelled':
                return '#E74C3C';
            case 'completed':
                return '#3498DB';
            case 'failed':
                return '#962D22';
            default:
                return '#555';
        }
    };

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'success') color = '#2ECC71';
        if (item.type === 'warning') color = '#F1C40F';
        if (item.type === 'error') color = '#E74C3C';
        if (item.type === 'sent') color = '#3498DB';
        if (item.type === 'received') color = '#9B59B6';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>{item.message}</Text>
            </View>
        );
    };

    return (
        <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            {/* Title Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Pure Native Upload Test Screen</Text>
                <Text style={styles.headerSub}>
                    React Native UploadService Direct Testing (Concurrent Multi-Upload)
                </Text>
            </View>

            <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
                {/* Configuration Card */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Upload Settings</Text>

                    <Text style={styles.inputLabel}>Target Endpoint URL</Text>
                    <TextInput
                        style={styles.input}
                        value={uploadUrl}
                        onChangeText={setUploadUrl}
                        placeholder="http://localhost:8080/upload"
                        placeholderTextColor="#555"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />

                    <Text style={styles.inputLabel}>Chunk Size</Text>
                    <View style={styles.chunkRow}>
                        {[
                            { label: '512 KB', value: 512 * 1024 },
                            { label: '1.0 MB (기본)', value: 1024 * 1024 },
                            { label: '2.0 MB', value: 2 * 1024 * 1024 },
                            { label: '5.0 MB', value: 5 * 1024 * 1024 },
                        ].map(item => (
                            <TouchableOpacity
                                key={item.value}
                                style={[styles.chunkOption, chunkSize === item.value && styles.chunkOptionSelected]}
                                onPress={() => setChunkSize(item.value)}
                            >
                                <Text
                                    style={[
                                        styles.chunkOptionText,
                                        chunkSize === item.value && styles.chunkOptionTextSelected,
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Staging Picked Files */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Pick Files & Stage Upload</Text>

                    <TouchableOpacity style={[styles.actionBtn, styles.btnPrimary]} onPress={pickFile}>
                        <Text style={styles.actionBtnText}>Pick Files via Native DeviceService</Text>
                    </TouchableOpacity>

                    {selectedFiles.length > 0 ? (
                        <View style={styles.fileDetails}>
                            <Text style={styles.boldText}>Staged Files ({selectedFiles.length}):</Text>
                            {selectedFiles.map((file, idx) => (
                                <View key={`${file.uri}_${idx}`} style={styles.stagedFileItem}>
                                    <Text style={styles.stagedFileName} numberOfLines={1}>
                                        • {file.name}
                                    </Text>
                                    <Text style={styles.stagedFileSize}>
                                        ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                                    </Text>
                                </View>
                            ))}

                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.btnSuccess, { flex: 1, marginBottom: 0 }]}
                                    onPress={startUpload}
                                >
                                    <Text style={styles.actionBtnText}>
                                        Start Upload for All ({selectedFiles.length})
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.btnDanger, { flex: 0.5, marginBottom: 0 }]}
                                    onPress={() => setSelectedFiles([])}
                                >
                                    <Text style={styles.actionBtnText}>Clear</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>파일을 먼저 선택해주세요 (다중 선택 지원).</Text>
                    )}
                </View>

                {/* Active Concurrent Uploads List */}
                <View style={styles.card}>
                    <Text style={styles.cardLabel}>Active Upload Tasks ({uploads.length})</Text>

                    {uploads.length > 0 ? (
                        uploads.map(item => (
                            <View key={item.uploadId} style={styles.taskItem}>
                                <View style={styles.taskHeader}>
                                    <View style={{ flex: 1, marginRight: 8 }}>
                                        <Text style={styles.taskTitle} numberOfLines={1}>
                                            {item.fileName}
                                        </Text>
                                        <Text style={styles.taskIdText}>ID: {item.uploadId.substring(14)}</Text>
                                    </View>
                                    <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
                                        <Text style={styles.badgeText}>{item.status}</Text>
                                    </View>
                                </View>

                                <View style={styles.progressContainer}>
                                    <View style={styles.progressBarBg}>
                                        <View
                                            style={[
                                                styles.progressBarFill,
                                                {
                                                    width: `${item.progress * 100}%`,
                                                    backgroundColor: getStatusColor(item.status),
                                                },
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.progressInfo}>
                                        <Text style={[styles.progressPctText, { color: getStatusColor(item.status) }]}>
                                            {Math.round(item.progress * 100)}%
                                        </Text>
                                        <Text style={styles.progressBytesText}>
                                            {item.uploadedBytes.toLocaleString()} / {item.fileSize.toLocaleString()} B
                                        </Text>
                                    </View>
                                </View>

                                {/* Task Specific Control Buttons */}
                                <View style={styles.taskControls}>
                                    {item.status === 'uploading' && (
                                        <>
                                            <TouchableOpacity
                                                style={[styles.controlBtn, styles.btnWarning]}
                                                onPress={() => handlePause(item)}
                                            >
                                                <Text style={styles.controlBtnText}>Pause</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.controlBtn, styles.btnDanger]}
                                                onPress={() => handleCancel(item)}
                                            >
                                                <Text style={styles.controlBtnText}>Cancel</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}

                                    {item.status === 'paused' && (
                                        <>
                                            <TouchableOpacity
                                                style={[styles.controlBtn, styles.btnSuccess]}
                                                onPress={() => handleResume(item)}
                                            >
                                                <Text style={styles.controlBtnText}>Resume</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.controlBtn, styles.btnDanger]}
                                                onPress={() => handleCancel(item)}
                                            >
                                                <Text style={styles.controlBtnText}>Cancel</Text>
                                            </TouchableOpacity>
                                        </>
                                    )}

                                    {(item.status === 'completed' ||
                                        item.status === 'failed' ||
                                        item.status === 'cancelled') && (
                                        <Text style={styles.taskDoneText}>
                                            Task {item.status === 'completed' ? 'Successfully Finished' : 'Terminated'}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))
                    ) : (
                        <Text style={styles.emptyText}>등록된 업로드 작업이 없습니다.</Text>
                    )}
                </View>
            </ScrollView>

            {/* Logs Console */}
            {/* Logs Console Header */}
            <View style={styles.logHeader}>
                <TouchableOpacity
                    style={styles.logHeaderLeft}
                    onPress={() => setIsLogsExpanded(!isLogsExpanded)}
                    activeOpacity={0.7}
                >
                    <Text style={styles.logTitle}>Direct Native Logs Console ({logs.length})</Text>
                    <Text style={styles.toggleIcon}>{isLogsExpanded ? ' ▲' : ' ▼'}</Text>
                </TouchableOpacity>

                {isLogsExpanded && logs.length > 0 && (
                    <TouchableOpacity onPress={handleClearLogs} activeOpacity={0.7} style={styles.clearBtn}>
                        <Text style={styles.clearButtonText}>Clear Logs</Text>
                    </TouchableOpacity>
                )}
            </View>

            {isLogsExpanded && (
                <FlatList
                    ref={flatListRef}
                    data={logs}
                    keyExtractor={item => item.id}
                    renderItem={renderLogItem}
                    style={styles.logList}
                    contentContainerStyle={styles.logContent}
                    ListEmptyComponent={<Text style={styles.emptyText}>로그가 비어있습니다. 작업을 수행해주세요.</Text>}
                />
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        backgroundColor: '#1A1A1A',
    },
    headerTitle: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    headerSub: {
        color: '#888',
        fontSize: 12,
        marginTop: 2,
    },
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 12,
        paddingBottom: 24,
    },
    card: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#2D2D2D',
    },
    cardLabel: {
        color: '#3498DB',
        fontSize: 11,
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    inputLabel: {
        color: '#888',
        fontSize: 11,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    input: {
        backgroundColor: '#121212',
        color: '#FFF',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#333',
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        fontSize: 13,
        marginBottom: 12,
    },
    chunkRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    chunkOption: {
        backgroundColor: '#121212',
        borderWidth: 1,
        borderColor: '#333',
        borderRadius: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
    },
    chunkOptionSelected: {
        backgroundColor: '#3498DB20',
        borderColor: '#3498DB',
    },
    chunkOptionText: {
        color: '#777',
        fontSize: 11,
        fontWeight: 'bold',
    },
    chunkOptionTextSelected: {
        color: '#3498DB',
    },
    badge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    fileDetails: {
        backgroundColor: '#121212',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    fileDetailsText: {
        color: '#888',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        marginBottom: 4,
    },
    boldText: {
        color: '#DDD',
        fontWeight: 'bold',
        marginBottom: 6,
    },
    progressContainer: {
        marginTop: 10,
    },
    progressBarBg: {
        height: 8,
        backgroundColor: '#121212',
        borderRadius: 4,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    progressPctText: {
        fontWeight: 'bold',
        fontSize: 12,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    progressBytesText: {
        color: '#666',
        fontSize: 10,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    actionBtn: {
        height: 40,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    actionBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 13,
    },
    btnPrimary: {
        backgroundColor: '#3498DB',
    },
    btnSuccess: {
        backgroundColor: '#2ECC71',
    },
    btnWarning: {
        backgroundColor: '#F1C40F',
    },
    btnDanger: {
        backgroundColor: '#E74C3C',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#161616',
        borderTopWidth: 1,
        borderTopColor: '#222',
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    logHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        height: '100%',
        paddingVertical: 4,
    },
    toggleIcon: {
        color: '#9B59B6',
        fontSize: 10,
        fontWeight: 'bold',
    },
    clearBtn: {
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 4,
        backgroundColor: '#222',
    },
    logTitle: {
        color: '#9B59B6',
        fontWeight: 'bold',
        fontSize: 12,
    },
    clearButtonText: {
        color: '#FFF',
        fontSize: 11,
        fontWeight: 'bold',
    },
    logList: {
        height: 180,
        backgroundColor: '#0A0A0A',
    },
    logContent: {
        padding: 10,
    },
    logRow: {
        marginBottom: 4,
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    logTime: {
        color: '#444',
        fontSize: 11,
        marginRight: 6,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    logText: {
        fontSize: 12,
        flex: 1,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    emptyText: {
        color: '#444',
        fontSize: 11,
        textAlign: 'center',
        marginVertical: 12,
    },
    // New Styles for Task List & Staging
    stagedFileItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
    },
    stagedFileName: {
        color: '#888',
        fontSize: 12,
        flex: 1,
        marginRight: 10,
    },
    stagedFileSize: {
        color: '#555',
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    },
    taskItem: {
        backgroundColor: '#161616',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#2D2D2D',
    },
    taskHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    taskTitle: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 13,
    },
    taskIdText: {
        color: '#666',
        fontSize: 9,
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        marginTop: 2,
    },
    taskControls: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 10,
        alignItems: 'center',
    },
    controlBtn: {
        flex: 1,
        height: 28,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlBtnText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 11,
    },
    taskDoneText: {
        color: '#555',
        fontSize: 11,
        fontStyle: 'italic',
    },
});
