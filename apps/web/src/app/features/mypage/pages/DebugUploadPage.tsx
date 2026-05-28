import {
    AlertTriangle,
    CheckCircle2,
    ChevronLeft,
    FileText,
    Pause,
    Play,
    RefreshCw,
    Trash2,
    Upload,
    XCircle,
    Activity,
    Gauge,
    Clock,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMobileAppInfo, type RecoverableUploadTaskInfo } from '@chatic/app-messages';
import { useNavigateWithTransition } from '@chatic/shared';
import { webBridge } from '../../../shared/bridges';

type LogLevel = 'info' | 'success' | 'warning' | 'error';

interface LogEntry {
    id: string;
    level: LogLevel;
    label: string;
    message: string;
    timestamp: string;
}

interface SelectedFile {
    uri: string;
    name: string;
    type?: string;
    size: number;
    isGenerated?: boolean;
}

interface UploadTask {
    uploadId: string;
    fileName: string;
    fileSize: number;
    fileUri: string;
    mimeType: string;
    status: 'idle' | 'uploading' | 'paused' | 'cancelled' | 'completed' | 'failed';
    progress: number;
    uploadedBytes: number;
    error?: string;
    retryCount: number;
    startTime?: number;
    speed?: number; // MB/s
    eta?: number; // seconds
}

// --- UI Components ---
const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
    <section className="min-w-0 max-w-full overflow-hidden rounded-[20px] bg-card px-5 py-4 shadow-[0px_4px_20px_0px_rgba(0,0,0,0.04)] border border-border/40 dark:border-border dark:shadow-none">
        <div className="mb-3.5 flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary/90">{title}</p>
            {action}
        </div>
        {children}
    </section>
);

// Metric removed

