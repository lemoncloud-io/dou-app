import { Check, Edit2, FileText, Flame, Lock, Plus, RefreshCw, Search, Sparkles, Trash2, XCircle } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import type { AppMessageData } from '@chatic/app-messages';
import { type TestRecord } from '@chatic/app-messages';
import { webClient } from '@chatic/bridges';

import { useCacheTestStrings } from '../../i18n/screens/CacheTestScreen';

const BULK_COUNTS = [10, 50, 100, 500, 1000, 2000];

type LogLevel = 'info' | 'success' | 'warning' | 'error';
type ActiveTab = 'scenarios' | 'explorer' | 'logs';

interface LogEntry {
    id: string;
    level: LogLevel;
    label: string;
    message: string;
    timestamp: string;
}

interface RollingLatencyStats {
    count: number;
    mean: number;
    m2: number;
    min: number;
    max: number;
}

interface SlowOp {
    id: string;
    label: string;
    durationMs: number;
    success: boolean;
    at: number;
}

// --- UI Components matching DebugLogBufferPage.tsx ---

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section className="min-w-0 max-w-full overflow-hidden rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-primary">{title}</p>
        {children}
    </section>
);

const Metric = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
    <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 truncate font-mono text-[13px] font-semibold text-foreground">{String(value ?? '-')}</p>
    </div>
);

const ActionButton = ({
    icon,
    label,
    onClick,
    tone = 'default',
    disabled,
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'primary' | 'danger';
    disabled?: boolean;
}) => {
    const toneClassName =
        tone === 'primary'
            ? 'bg-primary text-primary-foreground border-transparent active:scale-[0.98]'
            : tone === 'danger'
              ? 'border-destructive/25 bg-destructive/10 text-destructive active:scale-[0.98]'
              : 'border-border bg-background text-foreground active:scale-[0.98]';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold disabled:opacity-40 transition-transform ${toneClassName}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

const Chip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-all ${
            active
                ? 'border-primary bg-primary text-primary-foreground font-bold shadow-sm shadow-primary/10'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
        }`}
    >
        {label}
    </button>
);

const LogEntryView = ({ log, index }: { log: LogEntry; index: number }) => {
    const level = log.level;
    return (
        <article className="min-w-0 max-w-full overflow-hidden py-2.5 first:pt-0 last:pb-0">
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                            level === 'success'
                                ? 'bg-primary/15 text-primary'
                                : level === 'error'
                                  ? 'bg-destructive/15 text-destructive'
                                  : level === 'warning'
                                    ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                                    : 'bg-muted text-muted-foreground'
                        }`}
                    >
                        {level}
                    </span>
                    <span className="truncate font-mono text-[11px] font-semibold text-foreground">{log.label}</span>
                </div>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground">#{index + 1}</span>
            </div>
            <p className="max-w-full break-words text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {log.message || '-'}
            </p>
            <p className="mt-1 font-mono text-[9px] text-muted-foreground">{log.timestamp}</p>
        </article>
    );
};

// --- Page ---

