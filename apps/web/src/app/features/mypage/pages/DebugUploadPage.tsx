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
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMobileAppInfo } from '@chatic/app-messages';
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

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const logEndRef = useRef<HTMLDivElement | null>(null);

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return getMobileAppInfo().isOnMobileApp;
    }, []);

    const addLog = useCallback((level: LogLevel, label: string, message: string) => {
        const timestamp = new Date().toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        setLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, level, label, message, timestamp }]);

        requestAnimationFrame(() => {
            logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
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
            try {
                await webBridge.request('PauseFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Pause error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [addLog]
    );

    const resumeTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'UploadControl', `Requesting RESUME for [ID: ${uploadId}]`);
            try {
                await webBridge.request('ResumeFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Resume error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [addLog]
    );

    const cancelTask = useCallback(
        async (uploadId: string) => {
            addLog('info', 'UploadControl', `Requesting CANCEL for [ID: ${uploadId}]`);
            try {
                await webBridge.request('CancelFileUpload', { data: { uploadId } });
            } catch (e: any) {
                addLog('error', 'UploadControl', `Cancel error [ID: ${uploadId}]: ${e.message}`);
            }
        },
        [addLog]
    );

    const removeTask = useCallback(
        (uploadId: string) => {
            setTasks(prev => {
                const copy = { ...prev };
                delete copy[uploadId];
                return copy;
            });
            addLog('info', 'UploadControl', `Removed task card [ID: ${uploadId}] from monitor`);
        },
        [addLog]
    );

    const performRetry = useCallback(
        async (task: UploadTask) => {
            addLog('info', 'UploadControl', `Initiating retry for: ${task.fileName} [ID: ${task.uploadId}]`);

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
        [resumeTask, addLog]
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
                        },
                    };

                    void performRetry({
                        ...task,
                        status: 'uploading',
                        retryCount: nextRetryCount,
                        error: undefined,
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
                    },
                };
            });

            await performRetry({
                ...task,
                status: 'uploading',
                retryCount: 0,
                error: undefined,
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
                },
            }));

            addLog('info', 'UploadInit', `Starting upload for ${file.name} [ID: ${uploadId}]`);

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
        [triggerAutoRetry, addLog]
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
                return {
                    ...prev,
                    [payload.uploadId]: {
                        ...task,
                        progress: payload.progress,
                        uploadedBytes: payload.uploadedBytes,
                        status: payload.status,
                    },
                };
            });

            const progressPct = Math.round(payload.progress * 100);
            addLog(
                payload.status === 'failed' ? 'error' : payload.status === 'paused' ? 'warning' : 'info',
                'NativeProgress',
                `[${payload.uploadId}] Status: ${payload.status} | Progress: ${progressPct}% (${payload.uploadedBytes}/${payload.totalBytes} bytes)`
            );

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
                                        { label: '512 KB', val: 512 * 1024 },
                                        { label: '1 MB (기본)', val: 1024 * 1024 },
                                        { label: '2 MB', val: 2 * 1024 * 1024 },
                                        { label: '5 MB', val: 5 * 1024 * 1024 },
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
                        {stagedFiles.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 rounded-[16px] border border-dashed border-border/60 bg-muted/20">
                                <Upload size={28} className="text-muted-foreground/40 mb-2" />
                                <p className="text-[12px] font-semibold text-muted-foreground">
                                    대기 중인 파일이 없습니다.
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                    상단의 [기기 파일 추가]를 눌러 업로드할 파일을 staged 하세요.
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
                                                    <p className="text-[12px] font-bold text-foreground truncate">
                                                        {file.name}
                                                    </p>
                                                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                                        {(file.size / (1024 * 1024)).toFixed(2)} MB |{' '}
                                                        {file.type || 'unknown'}
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

                    {/* Overall Progress Dashboard */}
                    {taskList.length > 0 && (
                        <div className="rounded-[20px] bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 p-5 shadow-sm">
                            <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
                                전체 업로드 요약 상태
                            </h3>
                            <div className="grid grid-cols-3 gap-2 mt-4">
                                <div className="text-center bg-card/60 backdrop-blur-md rounded-[12px] p-2.5 border border-border/30">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">
                                        진행 중
                                    </span>
                                    <p className="text-[16px] font-black text-primary mt-0.5">{activeTasksCount}개</p>
                                </div>
                                <div className="text-center bg-card/60 backdrop-blur-md rounded-[12px] p-2.5 border border-border/30">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">
                                        총 태스크
                                    </span>
                                    <p className="text-[16px] font-black text-foreground mt-0.5">{taskList.length}개</p>
                                </div>
                                <div className="text-center bg-card/60 backdrop-blur-md rounded-[12px] p-2.5 border border-border/30">
                                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-bold">
                                        평균 진행도
                                    </span>
                                    <p className="text-[16px] font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                                        {Math.round(overallProgress * 100)}%
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-col gap-1">
                                <div className="w-full bg-muted/60 dark:bg-muted/30 rounded-full h-3 overflow-hidden border border-border/30 shadow-inner">
                                    <div
                                        className="bg-gradient-to-r from-primary to-sky-500 h-full transition-all duration-300 ease-out"
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
                                                            {(task.fileSize / (1024 * 1024)).toFixed(2)} MB
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
                                                        label="재개"
                                                        tone="success"
                                                        onClick={() => resumeTask(task.uploadId)}
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
                                                        {task.uploadedBytes.toLocaleString()} /{' '}
                                                        {task.fileSize.toLocaleString()} bytes
                                                    </span>
                                                    <span className="font-bold text-foreground">{progressPct}%</span>
                                                </div>
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