const ActionButton = ({
    icon,
    label,
    onClick,
    tone = 'default',
    disabled,
    className = '',
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'ghost';
    disabled?: boolean;
    className?: string;
}) => {
    const toneClassName =
        tone === 'primary'
            ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/95 shadow-md shadow-primary/10'
            : tone === 'success'
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
              : tone === 'warning'
                ? 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                : tone === 'danger'
                  ? 'border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/20'
                  : tone === 'ghost'
                    ? 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    : 'border-border bg-background text-foreground hover:bg-muted/50';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-h-[40px] items-center justify-center gap-2 rounded-[12px] border px-4 text-[13px] font-bold disabled:opacity-40 disabled:pointer-events-none transition-all duration-200 active:scale-[0.98] ${toneClassName} ${className}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

const levelClassName: Record<LogLevel, string> = {
    info: 'bg-muted text-muted-foreground',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    error: 'bg-destructive/15 text-destructive',
};

export const DebugUploadPage = () => {
    const navigate = useNavigateWithTransition();

    // Configuration states
    const [uploadUrl, setUploadUrl] = useState('http://localhost:8080/upload');
    const [chunkSize, setChunkSize] = useState(1024 * 1024); // Default 1.0 MB
    const [autoRetryEnabled, setAutoRetryEnabled] = useState(true);
    const [autoResumeEnabled, setAutoResumeEnabled] = useState(true);

    // Files & Tasks states
    const [stagedFiles, setStagedFiles] = useState<SelectedFile[]>([]);
    const [tasks, setTasks] = useState<Record<string, UploadTask>>({});
    const [recoverableTasks, setRecoverableTasks] = useState<RecoverableUploadTaskInfo[]>([]);

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logEndRef = useRef<HTMLDivElement | null>(null);

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return getMobileAppInfo().isOnMobileApp;
    }, []);

    const recoverableIds = useMemo(() => new Set(recoverableTasks.map(t => t.uploadId)), [recoverableTasks]);

    const addLog = useCallback((level: LogLevel, label: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        setLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, level, label, message, timestamp }]);
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    // Configuration refs to avoid stale closures in event listeners
    const autoRetryEnabledRef = useRef(autoRetryEnabled);
    const autoResumeEnabledRef = useRef(autoResumeEnabled);
    const uploadUrlRef = useRef(uploadUrl);
    const chunkSizeRef = useRef(chunkSize);
    const activeAutoRetriesRef = useRef<Record<string, boolean>>({});

    useEffect(() => {
        autoRetryEnabledRef.current = autoRetryEnabled;
    }, [autoRetryEnabled]);
    useEffect(() => {
        autoResumeEnabledRef.current = autoResumeEnabled;
    }, [autoResumeEnabled]);
    useEffect(() => {
        uploadUrlRef.current = uploadUrl;
    }, [uploadUrl]);
    useEffect(() => {
        chunkSizeRef.current = chunkSize;
    }, [chunkSize]);

    const mockUploadIntervals = useRef<Record<string, NodeJS.Timeout>>({});

    useEffect(() => {
        return () => {
            Object.values(mockUploadIntervals.current).forEach(clearInterval);
        };
    }, []);

    const formatSize = useCallback((bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }, []);

    const formatETA = useCallback((seconds?: number) => {
        if (seconds === undefined || seconds === Infinity || isNaN(seconds) || seconds < 0) return '--:--';
        if (seconds < 60) return `${Math.round(seconds)}초`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.round(seconds % 60);
        return `${mins}분 ${secs}초`;
    }, []);

    const startMockUpload = useCallback(
        (uploadId: string, fileSize: number, initialUploadedBytes = 0) => {
            if (mockUploadIntervals.current[uploadId]) {
                clearInterval(mockUploadIntervals.current[uploadId]);
            }

            let uploadedBytes = initialUploadedBytes;
            const speedMB = 8 + Math.random() * 16; // 8 ~ 24 MB/s simulation
            const speedBytes = speedMB * 1024 * 1024;
            const intervalMs = 200;
            const bytesPerTick = speedBytes * (intervalMs / 1000);
            const startTime = Date.now() - (uploadedBytes / speedBytes) * 1000;

            addLog('info', 'MockUpload', `[${uploadId}] Starting simulated chunk upload at ${speedMB.toFixed(2)} MB/s`);

            const interval = setInterval(() => {
                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task || task.status !== 'uploading') {
                        clearInterval(interval);
                        delete mockUploadIntervals.current[uploadId];
                        return prev;
                    }

                    uploadedBytes = Math.min(fileSize, uploadedBytes + bytesPerTick);
                    const progress = uploadedBytes / fileSize;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const currentSpeed = elapsed > 0 ? uploadedBytes / (1024 * 1024) / elapsed : 0;
                    const remainingBytes = fileSize - uploadedBytes;
                    const eta = currentSpeed > 0 ? remainingBytes / (1024 * 1024) / currentSpeed : 0;

                    if (uploadedBytes >= fileSize) {
                        clearInterval(interval);
                        delete mockUploadIntervals.current[uploadId];

                        setTimeout(() => {
                            addLog('success', 'MockComplete', `[${uploadId}] Simulated upload completed successfully.`);
                        }, 50);

                        return {
                            ...prev,
                            [uploadId]: {
                                ...task,
                                status: 'completed',
                                progress: 1.0,
                                uploadedBytes: fileSize,
                                speed: 0,
                                eta: 0,
                            },
                        };
                    }

                    const percent = Math.round(progress * 100);
                    if (percent % 20 === 0 && percent !== 0 && percent !== 100) {
                        addLog(
                            'info',
                            'MockProgress',
                            `[${uploadId}] Progress: ${percent}% | Speed: ${currentSpeed.toFixed(2)} MB/s | ETA: ${formatETA(eta)}`
                        );
                    }

                    return {
                        ...prev,
                        [uploadId]: {
                            ...task,
                            progress,
                            uploadedBytes,
                            speed: currentSpeed,
                            eta,
                        },
                    };
                });
            }, intervalMs);

            mockUploadIntervals.current[uploadId] = interval;
        },
        [addLog, formatETA]
    );

    const stageDummyFile = useCallback(
        async (sizeInGB: number) => {
            const sizeInBytes = sizeInGB * 1024 * 1024 * 1024;
            const fileName = `dummy_${sizeInGB}GB_${Math.random().toString(36).substring(2, 6)}.bin`;

            if (isOnMobileApp) {
                addLog('info', 'Generator', `Requesting native sparse file allocation: ${sizeInGB}GB...`);
                try {
                    const response = await webBridge.request('CreateDummyFile', {
                        data: { sizeInBytes, fileName },
                    });
                    if (response.success && response.data) {
                        const doc = response.data;
                        const stagedFile: SelectedFile = {
                            uri: doc.uri,
                            name: doc.name,
                            type: 'application/octet-stream',
                            size: doc.size,
                            isGenerated: true,
                        };
                        setStagedFiles(prev => [...prev, stagedFile]);
                        addLog(
                            'success',
                            'Generator',
                            `Instantly allocated and staged ${sizeInGB}GB sparse test file.`
                        );
                    } else {
                        addLog(
                            'error',
                            'Generator',
                            `Sparse file allocation failed: ${response.error?.message ?? 'Unknown error'}`
                        );
                    }
                } catch (e: any) {
                    addLog('error', 'Generator', `Sparse file allocation bridge error: ${e.message}`);
                }
            } else {
                const stagedFile: SelectedFile = {
                    uri: `mock://local-documents/${fileName}`,
                    name: fileName,
                    type: 'application/octet-stream',
                    size: sizeInBytes,
                    isGenerated: true,
                };
                setStagedFiles(prev => [...prev, stagedFile]);
                addLog(
                    'success',
                    'Generator',
                    `(Simulation) Instantly allocated and staged ${sizeInGB}GB sparse test file.`
                );
            }
        },
        [isOnMobileApp, addLog]
    );

    // 1. Pick Multiple Files via native bridge
    const pickFiles = useCallback(async () => {
        addLog('info', 'DocumentPicker', 'Opening multiple file picker...');
        try {
            const response = await webBridge.request('OpenDocument', {
                data: {
                    allowMultiSelection: true,
                    includeBase64: false,
                },
            });

            const responseData = response.data as any;
            if (response.success && responseData?.documents?.length > 0) {
                const newFiles: SelectedFile[] = responseData.documents.map((doc: any) => ({
                    uri: doc.uri,
                    name: doc.name,
                    type: doc.type,
                    size: doc.size,
                }));

                setStagedFiles(prev => [...prev, ...newFiles]);
                addLog('success', 'DocumentPicker', `Successfully selected ${newFiles.length} files`);
            } else {
                addLog('warning', 'DocumentPicker', 'No document selected or operation cancelled.');
            }
        } catch (e: any) {
            addLog('error', 'DocumentPicker', `Error picking documents: ${e.message}`);
        }
    }, [addLog]);

    const removeStagedFile = useCallback((index: number) => {
        setStagedFiles(prev => {
            const copy = [...prev];
            copy.splice(index, 1);
            return copy;
        });
    }, []);

    // 2. Control specific upload tasks
    const pauseTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'UploadControl', `Requesting PAUSE for [ID: ${uploadId}]`);
            if (!isOnMobileApp) {
                if (mockUploadIntervals.current[uploadId]) {
                    clearInterval(mockUploadIntervals.current[uploadId]);
                    delete mockUploadIntervals.current[uploadId];
                }
                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task) return prev;
                    return {
                        ...prev,
                        [uploadId]: { ...task, status: 'paused', speed: 0, eta: 0 },
                    };
                });
                addLog('warning', 'UploadControl', `(Simulation) Paused [ID: ${uploadId}]`);
                return;
            }
            try {
                await webBridge.request('PauseFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Pause error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [isOnMobileApp, addLog]
    );

    const resumeTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'UploadControl', `Requesting RESUME for [ID: ${uploadId}]`);
            if (!isOnMobileApp) {
                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task) return prev;
                    startMockUpload(uploadId, task.fileSize, task.uploadedBytes);
                    return prev;
                });
                addLog('info', 'UploadControl', `(Simulation) Resuming [ID: ${uploadId}]`);
                return;
            }
            setTasks(prev => {
                const task = prev[uploadId];
                if (!task) return prev;
                return {
                    ...prev,
                    [uploadId]: {
                        ...task,
                        status: 'uploading',
                        startTime: Date.now(),
                    },
                };
            });
            try {
                await webBridge.request('ResumeFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Resume error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [isOnMobileApp, startMockUpload, addLog]
    );

    const cancelTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'UploadControl', `Requesting CANCEL for [ID: ${uploadId}]`);
            if (!isOnMobileApp) {
                if (mockUploadIntervals.current[uploadId]) {
                    clearInterval(mockUploadIntervals.current[uploadId]);
                    delete mockUploadIntervals.current[uploadId];
                }
                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task) return prev;
                    return {
                        ...prev,
                        [uploadId]: { ...task, status: 'cancelled', progress: 0, uploadedBytes: 0, speed: 0, eta: 0 },
                    };
                });
                addLog('warning', 'UploadControl', `(Simulation) Cancelled [ID: ${uploadId}]`);
                return;
            }
            try {
                await webBridge.request('CancelFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Cancel error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [isOnMobileApp, addLog]
    );

    const removeTask = useCallback(
        (uploadId: string) => {
            if (mockUploadIntervals.current[uploadId]) {
                clearInterval(mockUploadIntervals.current[uploadId]);
                delete mockUploadIntervals.current[uploadId];
            }
            setTasks(prev => {
                const copy = { ...prev };
                delete copy[uploadId];
                return copy;
            });
            addLog('info', 'UploadControl', `Removed task card [ID: ${uploadId}] from monitor`);
        },
        [addLog]
    );

    const loadRecoverables = useCallback(async () => {
        addLog('info', 'Recovery', 'Fetching recoverable upload tasks from device...');
        if (!isOnMobileApp) {
            addLog('info', 'Recovery', '(Simulation) Fetching recoverable upload tasks from device...');
            setRecoverableTasks([
                {
                    uploadId: 'mock-upload-recover-1',
                    status: 'paused',
                    payload: {
                        uploadId: 'mock-upload-recover-1',
                        fileUri: 'mock://local-documents/staged_recovery_1.bin',
                        fileName: 'staged_recovery_1.bin',
                        fileSize: 2.5 * 1024 * 1024 * 1024,
                        mimeType: 'application/octet-stream',
                        uploadUrl: uploadUrlRef.current,
                    },
                    uploadedBytes: 1.25 * 1024 * 1024 * 1024,
                    lastChunkIndex: 125,
                    retryCount: 0,
                    createdAt: Date.now() - 3600000,
                    updatedAt: Date.now() - 3600000,
                },
            ]);
            addLog('success', 'Recovery', '(Simulation) Loaded 1 recoverable task.');
            return;
        }
        try {
            const response = await webBridge.request('ListRecoverableUploads');
            if (!response.success) {
                addLog(
                    'error',
                    'Recovery',
                    `Failed to fetch recoverables: ${response.error?.message ?? 'Unknown error'}`
                );
                return;
            }

            const data = response.data as any;
            const tasksFromDevice = (data?.tasks ?? []) as RecoverableUploadTaskInfo[];
            setRecoverableTasks(tasksFromDevice);

            setTasks(prev => {
                const next = { ...prev };

                for (const t of tasksFromDevice) {
                    const payload = t.payload;
                    const progress =
                        payload.fileSize > 0 ? Math.min(1, Math.max(0, t.uploadedBytes / payload.fileSize)) : 0;

                    if (!next[t.uploadId]) {
                        next[t.uploadId] = {
                            uploadId: t.uploadId,
                            fileName: payload.fileName,
                            fileSize: payload.fileSize,
                            fileUri: payload.fileUri,
                            mimeType: payload.mimeType,
                            status: (t.status as any) ?? 'paused',
                            progress,
                            uploadedBytes: t.uploadedBytes,
                            retryCount: t.retryCount ?? 0,
                        };
                    }
                }

                return next;
            });

            addLog('success', 'Recovery', `Loaded ${tasksFromDevice.length} recoverable task(s).`);
        } catch (e: any) {
            addLog('error', 'Recovery', `Error fetching recoverables: ${e.message}`);
        }
    }, [isOnMobileApp, addLog]);

    const recoverTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'Recovery', `Requesting RECOVER for [ID: ${uploadId}]`);
            if (!isOnMobileApp) {
                const target = recoverableTasks.find(t => t.uploadId === uploadId);
                if (target) {
                    setTasks(prev => ({
                        ...prev,
                        [uploadId]: {
                            uploadId,
                            fileName: target.payload.fileName,
                            fileSize: target.payload.fileSize,
                            fileUri: target.payload.fileUri,
                            mimeType: target.payload.mimeType,
                            status: 'uploading',
                            progress: target.uploadedBytes / target.payload.fileSize,
                            uploadedBytes: target.uploadedBytes,
                            retryCount: 0,
                            startTime: Date.now(),
                        },
                    }));
                    startMockUpload(uploadId, target.payload.fileSize, target.uploadedBytes);
                    addLog('success', 'Recovery', `(Simulation) Resumed upload task: ${target.payload.fileName}`);
                }
                return;
            }
            try {
                await webBridge.request('RecoverUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'Recovery', `Recover error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [isOnMobileApp, recoverableTasks, startMockUpload, addLog]
    );

    const retryTaskViaRecovery = useCallback(
        async (uploadId: string) => {
            addLog('info', 'Recovery', `Requesting RETRY for [ID: ${uploadId}]`);
            if (!isOnMobileApp) {
                const target = recoverableTasks.find(t => t.uploadId === uploadId);
                if (target) {
                    setTasks(prev => ({
                        ...prev,
                        [uploadId]: {
                            uploadId,
                            fileName: target.payload.fileName,
                            fileSize: target.payload.fileSize,
                            fileUri: target.payload.fileUri,
                            mimeType: target.payload.mimeType,
                            status: 'uploading',
                            progress: 0,
                            uploadedBytes: 0,
                            retryCount: 0,
                            startTime: Date.now(),
                        },
                    }));
                    startMockUpload(uploadId, target.payload.fileSize, 0);
                    addLog('success', 'Recovery', `(Simulation) Retrying upload task: ${target.payload.fileName}`);
                }
                return;
            }
            try {
                await webBridge.request('RetryUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'Recovery', `Retry error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [isOnMobileApp, recoverableTasks, startMockUpload, addLog]
    );

    const performRetry = useCallback(
        async (task: UploadTask) => {
            addLog('info', 'UploadControl', `Initiating retry for: ${task.fileName} [ID: ${task.uploadId}]`);

            if (!isOnMobileApp) {
                startMockUpload(task.uploadId, task.fileSize, task.uploadedBytes > 0 ? task.uploadedBytes : 0);
                return;
            }

            if (isOnMobileApp) {
                try {
                    await retryTaskViaRecovery(task.uploadId);
                    addLog('info', 'Recovery', `Retry request accepted for [ID: ${task.uploadId}]`);
                    return;
                } catch (e: any) {
                    addLog(
                        'warning',
                        'Recovery',
                        `RetryUpload failed, falling back to legacy retry path: ${e.message}`
                    );
                }
            }

            if (task.uploadedBytes > 0) {
                try {
                    await resumeTask(task.uploadId);
                } catch (e: any) {
                    addLog(
                        'error',
                        'UploadControl',
                        `Failed to resume failed task [ID: ${task.uploadId}]: ${e.message}`
                    );
                    setTasks(prev => {
                        const t = prev[task.uploadId];
                        if (!t) return prev;
                        return {
                            ...prev,
                            [task.uploadId]: {
                                ...t,
                                status: 'failed',
                                error: e.message,
                            },
                        };
                    });
                }
            } else {
                try {
                    await webBridge.request('RequestFileUpload', {
                        data: {
                            uploadId: task.uploadId,
                            fileUri: task.fileUri,
                            fileName: task.fileName,
                            fileSize: task.fileSize,
                            mimeType: task.mimeType,
                            uploadUrl: uploadUrlRef.current,
                            chunkSize: chunkSizeRef.current,
                        },
                    });
                    addLog('info', 'UploadBridge', `Retry request accepted for [ID: ${task.uploadId}]`);
                } catch (e: any) {
                    setTasks(prev => {
                        const t = prev[task.uploadId];
                        if (!t) return prev;
                        return {
                            ...prev,
                            [task.uploadId]: {
                                ...t,
                                status: 'failed',
                                error: e.message,
                            },
                        };
                    });
                    addLog('error', 'UploadBridge', `Failed to retry upload [ID: ${task.uploadId}]: ${e.message}`);
                }
            }
        },
        [isOnMobileApp, retryTaskViaRecovery, resumeTask, startMockUpload, addLog]
    );

    const triggerAutoRetry = useCallback(
        (uploadId: string) => {
            if (!autoRetryEnabledRef.current) return;
            if (activeAutoRetriesRef.current[uploadId]) return;

            activeAutoRetriesRef.current[uploadId] = true;

            setTimeout(() => {
                delete activeAutoRetriesRef.current[uploadId];

                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task || task.status !== 'failed') return prev;
                    if (task.retryCount >= 3) {
                        addLog('error', 'AutoRetry', `[${uploadId}] Exceeded maximum retry attempts (3/3)`);
                        return prev;
                    }

                    const nextRetryCount = task.retryCount + 1;
                    addLog(
                        'warning',
                        'AutoRetry',
                        `[${uploadId}] Automatically retrying upload (Attempt ${nextRetryCount}/3) in 2 seconds...`
                    );

                    const updatedTasks = {
                        ...prev,
                        [uploadId]: {
                            ...task,
                            status: 'uploading' as const,
                            retryCount: nextRetryCount,
                            error: undefined,
                            startTime: Date.now(),
                        },
                    };

                    void performRetry({
                        ...task,
                        status: 'uploading',
                        retryCount: nextRetryCount,
                        error: undefined,
                        startTime: Date.now(),
                    });

                    return updatedTasks;
                });
            }, 2000);
        },
        [performRetry, addLog]
    );

    const handleRetry = useCallback(
        async (task: UploadTask) => {
            addLog('info', 'UploadControl', `Manually retrying failed task: ${task.fileName} [ID: ${task.uploadId}]`);

            setTasks(prev => {
                const t = prev[task.uploadId];
                if (!t) return prev;
                return {
                    ...prev,
                    [task.uploadId]: {
                        ...t,
                        status: 'uploading',
                        retryCount: 0,
                        error: undefined,
                        startTime: Date.now(),
                    },
                };
            });

            await performRetry({
                ...task,
                status: 'uploading',
                retryCount: 0,
                error: undefined,
                startTime: Date.now(),
            });
        },
        [performRetry, addLog]
    );

    // 3. Start single upload task
    const startSingleUpload = useCallback(
        async (file: SelectedFile) => {
            const uploadId = `upload-${Math.random().toString(36).substring(2, 9)}`;

            // Add to active tasks
            setTasks(prev => ({
                ...prev,
                [uploadId]: {
                    uploadId,
                    fileName: file.name,
                    fileSize: file.size,
                    fileUri: file.uri,
                    mimeType: file.type || 'application/octet-stream',
                    status: 'uploading',
                    progress: 0,
                    uploadedBytes: 0,
                    retryCount: 0,
                    startTime: Date.now(),
                },
            }));

            addLog('info', 'UploadInit', `Starting upload for ${file.name} [ID: ${uploadId}]`);

            if (!isOnMobileApp) {
                startMockUpload(uploadId, file.size);
                return;
            }

            try {
                await webBridge.request('RequestFileUpload', {
                    data: {
                        uploadId,
                        fileUri: file.uri,
                        fileName: file.name,
                        fileSize: file.size,
                        mimeType: file.type || 'application/octet-stream',
                        uploadUrl: uploadUrlRef.current,
                        chunkSize: chunkSizeRef.current,
                    },
                });
                addLog('info', 'UploadBridge', `Upload request accepted for [ID: ${uploadId}]`);
            } catch (e: any) {
                setTasks(prev => {
                    const task = prev[uploadId];
                    if (!task) return prev;
                    return {
                        ...prev,
                        [uploadId]: {
                            ...task,
                            status: 'failed',
                            error: e.message,
                        },
                    };
                });
                addLog('error', 'UploadBridge', `Failed to start upload [ID: ${uploadId}]: ${e.message}`);
                triggerAutoRetry(uploadId);
            }
        },
        [isOnMobileApp, startMockUpload, triggerAutoRetry, addLog]
    );

    // 4. Start all staged uploads
    const startUploadAll = useCallback(async () => {
        if (stagedFiles.length === 0) return;
        addLog('info', 'UploadAll', `Triggering parallel uploads for all ${stagedFiles.length} staged files`);

        const filesToUpload = [...stagedFiles];
        setStagedFiles([]); // Clear staged panel

        // Start uploads concurrently
        for (const file of filesToUpload) {
            void startSingleUpload(file);
        }
    }, [stagedFiles, startSingleUpload, addLog]);

    const retryAllFailed = useCallback(() => {
        const failedTasks = Object.values(tasks).filter(t => t.status === 'failed');
        if (failedTasks.length === 0) return;

        addLog('info', 'UploadControl', `Retrying all failed tasks (${failedTasks.length} tasks)`);
        for (const task of failedTasks) {
            void handleRetry(task);
        }
    }, [tasks, handleRetry, addLog]);

    const removeAllFailed = useCallback(() => {
        const failedTasks = Object.values(tasks).filter(t => t.status === 'failed');
        if (failedTasks.length === 0) return;

        setTasks(prev => {
            const copy = { ...prev };
            for (const task of failedTasks) {
                delete copy[task.uploadId];
            }
            return copy;
        });
        addLog('info', 'UploadControl', `Removed all failed tasks (${failedTasks.length} tasks) from monitor`);
    }, [tasks, addLog]);

    // 5. Connect bridge listeners to receive real-time push events
    useEffect(() => {
        if (!isOnMobileApp) return;

        addLog('info', 'Bridge', 'Registering native upload event listeners...');

        // Progress listener
        const unsubProgress = webBridge.onEvent('OnUploadProgress', message => {
            const payload = message.data;
            if (!payload) return;

            setTasks(prev => {
                const task = prev[payload.uploadId];
                if (!task) return prev;

                const elapsed = (Date.now() - (task.startTime || Date.now())) / 1000;
                const speed = elapsed > 0 ? payload.uploadedBytes / (1024 * 1024) / elapsed : 0;
                const remainingBytes = task.fileSize - payload.uploadedBytes;
                const eta = speed > 0 ? remainingBytes / (1024 * 1024) / speed : 0;

                return {
                    ...prev,
                    [payload.uploadId]: {
                        ...task,
                        progress: payload.progress,
                        uploadedBytes: payload.uploadedBytes,
                        status: payload.status,
                        speed,
                        eta,
                    },
                };
            });

            const progressPct = Math.round(payload.progress * 100);
            if (progressPct % 10 === 0) {
                addLog(
                    payload.status === 'failed' ? 'error' : payload.status === 'paused' ? 'warning' : 'info',
                    'NativeProgress',
                    `[${payload.uploadId}] Status: ${payload.status} | Progress: ${progressPct}% (${payload.uploadedBytes}/${payload.totalBytes} bytes)`
                );
            }

            if (payload.status === 'failed') {
                triggerAutoRetry(payload.uploadId);
            }
        });

        // Complete listener
        const unsubComplete = webBridge.onEvent('OnUploadComplete', message => {
            const payload = message.data;
            if (!payload) return;

            setTasks(prev => {
                const task = prev[payload.uploadId];
                if (!task) return prev;
                return {
                    ...prev,
                    [payload.uploadId]: {
                        ...task,
                        status: payload.success ? 'completed' : 'failed',
                        progress: payload.success ? 1.0 : task.progress,
                        uploadedBytes: payload.success ? task.fileSize : task.uploadedBytes,
                        error: payload.error?.message,
                        speed: 0,
                        eta: 0,
                    },
                };
            });

            if (payload.success) {
                addLog('success', 'NativeComplete', `[${payload.uploadId}] Upload completed successfully.`);
            } else {
                addLog(
                    'error',
                    'NativeComplete',
                    `[${payload.uploadId}] Upload failed. Error: ${payload.error?.message ?? 'Unknown'}`
                );
                triggerAutoRetry(payload.uploadId);
            }
        });

        // Background/Foreground status listener
        const unsubBackground = webBridge.onEvent('OnBackgroundStatusChanged', message => {
            const payload = message.data;
            if (!payload) return;

            addLog(
                'info',
                'NativeAppState',
                `App state changed to ${payload.status} (isForeground: ${payload.isForeground})`
            );

            if (payload.isForeground && autoResumeEnabledRef.current) {
                setTasks(prev => {
                    const taskValues = Object.values(prev);
                    const pausedTasks = taskValues.filter(t => t.status === 'paused');
                    const failedTasks = taskValues.filter(t => t.status === 'failed');

                    if (pausedTasks.length > 0 || failedTasks.length > 0) {
                        addLog(
                            'info',
                            'AutoResume',
                            `App returned to foreground. Auto-resuming ${pausedTasks.length} paused and ${failedTasks.length} failed tasks.`
                        );
                    }

                    // Auto-resume paused tasks
                    for (const task of pausedTasks) {
                        void resumeTask(task.uploadId);
                    }

                    // Auto-retry failed tasks
                    for (const task of failedTasks) {
                        void performRetry({
                            ...task,
                            status: 'uploading',
                            retryCount: 0,
                            error: undefined,
                            startTime: Date.now(),
                        });
                    }

                    if (failedTasks.length === 0) return prev;

                    const next = { ...prev };
                    for (const task of failedTasks) {
                        next[task.uploadId] = {
                            ...task,
                            status: 'uploading',
                            retryCount: 0,
                            error: undefined,
                            startTime: Date.now(),
                        };
                    }
                    return next;
                });
            }
        });

        return () => {
            unsubProgress();
            unsubComplete();
            unsubBackground();
            addLog('info', 'Bridge', 'Unregistered event listeners');
        };
    }, [isOnMobileApp, triggerAutoRetry, resumeTask, performRetry, addLog]);

    const getStatusBadgeStyle = (status: UploadTask['status']) => {
        switch (status) {
            case 'uploading':
                return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
            case 'paused':
                return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
            case 'cancelled':
                return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
            case 'completed':
                return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
            case 'failed':
                return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
            default:
                return 'bg-muted text-muted-foreground border-border';
        }
    };

    const taskList = useMemo(() => Object.values(tasks), [tasks]);
    const overallProgress = useMemo(() => {
        if (taskList.length === 0) return 0;
        const totalSize = taskList.reduce((acc, t) => acc + t.fileSize, 0);
        const totalUploaded = taskList.reduce((acc, t) => acc + t.uploadedBytes, 0);
        return totalSize > 0 ? totalUploaded / totalSize : 0;
    }, [taskList]);

    const activeTasksCount = useMemo(() => {
        return taskList.filter(t => t.status === 'uploading').length;
    }, [taskList]);

    const totalSpeed = useMemo(() => {
        return taskList.reduce((acc, t) => {
            if (t.status === 'uploading' && t.speed) {
                return acc + t.speed;
            }
            return acc;
        }, 0);
    }, [taskList]);

    const combinedETA = useMemo(() => {
        const activeTasks = taskList.filter(t => t.status === 'uploading');
        if (activeTasks.length === 0 || totalSpeed === 0) return 0;

        const totalRemainingBytes = activeTasks.reduce((acc, t) => acc + (t.fileSize - t.uploadedBytes), 0);
        const totalSpeedBytes = totalSpeed * 1024 * 1024;
        return totalSpeedBytes > 0 ? totalRemainingBytes / totalSpeedBytes : 0;
    }, [taskList, totalSpeed]);

    const totalDataSent = useMemo(() => {
        return taskList.reduce((acc, t) => acc + t.uploadedBytes, 0);
    }, [taskList]);

    const totalDataSize = useMemo(() => {
        return taskList.reduce((acc, t) => acc + t.fileSize, 0);
    }, [taskList]);

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background pt-safe-top">
            <header className="flex items-center px-2 py-1.5 border-b border-border/20 bg-background/95 backdrop-blur-md sticky top-0 z-10">
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full p-2.5 hover:bg-muted transition-colors active:scale-95"
                >
                    <ChevronLeft size={24} strokeWidth={2.5} />
                </button>
                <div className="ml-2.5">
                    <h1 className="text-[15px] font-extrabold text-foreground tracking-tight">
                        대용량 파일 다중 백그라운드 전송
                    </h1>
                    <p className="text-[10px] text-muted-foreground/80 font-medium">
                        Native FileManager Bridge 및 백그라운드 수명 제어
                    </p>
                </div>
            </header>

            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none pb-safe-bottom">
                <div className="flex min-w-0 max-w-full flex-col gap-4 p-4 pb-12">
                    {/* Native App Status Indicator */}
                    {!isOnMobileApp && (
                        <div className="rounded-[18px] bg-amber-500/10 border border-amber-500/20 p-4 flex gap-3 items-start">
                            <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5 animate-pulse" />
                            <div>
                                <h3 className="text-[13px] font-bold text-amber-600 dark:text-amber-400">
                                    모바일 웹뷰 비동기 모드
                                </h3>
                                <p className="mt-1 text-[11px] leading-relaxed text-amber-600/90 dark:text-amber-400/90">
                                    네이티브 브릿지 통신은 모바일 앱 웹뷰 내부에서만 활성화됩니다. PC 브라우저 등 외부
                                    환경에서는 시뮬레이션 로그만 기록됩니다.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Settings Config Card */}
                    <Section title="네트워크 및 분할 전송 설정">
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground/80 font-bold">
                                    업로드 대상 API 엔드포인트 URL
                                </label>
                                <input
                                    type="text"
                                    value={uploadUrl}
                                    onChange={e => setUploadUrl(e.target.value)}
                                    placeholder="https://your-server.com/upload"
                                    className="w-full rounded-[12px] border border-border bg-background px-3.5 py-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary transition-all shadow-inner focus:shadow-none"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[10px] uppercase tracking-wider text-muted-foreground/80 font-bold">
                                    업로드 분할 전송 청크 크기 (Chunk Size)
                                </label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: '1 MB', val: 1024 * 1024 },
                                        { label: '5 MB (대용량)', val: 5 * 1024 * 1024 },
                                        { label: '10 MB', val: 10 * 1024 * 1024 },
                                        { label: '25 MB', val: 25 * 1024 * 1024 },
                                    ].map(opt => (
                                        <button
                                            key={opt.val}
                                            type="button"
                                            onClick={() => setChunkSize(opt.val)}
                                            className={`rounded-[10px] border py-2 text-[11px] font-bold transition-all ${
                                                chunkSize === opt.val
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-1">
                                <button
                                    type="button"
                                    onClick={() => setAutoRetryEnabled(!autoRetryEnabled)}
                                    className={`flex items-center justify-between rounded-[12px] border px-3.5 py-2.5 text-[12.5px] font-bold transition-all ${
                                        autoRetryEnabled
                                            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                                            : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                    }`}
                                >
                                    <span>실패 시 자동 재시도 (최대 3회)</span>
                                    <div
                                        className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ${autoRetryEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                                    >
                                        <div
                                            className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${autoRetryEnabled ? 'translate-x-3.5' : 'translate-x-0'}`}
                                        />
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setAutoResumeEnabled(!autoResumeEnabled)}
                                    className={`flex items-center justify-between rounded-[12px] border px-3.5 py-2.5 text-[12.5px] font-bold transition-all ${
                                        autoResumeEnabled
                                            ? 'border-primary/30 bg-primary/5 text-primary'
                                            : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                                    }`}
                                >
                                    <span>포그라운드 진입 시 자동 재개</span>
                                    <div
                                        className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ${autoResumeEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                    >
                                        <div
                                            className={`w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${autoResumeEnabled ? 'translate-x-3.5' : 'translate-x-0'}`}
                                        />
                                    </div>
                                </button>
                            </div>
                        </div>
                    </Section>

                    {/* File Selection & Staged Files Panel */}
                    <Section
                        title={`업로드 대기 리스트 (${stagedFiles.length})`}
                        action={
                            <ActionButton
                                icon={<FileText size={13} />}
                                label="기기 파일 추가"
                                tone="ghost"
                                onClick={pickFiles}
                                className="min-h-[30px] px-2.5 text-[11px] rounded-[8px]"
                            />
                        }
                    >
                        <div className="mb-3.5 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => stageDummyFile(1)}
                                className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-[12px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 text-[11.5px] font-bold transition-all active:scale-[0.98]"
                            >
                                <Activity size={12} />
                                <span>1GB Sparse 생성 스테이징</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => stageDummyFile(5)}
                                className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-[12px] border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 text-[11.5px] font-bold transition-all active:scale-[0.98]"
                            >
                                <Activity size={12} />
                                <span>5GB Sparse 생성 스테이징</span>
                            </button>
                        </div>

                        {stagedFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 rounded-[16px] border border-dashed border-border/60 bg-muted/20">
                                <Upload size={28} className="text-muted-foreground/40 mb-2" />
                                <p className="text-[12px] font-semibold text-muted-foreground">
                                    대기 중인 파일이 없습니다.
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                    기기 파일을 추가하거나 위의 단축 버튼을 사용해 대용량 Sparse 더미 파일을 준비해
                                    전송하세요.
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <div className="max-h-[220px] overflow-y-auto pr-1 flex flex-col gap-2">
                                    {stagedFiles.map((file, idx) => (
                                        <div
                                            key={`${file.uri}-${idx}`}
                                            className="flex items-center justify-between p-3 rounded-[12px] border border-border/50 bg-muted/10"
                                        >
                                            <div className="min-w-0 flex-1 flex items-center gap-2.5">
                                                <FileText size={18} className="text-primary/70 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-[12px] font-bold text-foreground truncate">
                                                            {file.name}
                                                        </p>
                                                        {file.isGenerated && (
                                                            <span className="shrink-0 text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded-[4px] border border-primary/20 uppercase tracking-wider">
                                                                Sparse Dummy
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                                        {formatSize(file.size)} | {file.type || 'unknown'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <ActionButton
                                                    icon={<Upload size={12} />}
                                                    label="시작"
                                                    tone="success"
                                                    onClick={() => {
                                                        void startSingleUpload(file);
                                                        removeStagedFile(idx);
                                                    }}
                                                    className="min-h-[32px] px-3 text-[11px] rounded-[8px]"
                                                />
                                                <button
                                                    onClick={() => removeStagedFile(idx)}
                                                    className="p-2 rounded-[8px] border border-transparent hover:border-destructive/20 hover:bg-destructive/10 text-destructive/80 hover:text-destructive transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <ActionButton
                                    icon={<Upload size={14} />}
                                    label="대기 파일 전체 일괄 업로드"
                                    tone="primary"
                                    onClick={startUploadAll}
                                    className="w-full mt-2"
                                />
                            </div>
                        )}
                    </Section>

                    {/* Manual Recovery Panel */}
                    {isOnMobileApp && (
                        <Section
                            title={`수동 복구 작업 목록 (${recoverableTasks.length})`}
                            action={
                                <ActionButton
                                    icon={<RefreshCw size={13} />}
                                    label="복구 목록 새로고침"
                                    tone="ghost"
                                    onClick={loadRecoverables}
                                    className="min-h-[30px] px-2.5 text-[11px] rounded-[8px]"
                                />
                            }
                        >
                            <p className="text-[12px] text-muted-foreground leading-relaxed">
                                앱이 중도 종료되었거나 웹이 리로드된 경우에도, 기기 로컬 DB에 남아있는 업로드 작업을
                                불러와
                                <span className="font-bold text-foreground"> 복구 재개/재시도</span>할 수 있습니다.
                            </p>

                            {recoverableTasks.length === 0 ? (
                                <div className="mt-3 rounded-[14px] border border-border/50 bg-muted/20 p-4 text-[12px] text-muted-foreground">
                                    현재 복구 가능한 업로드 작업이 없습니다.
                                </div>
                            ) : (
                                <div className="mt-3 flex flex-col gap-2">
                                    {recoverableTasks.slice(0, 5).map(t => (
                                        <div
                                            key={t.uploadId}
                                            className="flex items-center justify-between gap-3 rounded-[14px] border border-border/50 bg-card/40 px-3.5 py-2.5"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[12px] font-extrabold text-foreground truncate">
                                                    {t.payload.fileName}
                                                </p>
                                                <p className="text-[10px] font-mono text-muted-foreground truncate">
                                                    {t.uploadId} • {t.status} • {formatSize(t.uploadedBytes)}/
                                                    {formatSize(t.payload.fileSize)}
                                                </p>
                                            </div>
                                            <div className="flex gap-1.5 shrink-0">
                                                <ActionButton
                                                    icon={<Play size={11} />}
                                                    label="복구 재개"
                                                    tone="success"
                                                    onClick={() => recoverTask(t.uploadId)}
                                                    className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                />
                                                <ActionButton
                                                    icon={<RefreshCw size={11} />}
                                                    label="재시도"
                                                    tone="warning"
                                                    onClick={() => retryTaskViaRecovery(t.uploadId)}
                                                    className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    {recoverableTasks.length > 5 && (
                                        <p className="text-[10.5px] text-muted-foreground mt-1">
                                            (+{recoverableTasks.length - 5} more…)
                                        </p>
                                    )}
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Upload Performance Measurement Dashboard */}
                    {taskList.length > 0 && (
                        <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 p-5 shadow-[0px_8px_30px_rgba(0,0,0,0.12)]">
                            <div className="absolute -right-16 -top-16 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />

                            <div className="flex items-center justify-between">
                                <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
                                    <Gauge size={13} className="animate-pulse text-primary" />
                                    업로드 성능측정 대시보드
                                </h3>
                                {activeTasksCount > 0 && (
                                    <span className="flex h-2 w-2 relative">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="bg-card/60 backdrop-blur-md rounded-[16px] p-3.5 border border-border/30 shadow-inner flex flex-col justify-between">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80 font-bold flex items-center gap-1">
                                        <Activity size={10} className="text-emerald-500 animate-pulse" />총 전송 속도
                                        (Bandwidth)
                                    </span>
                                    <div className="mt-1 flex items-baseline gap-1">
                                        <p className="text-[20px] font-black text-foreground font-mono leading-none">
                                            {totalSpeed.toFixed(2)}
                                        </p>
                                        <span className="text-[10px] text-muted-foreground font-bold">MB/s</span>
                                    </div>
                                    <div className="mt-2 text-[9px] text-muted-foreground font-semibold">
                                        {totalSpeed > 20
                                            ? '🔥 초고속 대역폭'
                                            : totalSpeed > 5
                                              ? '⚡ 안정적인 네트워크'
                                              : activeTasksCount > 0
                                                ? '🕒 속도 측정중'
                                                : '대기 중'}
                                    </div>
                                </div>

                                <div className="bg-card/60 backdrop-blur-md rounded-[16px] p-3.5 border border-border/30 shadow-inner flex flex-col justify-between">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground/80 font-bold flex items-center gap-1">
                                        <Clock size={10} className="text-sky-500" />
                                        전체 예상 남은 시간 (Combined ETA)
                                    </span>
                                    <p className="mt-1 text-[16px] font-black text-sky-500 font-mono leading-none">
                                        {formatETA(combinedETA)}
                                    </p>
                                    <div className="mt-2 text-[9px] text-muted-foreground font-semibold truncate">
                                        {activeTasksCount > 0
                                            ? `${activeTasksCount}개 채널 병렬 전송중`
                                            : '대기 중인 전송 없음'}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 mt-3">
                                <div className="text-center bg-card/45 backdrop-blur-sm rounded-[12px] py-2 px-1 border border-border/20">
                                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/80 font-bold block">
                                        진행 / 전체
                                    </span>
                                    <p className="text-[12px] font-black text-primary mt-0.5">
                                        {activeTasksCount} / {taskList.length}
                                    </p>
                                </div>
                                <div className="text-center bg-card/45 backdrop-blur-sm rounded-[12px] py-2 px-1 border border-border/20">
                                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/80 font-bold block">
                                        전송된 데이터
                                    </span>
                                    <p className="text-[12px] font-black text-foreground mt-0.5 font-mono truncate">
                                        {formatSize(totalDataSent)}
                                    </p>
                                </div>
                                <div className="text-center bg-card/45 backdrop-blur-sm rounded-[12px] py-2 px-1 border border-border/20">
                                    <span className="text-[8px] uppercase tracking-wide text-muted-foreground/80 font-bold block">
                                        전체 진행률
                                    </span>
                                    <p className="text-[12px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        {Math.round(overallProgress * 100)}%
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col gap-1.5">
                                <div className="flex justify-between items-center text-[9px] text-muted-foreground font-bold">
                                    <span>누적 전송률</span>
                                    <span className="font-mono">
                                        {formatSize(totalDataSent)} / {formatSize(totalDataSize)}
                                    </span>
                                </div>
                                <div className="w-full bg-muted/60 dark:bg-muted/30 rounded-full h-3 overflow-hidden border border-border/30 shadow-inner">
                                    <div
                                        className="bg-gradient-to-r from-primary via-sky-500 to-emerald-500 h-full transition-all duration-300 ease-out"
                                        style={{ width: `${overallProgress * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Active Upload Tasks Monitor Panel */}
                    {taskList.length > 0 && (
                        <Section
                            title={`활성 업로드 모니터 (${taskList.length})`}
                            action={
                                taskList.some(t => t.status === 'failed') ? (
                                    <div className="flex gap-2.5 items-center">
                                        <button
                                            type="button"
                                            onClick={retryAllFailed}
                                            className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors uppercase tracking-wider flex items-center gap-1.5"
                                        >
                                            <RefreshCw size={11} />
                                            <span>실패 항목 모두 재시도</span>
                                        </button>
                                        <span className="text-muted-foreground/30 text-[9px]">|</span>
                                        <button
                                            type="button"
                                            onClick={removeAllFailed}
                                            className="text-[10px] font-extrabold text-destructive hover:underline transition-colors uppercase tracking-wider flex items-center gap-1.5"
                                        >
                                            <Trash2 size={11} />
                                            <span>실패 항목 모두 삭제</span>
                                        </button>
                                    </div>
                                ) : undefined
                            }
                        >
                            <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                                {taskList.map(task => {
                                    const progressPct = Math.round(task.progress * 100);
                                    return (
                                        <div
                                            key={task.uploadId}
                                            className="p-4 rounded-[16px] border border-border/50 bg-card/50 flex flex-col gap-3 transition-colors hover:border-primary/20"
                                        >
                                            {/* File Info Header */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <h4 className="text-[12.5px] font-extrabold text-foreground truncate break-all">
                                                        {task.fileName}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                                        <span className="text-[9px] font-mono text-muted-foreground font-bold">
                                                            ID: {task.uploadId}
                                                        </span>
                                                        <span className="text-muted-foreground/30">•</span>
                                                        <span className="text-[9px] font-mono text-muted-foreground font-bold">
                                                            {formatSize(task.fileSize)}
                                                        </span>
                                                        {task.retryCount > 0 && (
                                                            <>
                                                                <span className="text-muted-foreground/30">•</span>
                                                                <span className="text-[9px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-[4px]">
                                                                    자동 재시도 {task.retryCount}회차
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                <span
                                                    className={`inline-block px-2.5 py-0.5 rounded-[6px] border text-[9.5px] font-black uppercase ${getStatusBadgeStyle(task.status)}`}
                                                >
                                                    {task.status}
                                                </span>
                                            </div>

                                            {/* Inline control buttons */}
                                            <div className="flex gap-2 justify-end">
                                                {task.status === 'uploading' && (
                                                    <ActionButton
                                                        icon={<Pause size={12} />}
                                                        label="일시정지"
                                                        tone="warning"
                                                        onClick={() => pauseTask(task.uploadId)}
                                                        className="min-h-[30px] text-[11px] py-1 px-3 rounded-[8px]"
                                                    />
                                                )}
                                                {task.status === 'paused' && (
                                                    <ActionButton
                                                        icon={<Play size={12} />}
                                                        label={
                                                            isOnMobileApp && recoverableIds.has(task.uploadId)
                                                                ? '복구 재개'
                                                                : '재개'
                                                        }
                                                        tone="success"
                                                        onClick={() =>
                                                            isOnMobileApp && recoverableIds.has(task.uploadId)
                                                                ? recoverTask(task.uploadId)
                                                                : resumeTask(task.uploadId)
                                                        }
                                                        className="min-h-[30px] text-[11px] py-1 px-3 rounded-[8px]"
                                                    />
                                                )}
                                                {(task.status === 'uploading' || task.status === 'paused') && (
                                                    <ActionButton
                                                        icon={<XCircle size={12} />}
                                                        label="취소"
                                                        tone="danger"
                                                        onClick={() => cancelTask(task.uploadId)}
                                                        className="min-h-[30px] text-[11px] py-1 px-3 rounded-[8px]"
                                                    />
                                                )}
                                                {task.status === 'completed' && (
                                                    <div className="flex items-center justify-between w-full pl-1">
                                                        <div className="flex items-center gap-1 text-emerald-500 font-bold text-[11px] py-1">
                                                            <CheckCircle2 size={14} />
                                                            <span>업로드 성공</span>
                                                        </div>
                                                        <ActionButton
                                                            icon={<Trash2 size={11} />}
                                                            label="삭제"
                                                            tone="ghost"
                                                            onClick={() => removeTask(task.uploadId)}
                                                            className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                        />
                                                    </div>
                                                )}
                                                {task.status === 'cancelled' && (
                                                    <div className="flex items-center justify-between w-full pl-1">
                                                        <div className="flex items-center gap-1 text-rose-500 font-bold text-[11px] py-1">
                                                            <XCircle size={14} />
                                                            <span>전송 취소됨</span>
                                                        </div>
                                                        <ActionButton
                                                            icon={<Trash2 size={11} />}
                                                            label="삭제"
                                                            tone="ghost"
                                                            onClick={() => removeTask(task.uploadId)}
                                                            className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                        />
                                                    </div>
                                                )}
                                                {task.status === 'failed' && (
                                                    <div className="flex items-center justify-between w-full gap-2 pl-1">
                                                        <div className="flex flex-col items-start gap-0.5 text-red-500 text-[11px] min-w-0 flex-1">
                                                            <div className="flex items-center gap-1 font-bold">
                                                                <AlertTriangle size={13} className="shrink-0" />
                                                                <span>업로드 실패</span>
                                                            </div>
                                                            {task.error && (
                                                                <p className="text-[9.5px] text-red-400 font-semibold truncate max-w-full pl-4">
                                                                    {task.error}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-1.5 shrink-0">
                                                            <ActionButton
                                                                icon={<RefreshCw size={11} />}
                                                                label="재시도"
                                                                tone="success"
                                                                onClick={() => handleRetry(task)}
                                                                className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                            />
                                                            <ActionButton
                                                                icon={<Trash2 size={11} />}
                                                                label="삭제"
                                                                tone="ghost"
                                                                onClick={() => removeTask(task.uploadId)}
                                                                className="min-h-[28px] text-[10.5px] py-0.5 px-2.5 rounded-[8px]"
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Progress bar for this specific task */}
                                            <div className="flex flex-col gap-1.5 mt-1">
                                                <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden shadow-inner">
                                                    <div
                                                        className={`h-full transition-all duration-300 ease-out ${
                                                            task.status === 'failed'
                                                                ? 'bg-red-500'
                                                                : task.status === 'paused'
                                                                  ? 'bg-amber-500'
                                                                  : task.status === 'completed'
                                                                    ? 'bg-sky-500'
                                                                    : 'bg-gradient-to-r from-emerald-500 to-primary'
                                                        }`}
                                                        style={{ width: `${task.progress * 100}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground mt-0.5">
                                                    <span>
                                                        {formatSize(task.uploadedBytes)} / {formatSize(task.fileSize)}
                                                    </span>
                                                    <span className="font-bold text-foreground">{progressPct}%</span>
                                                </div>
                                                {task.status === 'uploading' && (
                                                    <div className="flex justify-between items-center text-[10px] font-mono text-muted-foreground/80 mt-1 border-t border-border/10 pt-1.5">
                                                        <span className="flex items-center gap-1">
                                                            <Activity
                                                                size={11}
                                                                className="text-emerald-500 animate-pulse shrink-0"
                                                            />
                                                            속도:{' '}
                                                            <span className="font-bold text-foreground font-mono">
                                                                {task.speed?.toFixed(2) ?? '0.00'} MB/s
                                                            </span>
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock size={11} className="text-sky-500 shrink-0" />
                                                            남은 시간:{' '}
                                                            <span className="font-bold text-foreground font-mono">
                                                                {formatETA(task.eta)}
                                                            </span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Section>
                    )}

                    {/* Logs Console Panel */}
                    <Section
                        title={`네이티브 연동 실시간 로그 콘솔 (${logs.length})`}
                        action={
                            logs.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={clearLogs}
                                    className="text-[10px] font-extrabold text-muted-foreground hover:text-foreground hover:underline transition-colors uppercase tracking-wider"
                                >
                                    Clear Logs
                                </button>
                            ) : undefined
                        }
                    >
                        {logs.length === 0 ? (
                            <p className="py-8 text-center text-[12px] text-muted-foreground/75 font-semibold bg-muted/10 rounded-[16px] border border-border/30">
                                이벤트 로그가 비어있습니다.
                            </p>
                        ) : (
                            <div className="divide-y divide-border/40 max-h-[240px] overflow-y-auto pr-1 bg-muted/30 dark:bg-muted/10 p-3.5 rounded-[16px] border border-border/40">
                                {logs.map(log => (
                                    <div key={log.id} className="py-2 first:pt-0 last:pb-0">
                                        <div className="mb-1.5 flex items-center gap-2">
                                            <span
                                                className={`shrink-0 rounded-[6px] px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider ${levelClassName[log.level]}`}
                                            >
                                                {log.label}
                                            </span>
                                            <span className="text-[9px] text-muted-foreground/70 font-bold">
                                                {log.timestamp}
                                            </span>
                                        </div>
                                        <p className="max-w-full break-words font-mono text-[11px] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] pl-1">
                                            {log.message}
                                        </p>
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        )}
                    </Section>
                </div>
            </div>
        </div>
    );
};