export const CacheTestScreen = () => {
    const strings = useCacheTestStrings();

    // Core Dashboard States
    const [activeTab, setActiveTab] = useState<ActiveTab>('scenarios');
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);

    // Live Metrics Telemetries
    const [totalOps, setTotalOps] = useState(0);
    const [avgLatency, setAvgLatency] = useState<number | null>(null);
    const [successCount, setSuccessCount] = useState(0);
    const [failCount, setFailCount] = useState(0);
    const [statsStartedAt, setStatsStartedAt] = useState<number | null>(null);
    const [latencyStats, setLatencyStats] = useState<RollingLatencyStats>({
        count: 0,
        mean: 0,
        m2: 0,
        min: Number.POSITIVE_INFINITY,
        max: 0,
    });
    const [slowOps, setSlowOps] = useState<SlowOp[]>([]);

    // Scenario 1: SQLite Options & States
    const [sqliteBulkCount, setSqliteBulkCount] = useState(100);

    // Scenario 2: Concurrency states
    const [concurrencyCount, setConcurrencyCount] = useState(100);
    const [concurrencyKey, setConcurrencyKey] = useState('concurrency_race_test_key');
    const [concurrencyResult, setConcurrencyResult] = useState<{
        status: 'idle' | 'running' | 'success' | 'fail';
        expected: string;
        actual: string;
        duration: number;
    }>({ status: 'idle', expected: '', actual: '', duration: 0 });

    // Scenario 3: Flood states
    const [floodCount, setFloodCount] = useState(500);
    const [floodStrategy, setFloodStrategy] = useState<'parallel' | 'chunked' | 'sequential'>('parallel');
    const [floodProgress, setFloodProgress] = useState(0);
    const [floodStats, setFloodStats] = useState<{
        totalTime: number;
        successRate: number;
        avgMs: number;
        stddevMs: number;
        rps: number;
        topSlow: Array<{ id: number; durationMs: number; success: boolean }>;
    } | null>(null);

    // SQLite Record Explorer States (CRUD & Browse)
    const [records, setRecords] = useState<TestRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isExplorerLoading, setIsExplorerLoading] = useState(false);

    // Inline Edit States
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editingValue, setEditingValue] = useState('');

    // Manual Insert States
    const [newKey, setNewKey] = useState('');
    const [newValue, setNewValue] = useState('');

    const isOnMobileApp = useMemo(() => {
        return (
            typeof window !== 'undefined' &&
            !!(
                window.ReactNativeWebView?.postMessage ||
                window.ChaticMessageHandler?.postMessage ||
                window.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage
            )
        );
    }, []);

    // Telemetry logger & statistics updates
    const addLog = useCallback((level: LogLevel, label: string, message: string) => {
        const timestamp =
            new Date().toLocaleTimeString('ko-KR', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            }) +
            '.' +
            String(Date.now() % 1000).padStart(3, '0');

        setLogs(prev => {
            const next = [...prev, { id: `${Date.now()}-${Math.random()}`, level, label, message, timestamp }];
            return next.slice(-100); // Caps logs count to keep it smooth on devices
        });

        // Forced auto-scroll has been removed entirely so it doesn't interrupt the user while they're analyzing past logs.
    }, []);

    const clearLogs = useCallback(() => setLogs([]), []);

    const updateStats = useCallback((durationMs: number, success: boolean, label: string) => {
        setStatsStartedAt(prev => prev ?? Date.now());
        setTotalOps(prev => prev + 1);
        if (success) {
            setSuccessCount(prev => prev + 1);
        } else {
            setFailCount(prev => prev + 1);
        }

        setAvgLatency(prev => {
            if (prev === null) return Number(durationMs.toFixed(1));
            return Number((prev * 0.9 + durationMs * 0.1).toFixed(1));
        });

        setLatencyStats(prev => {
            const x = durationMs;
            const nextCount = prev.count + 1;
            const delta = x - prev.mean;
            const nextMean = prev.mean + delta / nextCount;
            const delta2 = x - nextMean;
            const nextM2 = prev.m2 + delta * delta2;
            const nextMin = Math.min(prev.min, x);
            const nextMax = Math.max(prev.max, x);
            return { count: nextCount, mean: nextMean, m2: nextM2, min: nextMin, max: nextMax };
        });

        setSlowOps(prev => {
            const next: SlowOp[] = [
                ...prev,
                { id: `${Date.now()}-${Math.random()}`, label, durationMs, success, at: Date.now() },
            ];
            next.sort((a, b) => b.durationMs - a.durationMs);
            return next.slice(0, 10);
        });
    }, []);

    const latencyStdDevMs = useMemo(() => {
        if (latencyStats.count <= 1) return null;
        return Math.sqrt(latencyStats.m2 / (latencyStats.count - 1));
    }, [latencyStats.count, latencyStats.m2]);

    const opsPerSec = useMemo(() => {
        if (!statsStartedAt || totalOps <= 0) return null;
        const elapsedMs = Date.now() - statsStartedAt;
        if (elapsedMs <= 0) return null;
        return (totalOps * 1000) / elapsedMs;
    }, [statsStartedAt, totalOps]);

    const resetStats = useCallback(() => {
        setTotalOps(0);
        setAvgLatency(null);
        setSuccessCount(0);
        setFailCount(0);
        setStatsStartedAt(null);
        setLatencyStats({
            count: 0,
            mean: 0,
            m2: 0,
            min: Number.POSITIVE_INFINITY,
            max: 0,
        });
        setSlowOps([]);
        addLog('info', strings.log.tags.telemetry, strings.log.resetStats);
    }, [addLog, strings]);

    // ----------------------------------------------------
    // SQLite Record Explorer Actions (CRUD & Fetch)
    // ----------------------------------------------------

    const loadAllRecords = useCallback(
        async (silent = false) => {
            if (!silent) setIsExplorerLoading(true);
            try {
                const response = await webClient.request({ type: 'FetchAllTestRecords', data: {} });
                if (response.type !== 'OnFetchAllTestRecords') {
                    throw new Error(`Unexpected response type: ${response.type}`);
                }
                const typed = response as AppMessageData<'OnFetchAllTestRecords'>;

                const sorted = [...typed.data.items].sort((a, b) => b.updated_at - a.updated_at);
                setRecords(sorted);
                if (!silent) {
                    addLog('success', strings.log.tags.explorer, strings.log.explorer.loaded(sorted.length));
                }
            } catch (e: any) {
                addLog('error', strings.log.tags.explorer, strings.log.explorer.loadFailed(e.message ?? String(e)));
            } finally {
                if (!silent) setIsExplorerLoading(false);
            }
        },
        [addLog, strings]
    );

    // Handle Manual Insert
    const handleCreateRecord = useCallback(async () => {
        if (!newKey.trim()) {
            addLog('warning', strings.log.tags.explorer, strings.log.explorer.enterKey);
            return;
        }

        setIsRunning(true);
        addLog('info', strings.log.tags.explorer, strings.log.explorer.manualAddRequest(newKey, newValue));
        const start = performance.now();

        try {
            const response = await webClient.request({
                type: 'SaveTestRecord',
                data: { key: newKey.trim(), value: newValue },
            });
            const duration = performance.now() - start;

            if (response.type !== 'OnSaveTestRecord') {
                throw new Error(`Unexpected response type: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnSaveTestRecord'>;
            if (typed.data.success) {
                addLog('success', strings.log.tags.explorer, strings.log.explorer.saved(newKey, duration));
                setNewKey('');
                setNewValue('');
                updateStats(duration, true, strings.log.explorer.manualAddOpLabel);
                await loadAllRecords(true);
            } else {
                throw new Error('Save failed.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', strings.log.tags.explorer, strings.log.explorer.saveFailed(e.message ?? String(e)));
            updateStats(duration, false, strings.log.explorer.manualAddOpLabel);
        } finally {
            setIsRunning(false);
        }
    }, [newKey, newValue, addLog, updateStats, loadAllRecords, strings]);

    // Handle Inline Edit
    const handleUpdateRecord = useCallback(
        async (key: string, value: string) => {
            setIsRunning(true);
            addLog('info', strings.log.tags.explorer, strings.log.explorer.inlineEditRequest(key, value));
            const start = performance.now();

            try {
                const response = await webClient.request({ type: 'SaveTestRecord', data: { key, value } });
                const duration = performance.now() - start;

                if (response.type !== 'OnSaveTestRecord') {
                    throw new Error(`Unexpected response type: ${response.type}`);
                }
                const typed = response as AppMessageData<'OnSaveTestRecord'>;
                if (typed.data.success) {
                    addLog('success', strings.log.tags.explorer, strings.log.explorer.updated(key, duration));
                    setEditingKey(null);
                    updateStats(duration, true, strings.log.explorer.inlineEditOpLabel);
                    await loadAllRecords(true);
                } else {
                    throw new Error('Update failed.');
                }
            } catch (e: any) {
                const duration = performance.now() - start;
                addLog('error', strings.log.tags.explorer, strings.log.explorer.updateFailed(e.message ?? String(e)));
                updateStats(duration, false, strings.log.explorer.inlineEditOpLabel);
            } finally {
                setIsRunning(false);
            }
        },
        [addLog, updateStats, loadAllRecords, strings]
    );

    // Start Inline Edit mode
    const startEditing = useCallback((key: string, currentValue: string) => {
        setEditingKey(key);
        setEditingValue(currentValue);
    }, []);

    // Cancel Inline Edit mode
    const cancelEditing = useCallback(() => {
        setEditingKey(null);
        setEditingValue('');
    }, []);

    // Filter records dynamically by search query
    const filteredRecords = useMemo(() => {
        if (!searchQuery.trim()) return records;
        const query = searchQuery.toLowerCase();
        return records.filter(r => r.key.toLowerCase().includes(query) || r.value.toLowerCase().includes(query));
    }, [records, searchQuery]);

    // ----------------------------------------------------
    // SQLite Scenario Actions
    // ----------------------------------------------------

    // Scenario 1: Bulk Save
    const runSqliteBulkSave = useCallback(async () => {
        setIsRunning(true);
        addLog('info', 'SQL_SAVE', strings.log.sqlSave.bulkSaving(sqliteBulkCount));
        const start = performance.now();

        try {
            const items = Array.from({ length: sqliteBulkCount }, (_, i) => ({
                key: `perf_key_${i}_${Date.now() % 10000}`,
                value: `Val-${i}-${Math.random().toString(36).substring(2, 6)}`,
            }));

            const response = await webClient.request({ type: 'SaveAllTestRecords', data: { items } });
            const duration = performance.now() - start;

            if (response.type !== 'OnSaveAllTestRecords') {
                throw new Error(`Unexpected response type: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnSaveAllTestRecords'>;
            if (typed.data.success) {
                addLog(
                    'success',
                    'SQL_SAVE',
                    strings.log.sqlSave.bulkSaved(typed.data.count, duration, (duration / sqliteBulkCount).toFixed(2))
                );
                updateStats(duration, true, `SQL_SAVE:SaveAllTestRecords(${sqliteBulkCount})`);
                await loadAllRecords(true);
            } else {
                throw new Error('Native bulk save responded with a failure status.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', 'SQL_SAVE', strings.log.sqlSave.bulkSaveError(duration, e.message ?? String(e)));
            updateStats(duration, false, `SQL_SAVE:SaveAllTestRecords(${sqliteBulkCount})`);
        } finally {
            setIsRunning(false);
        }
    }, [sqliteBulkCount, addLog, updateStats, loadAllRecords, strings]);

    // Scenario 1: Bulk Fetch
    const runSqliteBulkFetch = useCallback(async () => {
        setIsRunning(true);
        addLog('info', 'SQL_FETCH', strings.log.sqlFetch.fetching);
        const start = performance.now();

        try {
            const response = await webClient.request({ type: 'FetchAllTestRecords', data: {} });
            const duration = performance.now() - start;

            if (response.type !== 'OnFetchAllTestRecords') {
                throw new Error(`Unexpected response type: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnFetchAllTestRecords'>;
            const count = typed.data.items.length;
            addLog(
                'success',
                'SQL_FETCH',
                strings.log.sqlFetch.loaded(count, duration, count > 0 ? (duration / count).toFixed(2) : 0)
            );
            updateStats(duration, true, `SQL_FETCH:FetchAllTestRecords(${count})`);
            await loadAllRecords(true);
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', 'SQL_FETCH', strings.log.sqlFetch.fetchFailed(duration, e.message ?? String(e)));
            updateStats(duration, false, 'SQL_FETCH:FetchAllTestRecords');
        } finally {
            setIsRunning(false);
        }
    }, [addLog, updateStats, loadAllRecords, strings]);

    // Scenario 1: Clear SQLite Database
    const runSqliteClear = useCallback(async () => {
        setIsRunning(true);
        addLog('warning', 'SQL_CLEAR', strings.log.sqlClear.clearing);
        const start = performance.now();

        try {
            const response = await webClient.request({ type: 'ClearTestRecords', data: {} });
            const duration = performance.now() - start;

            if (response.type !== 'OnClearTestRecords') {
                throw new Error(`Unexpected response type: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnClearTestRecords'>;
            if (typed.data.success) {
                addLog('success', 'SQL_CLEAR', strings.log.sqlClear.cleared(duration));
                updateStats(duration, true, 'SQL_CLEAR:ClearTestRecords');
                await loadAllRecords(true);
            } else {
                throw new Error('Clear operation failed.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', 'SQL_CLEAR', strings.log.sqlClear.clearFailed(duration, e.message ?? String(e)));
            updateStats(duration, false, 'SQL_CLEAR:ClearTestRecords');
        } finally {
            setIsRunning(false);
        }
    }, [addLog, updateStats, loadAllRecords, strings]);

    // Scenario 2: Concurrency Write-Consistency Verification
    const runSqliteConcurrencyTest = useCallback(async () => {
        setIsRunning(true);
        setConcurrencyResult({ status: 'running', expected: `Value-${concurrencyCount}`, actual: '', duration: 0 });
        addLog(
            'info',
            strings.log.tags.concurrencyCheck,
            strings.log.concurrency.sending(concurrencyCount, concurrencyKey)
        );

        const start = performance.now();
        try {
            const promises = [];
            for (let i = 1; i <= concurrencyCount; i++) {
                promises.push(
                    webClient.request({ type: 'SaveTestRecord', data: { key: concurrencyKey, value: `Value-${i}` } })
                );
            }

            addLog('info', strings.log.tags.concurrencyCheck, strings.log.concurrency.waiting);
            await Promise.all(promises);

            addLog('info', strings.log.tags.concurrencyCheck, strings.log.concurrency.checking(concurrencyKey));
            const fetchResponse = await webClient.request({ type: 'FetchTestRecord', data: { key: concurrencyKey } });
            if (fetchResponse.type !== 'OnFetchTestRecord') {
                throw new Error(`Unexpected response type: ${fetchResponse.type}`);
            }
            const typedFetch = fetchResponse as AppMessageData<'OnFetchTestRecord'>;

            const duration = performance.now() - start;
            const finalValue = typedFetch.data.item?.value ?? 'NULL';
            const expectedValue = `Value-${concurrencyCount}`;
            const success = finalValue === expectedValue;

            if (success) {
                setConcurrencyResult({ status: 'success', expected: expectedValue, actual: finalValue, duration });
                addLog(
                    'success',
                    strings.log.tags.concurrencyCheck,
                    strings.log.concurrency.verified(concurrencyKey, finalValue)
                );
                updateStats(duration, true, strings.log.concurrency.opLabel(concurrencyCount));
                await loadAllRecords(true);
            } else {
                setConcurrencyResult({ status: 'fail', expected: expectedValue, actual: finalValue, duration });
                addLog(
                    'error',
                    strings.log.tags.concurrencyCheck,
                    strings.log.concurrency.raceDetected(expectedValue, finalValue)
                );
                updateStats(duration, false, strings.log.concurrency.opLabel(concurrencyCount));
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            setConcurrencyResult({ status: 'fail', expected: `Value-${concurrencyCount}`, actual: 'ERROR', duration });
            addLog(
                'error',
                strings.log.tags.concurrencyCheck,
                strings.log.concurrency.verifyFailed(e.message ?? String(e))
            );
            updateStats(duration, false, strings.log.concurrency.opLabel(concurrencyCount));
        } finally {
            setIsRunning(false);
        }
    }, [concurrencyCount, concurrencyKey, addLog, updateStats, loadAllRecords, strings]);

    // Scenario 3: Hybrid Bridge Flooding / Stress Testing
    const runSqliteFloodTest = useCallback(async () => {
        setIsRunning(true);
        setFloodProgress(0);
        setFloodStats(null);
        addLog('info', strings.log.tags.stress, strings.log.stress.sending(floodCount, floodStrategy));

        const start = performance.now();
        let resolvedCount = 0;
        let localSuccess = 0;
        let localFail = 0;
        let totalLatencies = 0;
        let latencyCount = 0;
        let latencyMean = 0;
        let latencyM2 = 0;
        const topSlow: Array<{ id: number; durationMs: number; success: boolean }> = [];

        const considerTopSlow = (item: { id: number; durationMs: number; success: boolean }) => {
            topSlow.push(item);
            topSlow.sort((a, b) => b.durationMs - a.durationMs);
            if (topSlow.length > 10) topSlow.length = 10;
        };

        try {
            const executeRequest = async (id: number) => {
                const singleStart = performance.now();
                try {
                    const res = await webClient.request({
                        type: 'SaveTestRecord',
                        data: { key: `flood_key_${id}`, value: `FloodValue-${id}` },
                    });
                    const singleTime = performance.now() - singleStart;
                    totalLatencies += singleTime;

                    latencyCount++;
                    const delta = singleTime - latencyMean;
                    latencyMean += delta / latencyCount;
                    const delta2 = singleTime - latencyMean;
                    latencyM2 += delta * delta2;

                    let ok = false;
                    if (res.type === 'OnSaveTestRecord') {
                        const typed = res as AppMessageData<'OnSaveTestRecord'>;
                        ok = typed.data.success;
                    }

                    if (ok) {
                        localSuccess++;
                        considerTopSlow({ id, durationMs: singleTime, success: true });
                    } else {
                        localFail++;
                        considerTopSlow({ id, durationMs: singleTime, success: false });
                    }
                } catch {
                    const singleTime = performance.now() - singleStart;
                    totalLatencies += singleTime;

                    latencyCount++;
                    const delta = singleTime - latencyMean;
                    latencyMean += delta / latencyCount;
                    const delta2 = singleTime - latencyMean;
                    latencyM2 += delta * delta2;

                    localFail++;
                    considerTopSlow({ id, durationMs: singleTime, success: false });
                } finally {
                    resolvedCount++;
                    setFloodProgress(Math.floor((resolvedCount / floodCount) * 100));
                }
            };

            if (floodStrategy === 'parallel') {
                const promises = [];
                for (let i = 0; i < floodCount; i++) {
                    promises.push(executeRequest(i));
                }
                await Promise.all(promises);
            } else if (floodStrategy === 'chunked') {
                const chunkSize = 50;
                for (let i = 0; i < floodCount; i += chunkSize) {
                    const chunkPromises = [];
                    for (let j = 0; j < chunkSize && i + j < floodCount; j++) {
                        chunkPromises.push(executeRequest(i + j));
                    }
                    await Promise.all(chunkPromises);
                }
            } else {
                for (let i = 0; i < floodCount; i++) {
                    await executeRequest(i);
                }
            }

            const elapsed = performance.now() - start;
            const successRate = Number(((localSuccess / floodCount) * 100).toFixed(1));
            const avgMs = Number((totalLatencies / floodCount).toFixed(1));
            const stddevMs = Number((latencyCount > 1 ? Math.sqrt(latencyM2 / (latencyCount - 1)) : 0).toFixed(1));
            const rps = Number(((floodCount * 1000) / elapsed).toFixed(2));
            const topSlow10 = topSlow.map(item => ({
                ...item,
                durationMs: Number(item.durationMs.toFixed(1)),
            }));

            setFloodStats({
                totalTime: Number(elapsed.toFixed(0)),
                successRate,
                avgMs,
                stddevMs,
                rps,
                topSlow: topSlow10,
            });

            addLog(
                'success',
                strings.log.tags.stress,
                strings.log.stress.complete(elapsed, rps, successRate, avgMs, stddevMs)
            );
            updateStats(elapsed, successRate > 95, strings.log.stress.opLabel(floodCount, floodStrategy));
            await loadAllRecords(true);
        } catch (e: any) {
            const elapsed = performance.now() - start;
            addLog('error', strings.log.tags.stress, strings.log.stress.aborted(elapsed, e.message ?? String(e)));
            updateStats(elapsed, false, strings.log.stress.opLabel(floodCount, floodStrategy));
        } finally {
            setIsRunning(false);
        }
    }, [floodCount, floodStrategy, addLog, updateStats, loadAllRecords, strings]);

    // Initial Database Load
    useEffect(() => {
        addLog(
            'info',
            strings.log.tags.init,
            strings.log.init.loaded(isOnMobileApp ? strings.log.init.envHybrid : strings.log.init.envBrowser)
        );
        loadAllRecords();
    }, [isOnMobileApp, addLog, loadAllRecords, strings]);

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background">
            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none">
                <div className="flex min-w-0 max-w-full flex-col gap-3 p-4 pb-10">
                    {/* 1. Always visible at top: status info (Status Summary) */}
                    <Section title={strings.dbStatus.sectionTitle}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric
                                label={strings.dbStatus.mobileAppLink}
                                value={isOnMobileApp ? strings.dbStatus.connected : strings.dbStatus.notConnected}
                            />
                            <Metric
                                label={strings.dbStatus.deliveryGuarantee}
                                value={strings.dbStatus.deliveryGuaranteeValue}
                            />
                            <Metric label={strings.dbStatus.totalOperations} value={totalOps} />
                            <Metric
                                label={strings.dbStatus.avgRttLatency}
                                value={avgLatency ? `${avgLatency} ms` : '-'}
                            />
                            <Metric
                                label={strings.dbStatus.rttStdDeviation}
                                value={latencyStdDevMs !== null ? `${latencyStdDevMs.toFixed(1)} ms` : '-'}
                            />
                            <Metric
                                label={strings.dbStatus.throughput}
                                value={opsPerSec !== null ? opsPerSec.toFixed(2) : '-'}
                            />
                            <Metric label={strings.dbStatus.failureCount} value={failCount} />
                            <Metric
                                label={strings.dbStatus.benchmarkSuccessRate}
                                value={totalOps > 0 ? `${((successCount / totalOps) * 100).toFixed(1)}%` : '100%'}
                            />
                            <Metric label={strings.dbStatus.sqliteTargetTable} value="test_records" />
                        </div>
                    </Section>

                    <Section title={strings.slowest.sectionTitle}>
                        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label={strings.slowest.sampleCount} value={latencyStats.count} />
                            <Metric
                                label={strings.slowest.avgRttMean}
                                value={latencyStats.count > 0 ? `${latencyStats.mean.toFixed(1)} ms` : '-'}
                            />
                            <Metric
                                label={strings.slowest.minRtt}
                                value={latencyStats.count > 0 ? `${latencyStats.min.toFixed(1)} ms` : '-'}
                            />
                            <Metric
                                label={strings.slowest.maxRtt}
                                value={latencyStats.count > 0 ? `${latencyStats.max.toFixed(1)} ms` : '-'}
                            />
                        </div>

                        {slowOps.length === 0 ? (
                            <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                                {strings.slowest.empty}
                            </p>
                        ) : (
                            <div className="rounded-xl border border-border bg-background">
                                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        {strings.slowest.runLog}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={resetStats}
                                        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        {strings.slowest.resetStats}
                                    </button>
                                </div>
                                <div className="divide-y divide-border">
                                    {slowOps.map((op, index) => (
                                        <div key={op.id} className="px-3 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                                        #{index + 1}
                                                    </span>
                                                    <span
                                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                                            op.success
                                                                ? 'bg-primary/15 text-primary'
                                                                : 'bg-destructive/15 text-destructive'
                                                        }`}
                                                    >
                                                        {op.success ? 'ok' : 'fail'}
                                                    </span>
                                                    <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-foreground">
                                                        {op.label}
                                                    </span>
                                                </div>
                                                <span className="shrink-0 font-mono text-[11px] font-bold text-foreground">
                                                    {op.durationMs.toFixed(1)}ms
                                                </span>
                                            </div>
                                            <p className="mt-1 font-mono text-[9px] text-muted-foreground">
                                                {new Date(op.at).toLocaleString('ko-KR', {
                                                    hour12: false,
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* 2. Dashboard 3-way tab selector */}
                    <Section title={strings.tabs.sectionTitle}>
                        <div className="flex w-full gap-1.5 rounded-xl bg-background p-1 border border-border">
                            {(['scenarios', 'explorer', 'logs'] as const).map(tab => (
                                <button
                                    key={tab}
                                    type="button"
                                    onClick={() => setActiveTab(tab)}
                                    className={`flex-1 rounded-[8px] py-2 text-[11px] font-extrabold uppercase tracking-wider transition-all ${
                                        activeTab === tab
                                            ? 'bg-primary text-primary-foreground font-black'
                                            : 'text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {tab === 'scenarios'
                                        ? strings.tabs.scenarios
                                        : tab === 'explorer'
                                          ? strings.tabs.explorer
                                          : strings.tabs.logs(logs.length)}
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* ======================================================== */}
                    {/* TAB 1: SCENARIOS (BENCHMARK TESTS)                       */}
                    {/* ======================================================== */}
                    {activeTab === 'scenarios' && (
                        <>
                            {/* Scenario 1: Large Data SQL Benchmarks */}
                            <Section title={strings.scenario1.title}>
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    {strings.scenario1.description}
                                </p>

                                <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                    {strings.scenario1.countLabel}
                                </p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {BULK_COUNTS.map(count => (
                                        <Chip
                                            key={count}
                                            label={strings.scenario1.chip(count)}
                                            active={sqliteBulkCount === count}
                                            onClick={() => setSqliteBulkCount(count)}
                                        />
                                    ))}
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <ActionButton
                                        icon={<Plus size={14} />}
                                        label={strings.scenario1.bulkSave}
                                        tone="primary"
                                        onClick={runSqliteBulkSave}
                                        disabled={isRunning}
                                    />
                                    <ActionButton
                                        icon={<RefreshCw size={14} />}
                                        label={strings.scenario1.bulkLoad}
                                        onClick={runSqliteBulkFetch}
                                        disabled={isRunning}
                                    />
                                    <ActionButton
                                        icon={<Trash2 size={14} />}
                                        label={strings.scenario1.clearAll}
                                        tone="danger"
                                        onClick={runSqliteClear}
                                        disabled={isRunning}
                                    />
                                </div>
                            </Section>

                            {/* Scenario 2: Concurrency Write-Consistency Verification */}
                            <Section title={strings.scenario2.title}>
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    {strings.scenario2.description}
                                </p>

                                <div className="mb-4 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {strings.scenario2.keyLabel}
                                        </label>
                                        <input
                                            type="text"
                                            value={concurrencyKey}
                                            onChange={e => setConcurrencyKey(e.target.value)}
                                            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {strings.scenario2.countLabel}
                                        </label>
                                        <select
                                            value={concurrencyCount}
                                            onChange={e => setConcurrencyCount(Number(e.target.value))}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="50">{strings.scenario2.writeCountOption(50)}</option>
                                            <option value="100">{strings.scenario2.writeCountOption(100)}</option>
                                            <option value="200">{strings.scenario2.writeCountOption(200)}</option>
                                            <option value="500">{strings.scenario2.writeCountOption(500)}</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Concurrency Result Box */}
                                {concurrencyResult.status !== 'idle' && (
                                    <div
                                        className={`mb-4 rounded-[12px] p-3 border font-mono text-[11px] leading-relaxed ${
                                            concurrencyResult.status === 'running'
                                                ? 'bg-muted border-border text-muted-foreground'
                                                : concurrencyResult.status === 'success'
                                                  ? 'bg-primary/10 border-primary/20 text-primary'
                                                  : 'bg-destructive/10 border-destructive/20 text-destructive'
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 font-bold text-[11.5px] mb-1.5">
                                            {concurrencyResult.status === 'running' ? (
                                                <RefreshCw className="animate-spin" size={13} />
                                            ) : concurrencyResult.status === 'success' ? (
                                                <Lock size={13} />
                                            ) : (
                                                <XCircle size={13} />
                                            )}
                                            <span className="uppercase tracking-wide">
                                                {concurrencyResult.status === 'running'
                                                    ? strings.scenario2.running
                                                    : concurrencyResult.status === 'success'
                                                      ? strings.scenario2.passed
                                                      : strings.scenario2.failed}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1">
                                            <div>
                                                {strings.scenario2.expectedLabel}{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.expected}
                                                </span>
                                            </div>
                                            <div>
                                                {strings.scenario2.actualLabel}{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.actual}
                                                </span>
                                            </div>
                                            <div>
                                                {strings.scenario2.elapsedLabel}{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.duration.toFixed(1)}ms
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <ActionButton
                                    icon={<Lock size={14} />}
                                    label={strings.scenario2.runButton}
                                    tone="primary"
                                    onClick={runSqliteConcurrencyTest}
                                    disabled={isRunning}
                                />
                            </Section>

                            {/* Scenario 3: Hybrid Bridge Flooding / Stress Testing */}
                            <Section title={strings.scenario3.title}>
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    {strings.scenario3.description}
                                </p>

                                <div className="mb-4 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {strings.scenario3.totalRequestsLabel}
                                        </label>
                                        <select
                                            value={floodCount}
                                            onChange={e => setFloodCount(Number(e.target.value))}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="100">{strings.scenario3.bridgeLoadOption(100)}</option>
                                            <option value="500">{strings.scenario3.bridgeLoadOption(500)}</option>
                                            <option value="1000">{strings.scenario3.bridgeLoadOption(1000)}</option>
                                            <option value="2000">{strings.scenario3.bridgeLoadOption(2000)}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {strings.scenario3.strategyLabel}
                                        </label>
                                        <select
                                            value={floodStrategy}
                                            onChange={e => setFloodStrategy(e.target.value as any)}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="parallel">{strings.scenario3.strategyParallel}</option>
                                            <option value="chunked">{strings.scenario3.strategyChunked}</option>
                                            <option value="sequential">{strings.scenario3.strategySequential}</option>
                                        </select>
                                    </div>
                                </div>

                                {isRunning && floodProgress > 0 && (
                                    <div className="mb-4">
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono font-bold text-muted-foreground">
                                            <span>{strings.scenario3.sendProgress}</span>
                                            <span>{floodProgress}%</span>
                                        </div>
                                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-100"
                                                style={{ width: `${floodProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {floodStats && (
                                    <div className="mb-4 rounded-[12px] bg-muted/65 border border-border p-3 font-mono text-[11px]">
                                        <div className="font-bold text-foreground uppercase tracking-wide mb-2">
                                            {strings.scenario3.report}
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.totalTime}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.totalTime} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.throughput}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.rps} req/s
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.successRate}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-primary">
                                                    {floodStats.successRate}%
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.avgRtt}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.avgMs} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.rttStdDeviation}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    σ {floodStats.stddevMs} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">
                                                    {strings.scenario3.slowestTop1}
                                                </p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.topSlow?.[0]
                                                        ? `${floodStats.topSlow[0].durationMs} ms`
                                                        : '-'}
                                                </p>
                                            </div>
                                        </div>

                                        {floodStats.topSlow?.length ? (
                                            <div className="mt-3 rounded-[10px] border border-border bg-background/60">
                                                <div className="border-b border-border px-3 py-2">
                                                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                                        {strings.scenario3.top10Title}
                                                    </p>
                                                </div>
                                                <div className="divide-y divide-border">
                                                    {floodStats.topSlow.map((op, index) => (
                                                        <div
                                                            key={`${op.id}-${index}`}
                                                            className="flex items-center justify-between gap-2 px-3 py-2"
                                                        >
                                                            <div className="flex min-w-0 items-center gap-2">
                                                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                                                                    #{index + 1}
                                                                </span>
                                                                <span
                                                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                                                                        op.success
                                                                            ? 'bg-primary/15 text-primary'
                                                                            : 'bg-destructive/15 text-destructive'
                                                                    }`}
                                                                >
                                                                    {op.success ? 'ok' : 'fail'}
                                                                </span>
                                                                <span className="truncate font-mono text-[11px] font-semibold text-foreground">
                                                                    id={op.id}
                                                                </span>
                                                            </div>
                                                            <span className="shrink-0 font-mono text-[11px] font-bold text-foreground">
                                                                {op.durationMs}ms
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                <ActionButton
                                    icon={<Flame size={14} />}
                                    label={strings.scenario3.startButton}
                                    tone="primary"
                                    onClick={runSqliteFloodTest}
                                    disabled={isRunning}
                                />
                            </Section>
                        </>
                    )}

                    {/* ======================================================== */}
                    {/* TAB 2: EXPLORER (SQLite REAL-TIME CRUD EXPLORER)        */}
                    {/* ======================================================== */}
                    {activeTab === 'explorer' && (
                        <Section title={strings.explorerTab.title}>
                            <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                {strings.explorerTab.description}
                            </p>

                            {/* Manual Insert Form */}
                            <div className="mb-4 rounded-xl border border-border bg-background p-3">
                                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                                    <Sparkles size={11} />
                                    <span>{strings.explorerTab.addNewTitle}</span>
                                </p>
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <input
                                        type="text"
                                        placeholder={strings.explorerTab.keyPlaceholder}
                                        value={newKey}
                                        onChange={e => setNewKey(e.target.value)}
                                        className="flex-1 rounded-[8px] border border-border bg-card px-3 py-1.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                    />
                                    <input
                                        type="text"
                                        placeholder={strings.explorerTab.valuePlaceholder}
                                        value={newValue}
                                        onChange={e => setNewValue(e.target.value)}
                                        className="flex-1 rounded-[8px] border border-border bg-card px-3 py-1.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleCreateRecord}
                                        disabled={isRunning}
                                        className="flex items-center justify-center gap-1 rounded-[8px] bg-primary px-4 py-1.5 text-[12px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                                    >
                                        <Plus size={13} />
                                        <span>{strings.explorerTab.addButton}</span>
                                    </button>
                                </div>
                            </div>

                            {/* Search and Action Bar */}
                            <div className="mb-3 flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder={strings.explorerTab.filterPlaceholder}
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full rounded-[8px] border border-border bg-background py-1.5 pl-8 pr-3 text-[12px] text-foreground outline-none focus:border-primary"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => loadAllRecords()}
                                    disabled={isExplorerLoading || isRunning}
                                    className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px] border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
                                    title={strings.explorerTab.refreshTitle}
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isExplorerLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            {/* Records List Container */}
                            <div className="overflow-y-auto rounded-xl border border-border bg-background max-h-[500px]">
                                {isExplorerLoading && records.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                                        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                                        <span className="text-[12px] text-muted-foreground">
                                            {strings.explorerTab.loading}
                                        </span>
                                    </div>
                                ) : filteredRecords.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                                        <FileText className="mb-2 h-7 w-7 text-muted-foreground/50" />
                                        <p className="text-[12.5px] font-medium">{strings.explorerTab.noData}</p>
                                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 font-sans">
                                            {strings.explorerTab.noDataHint}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-border">
                                        {filteredRecords.map(record => {
                                            const isEditing = editingKey === record.key;
                                            return (
                                                <div
                                                    key={record.key}
                                                    className="flex flex-col p-3 transition-colors hover:bg-card/50"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        {/* Key & Value fields */}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate font-mono text-[11.5px] font-bold text-foreground">
                                                                {record.key}
                                                            </div>

                                                            {isEditing ? (
                                                                <div className="mt-1.5 flex gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={editingValue}
                                                                        onChange={e => setEditingValue(e.target.value)}
                                                                        className="flex-1 rounded-[6px] border border-border bg-card px-2 py-1 font-mono text-[12px] text-foreground outline-none focus:border-primary"
                                                                        autoFocus
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleUpdateRecord(record.key, editingValue)
                                                                        }
                                                                        disabled={isRunning}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-primary text-primary-foreground"
                                                                        title={strings.explorerTab.saveTitle}
                                                                    >
                                                                        <Check size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelEditing}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-border bg-card text-foreground"
                                                                        title={strings.explorerTab.cancelTitle}
                                                                    >
                                                                        <XCircle size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1 break-all font-mono text-[12.5px] text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
                                                                    {record.value || (
                                                                        <span className="italic text-muted-foreground/40">
                                                                            {strings.explorerTab.emptyValue}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Edit Control button */}
                                                        {!isEditing && (
                                                            <button
                                                                type="button"
                                                                onClick={() => startEditing(record.key, record.value)}
                                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-border bg-card text-muted-foreground hover:text-foreground"
                                                                title={strings.explorerTab.editTitle}
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="mt-2.5 flex items-center justify-between text-[9px] text-muted-foreground">
                                                        <span>{strings.explorerTab.lastChanged}</span>
                                                        <span className="font-mono">
                                                            {new Date(record.updated_at).toLocaleString('ko-KR', {
                                                                hour12: false,
                                                                year: 'numeric',
                                                                month: '2-digit',
                                                                day: '2-digit',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                second: '2-digit',
                                                            })}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* ======================================================== */}
                    {/* TAB 3: TELEMETRY LOGS (REAL-TIME CONSOLE STREAM)          */}
                    {/* ======================================================== */}
                    {activeTab === 'logs' && (
                        <Section title={strings.logsTab.title(logs.length)}>
                            {logs.length > 0 ? (
                                <div className="mb-3 flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={clearLogs}
                                        className="text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
                                    >
                                        {strings.logsTab.clear}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetStats}
                                        className="text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
                                    >
                                        {strings.logsTab.resetStats}
                                    </button>
                                </div>
                            ) : null}

                            {logs.length === 0 ? (
                                <p className="py-16 text-center text-[13px] text-muted-foreground">
                                    {strings.logsTab.emptyLine1}
                                    <br />
                                    {strings.logsTab.emptyLine2}
                                </p>
                            ) : (
                                <div className="overflow-y-auto divide-y divide-border pr-1 max-h-[500px]">
                                    {logs.map((log, index) => (
                                        <LogEntryView key={log.id} log={log} index={index} />
                                    ))}
                                </div>
                            )}
                        </Section>
                    )}
                </div>
            </div>
        </div>
    );
};
