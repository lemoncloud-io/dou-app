import {
    Check,
    ChevronLeft,
    Edit2,
    FileText,
    Flame,
    Lock,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    XCircle,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import type { AppMessageData } from '@chatic/app-messages';
import { type TestRecord } from '@chatic/app-messages';
import { useNavigateWithTransition } from '@chatic/shared';
import { webClient } from '@chatic/bridges';

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

export const DebugCacheTestPage = () => {
    const navigate = useNavigateWithTransition();

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

        // 사용자가 과거 로그 분석을 진행하는 것을 방해하지 않기 위해 강제 스크롤링 코드는 완전히 제거되었습니다.
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
        addLog('info', '텔레메트리', '시스템 성능 분석 지표가 초기화되었습니다.');
    }, [addLog]);

    // ----------------------------------------------------
    // SQLite Record Explorer Actions (CRUD & Fetch)
    // ----------------------------------------------------

    const loadAllRecords = useCallback(
        async (silent = false) => {
            if (!silent) setIsExplorerLoading(true);
            try {
                const response = await webClient.request('FetchAllTestRecords', { data: {} });
                if (response.type !== 'OnFetchAllTestRecords') {
                    throw new Error(`예상치 못한 응답 타입: ${response.type}`);
                }
                const typed = response as AppMessageData<'OnFetchAllTestRecords'>;

                const sorted = [...typed.data.items].sort((a, b) => b.updated_at - a.updated_at);
                setRecords(sorted);
                if (!silent) {
                    addLog('success', '익스플로러', `총 ${sorted.length}개의 SQLite 테스트 데이터를 로드했습니다.`);
                }
            } catch (e: any) {
                addLog('error', '익스플로러', `레코드 목록 로드 실패: ${e.message ?? String(e)}`);
            } finally {
                if (!silent) setIsExplorerLoading(false);
            }
        },
        [addLog]
    );

    // Handle Manual Insert
    const handleCreateRecord = useCallback(async () => {
        if (!newKey.trim()) {
            addLog('warning', '익스플로러', '추가할 레코드의 Key를 입력해주세요.');
            return;
        }

        setIsRunning(true);
        addLog('info', '익스플로러', `수동 레코드 추가 요청: '${newKey}' -> '${newValue}'`);
        const start = performance.now();

        try {
            const response = await webClient.request('SaveTestRecord', {
                data: { key: newKey.trim(), value: newValue },
            });
            const duration = performance.now() - start;

            if (response.type !== 'OnSaveTestRecord') {
                throw new Error(`예상치 못한 응답 타입: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnSaveTestRecord'>;
            if (typed.data.success) {
                addLog('success', '익스플로러', `레코드 '${newKey}' 저장 성공 (${duration.toFixed(1)}ms)`);
                setNewKey('');
                setNewValue('');
                updateStats(duration, true, '익스플로러:SaveTestRecord(수동 추가)');
                await loadAllRecords(true);
            } else {
                throw new Error('저장 처리가 실패했습니다.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', '익스플로러', `레코드 저장 실패: ${e.message ?? String(e)}`);
            updateStats(duration, false, '익스플로러:SaveTestRecord(수동 추가)');
        } finally {
            setIsRunning(false);
        }
    }, [newKey, newValue, addLog, updateStats, loadAllRecords]);

    // Handle Inline Edit
    const handleUpdateRecord = useCallback(
        async (key: string, value: string) => {
            setIsRunning(true);
            addLog('info', '익스플로러', `인라인 레코드 수정 요청: '${key}' = '${value}'`);
            const start = performance.now();

            try {
                const response = await webClient.request('SaveTestRecord', { data: { key, value } });
                const duration = performance.now() - start;

                if (response.type !== 'OnSaveTestRecord') {
                    throw new Error(`예상치 못한 응답 타입: ${response.type}`);
                }
                const typed = response as AppMessageData<'OnSaveTestRecord'>;
                if (typed.data.success) {
                    addLog('success', '익스플로러', `레코드 '${key}' 수정 성공 (${duration.toFixed(1)}ms)`);
                    setEditingKey(null);
                    updateStats(duration, true, '익스플로러:SaveTestRecord(인라인 수정)');
                    await loadAllRecords(true);
                } else {
                    throw new Error('수정 처리가 실패했습니다.');
                }
            } catch (e: any) {
                const duration = performance.now() - start;
                addLog('error', '익스플로러', `레코드 수정 실패: ${e.message ?? String(e)}`);
                updateStats(duration, false, '익스플로러:SaveTestRecord(인라인 수정)');
            } finally {
                setIsRunning(false);
            }
        },
        [addLog, updateStats, loadAllRecords]
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
        addLog('info', 'SQL_SAVE', `SQLite 테이블에 고유 데이터 ${sqliteBulkCount}개를 벌크 생성 및 저장 중...`);
        const start = performance.now();

        try {
            const items = Array.from({ length: sqliteBulkCount }, (_, i) => ({
                key: `perf_key_${i}_${Date.now() % 10000}`,
                value: `Val-${i}-${Math.random().toString(36).substring(2, 6)}`,
            }));

            const response = await webClient.request('SaveAllTestRecords', { data: { items } });
            const duration = performance.now() - start;

            if (response.type !== 'OnSaveAllTestRecords') {
                throw new Error(`예상치 못한 응답 타입: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnSaveAllTestRecords'>;
            if (typed.data.success) {
                addLog(
                    'success',
                    'SQL_SAVE',
                    `성공적으로 ${typed.data.count}개의 데이터를 벌크 저장했습니다. 경과 시간: ${duration.toFixed(1)}ms (${(duration / sqliteBulkCount).toFixed(2)}ms/레코드)`
                );
                updateStats(duration, true, `SQL_SAVE:SaveAllTestRecords(${sqliteBulkCount})`);
                await loadAllRecords(true);
            } else {
                throw new Error('네이티브 벌크 저장 응답이 실패 상태를 반환했습니다.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog(
                'error',
                'SQL_SAVE',
                `벌크 저장 중 오류 발생: ${duration.toFixed(1)}ms. 에러: ${e.message ?? String(e)}`
            );
            updateStats(duration, false, `SQL_SAVE:SaveAllTestRecords(${sqliteBulkCount})`);
        } finally {
            setIsRunning(false);
        }
    }, [sqliteBulkCount, addLog, updateStats, loadAllRecords]);

    // Scenario 1: Bulk Fetch
    const runSqliteBulkFetch = useCallback(async () => {
        setIsRunning(true);
        addLog('info', 'SQL_FETCH', `SQLite 데이터베이스에서 전체 데이터 조회를 실행 중...`);
        const start = performance.now();

        try {
            const response = await webClient.request('FetchAllTestRecords', { data: {} });
            const duration = performance.now() - start;

            if (response.type !== 'OnFetchAllTestRecords') {
                throw new Error(`예상치 못한 응답 타입: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnFetchAllTestRecords'>;
            const count = typed.data.items.length;
            addLog(
                'success',
                'SQL_FETCH',
                `총 ${count}개의 레코드를 로드했습니다. 경과 시간: ${duration.toFixed(1)}ms (${count > 0 ? (duration / count).toFixed(2) : 0}ms/레코드)`
            );
            updateStats(duration, true, `SQL_FETCH:FetchAllTestRecords(${count})`);
            await loadAllRecords(true);
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', 'SQL_FETCH', `조회 실패: ${duration.toFixed(1)}ms. 에러: ${e.message ?? String(e)}`);
            updateStats(duration, false, 'SQL_FETCH:FetchAllTestRecords');
        } finally {
            setIsRunning(false);
        }
    }, [addLog, updateStats, loadAllRecords]);

    // Scenario 1: Clear SQLite Database
    const runSqliteClear = useCallback(async () => {
        setIsRunning(true);
        addLog('warning', 'SQL_CLEAR', `SQLite 'test_records' 테이블의 모든 레코드를 비우는 중...`);
        const start = performance.now();

        try {
            const response = await webClient.request('ClearTestRecords', { data: {} });
            const duration = performance.now() - start;

            if (response.type !== 'OnClearTestRecords') {
                throw new Error(`예상치 못한 응답 타입: ${response.type}`);
            }
            const typed = response as AppMessageData<'OnClearTestRecords'>;
            if (typed.data.success) {
                addLog(
                    'success',
                    'SQL_CLEAR',
                    `SQLite 테이블을 성공적으로 초기화했습니다. 소요 시간: ${duration.toFixed(1)}ms`
                );
                updateStats(duration, true, 'SQL_CLEAR:ClearTestRecords');
                await loadAllRecords(true);
            } else {
                throw new Error('초기화 작업이 실패했습니다.');
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            addLog('error', 'SQL_CLEAR', `초기화 작업 실패: ${duration.toFixed(1)}ms. 에러: ${e.message ?? String(e)}`);
            updateStats(duration, false, 'SQL_CLEAR:ClearTestRecords');
        } finally {
            setIsRunning(false);
        }
    }, [addLog, updateStats, loadAllRecords]);

    // Scenario 2: Concurrency Write-Consistency Verification
    const runSqliteConcurrencyTest = useCallback(async () => {
        setIsRunning(true);
        setConcurrencyResult({ status: 'running', expected: `Value-${concurrencyCount}`, actual: '', duration: 0 });
        addLog(
            'info',
            '동시성_검증',
            `동일 키 '${concurrencyKey}'에 대해 ${concurrencyCount}회 연속 쓰기 명령을 병렬 전송(Promise.all) 중...`
        );

        const start = performance.now();
        try {
            const promises = [];
            for (let i = 1; i <= concurrencyCount; i++) {
                promises.push(
                    webClient.request('SaveTestRecord', { data: { key: concurrencyKey, value: `Value-${i}` } })
                );
            }

            addLog('info', '동시성_검증', `병렬 Promise들의 반환을 대기 중...`);
            await Promise.all(promises);

            addLog(
                'info',
                '동시성_검증',
                `연속 쓰기 완료. DB에 최종적으로 영속화된 '${concurrencyKey}'의 값을 확인 중...`
            );
            const fetchResponse = await webClient.request('FetchTestRecord', { data: { key: concurrencyKey } });
            if (fetchResponse.type !== 'OnFetchTestRecord') {
                throw new Error(`예상치 못한 응답 타입: ${fetchResponse.type}`);
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
                    '동시성_검증',
                    `🏆 검증 성공! '${concurrencyKey}'의 최종값은 예상대로 '${finalValue}'입니다. 네이티브 AsyncMutexQueue가 동시 요청을 완벽히 직렬화하여 처리했습니다.`
                );
                updateStats(duration, true, `동시성_검증:SaveTestRecord*${concurrencyCount}+FetchTestRecord`);
                await loadAllRecords(true);
            } else {
                setConcurrencyResult({ status: 'fail', expected: expectedValue, actual: finalValue, duration });
                addLog(
                    'error',
                    '동시성_검증',
                    `⚠️ 레이스 컨디션 감지. 예상치 '${expectedValue}' 이지만 DB 실젯값은 '${finalValue}'로 훼손되었습니다.`
                );
                updateStats(duration, false, `동시성_검증:SaveTestRecord*${concurrencyCount}+FetchTestRecord`);
            }
        } catch (e: any) {
            const duration = performance.now() - start;
            setConcurrencyResult({ status: 'fail', expected: `Value-${concurrencyCount}`, actual: 'ERROR', duration });
            addLog('error', '동시성_검증', `검증 실패: ${e.message ?? String(e)}`);
            updateStats(duration, false, `동시성_검증:SaveTestRecord*${concurrencyCount}+FetchTestRecord`);
        } finally {
            setIsRunning(false);
        }
    }, [concurrencyCount, concurrencyKey, addLog, updateStats, loadAllRecords]);

    // Scenario 3: Hybrid Bridge Flooding / Stress Testing
    const runSqliteFloodTest = useCallback(async () => {
        setIsRunning(true);
        setFloodProgress(0);
        setFloodStats(null);
        addLog(
            'info',
            '스트레스',
            `${floodStrategy.toUpperCase()} 전략으로 총 ${floodCount}회의 부하 요청을 브릿지에 전달 중...`
        );

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
                    const res = await webClient.request('SaveTestRecord', {
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
                '스트레스',
                `부하 테스트 완료! 총 소요 시간: ${elapsed.toFixed(
                    0
                )}ms. 처리량: ${rps} req/s. 성공률: ${successRate}%. 평균 RTT: ${avgMs}ms (σ=${stddevMs}ms).`
            );
            updateStats(elapsed, successRate > 95, `스트레스:SaveTestRecord*${floodCount}(${floodStrategy})`);
            await loadAllRecords(true);
        } catch (e: any) {
            const elapsed = performance.now() - start;
            addLog('error', '스트레스', `부하 테스트 중단: ${elapsed.toFixed(0)}ms. 에러: ${e.message ?? String(e)}`);
            updateStats(elapsed, false, `스트레스:SaveTestRecord*${floodCount}(${floodStrategy})`);
        } finally {
            setIsRunning(false);
        }
    }, [floodCount, floodStrategy, addLog, updateStats, loadAllRecords]);

    // Initial Database Load
    useEffect(() => {
        addLog(
            'info',
            '초기화',
            `실시간 텔레메트리 대시보드가 로드되었습니다. 환경: ${isOnMobileApp ? '하이브리드 앱 웹뷰' : '일반 웹 브라우저'}`
        );
        loadAllRecords();
    }, [isOnMobileApp, addLog, loadAllRecords]);

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background pt-safe-top">
            {/* Header matching DebugLogBufferPage.tsx */}
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-semibold text-foreground">
                    SQLite 브릿지 벤치마크 및 데이터 관리
                </span>
            </header>

            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none pb-safe-bottom">
                <div className="flex min-w-0 max-w-full flex-col gap-3 p-4 pb-10">
                    {/* 1. 상단 상시 노출: 상태 정보 (Status Summary) */}
                    <Section title="실시간 DB 상태 정보">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric
                                label="모바일 앱 연동"
                                value={isOnMobileApp ? '연결됨 (WebView)' : '미연결 (일반 브라우저)'}
                            />
                            <Metric label="통신 보증" value="직렬화 큐 (Active)" />
                            <Metric label="총 실행 수" value={totalOps} />
                            <Metric label="평균 RTT 지연시간" value={avgLatency ? `${avgLatency} ms` : '-'} />
                            <Metric
                                label="RTT 표준편차"
                                value={latencyStdDevMs !== null ? `${latencyStdDevMs.toFixed(1)} ms` : '-'}
                            />
                            <Metric label="처리량 (ops/s)" value={opsPerSec !== null ? opsPerSec.toFixed(2) : '-'} />
                            <Metric label="실패 수" value={failCount} />
                            <Metric
                                label="벤치마크 성공 비율"
                                value={totalOps > 0 ? `${((successCount / totalOps) * 100).toFixed(1)}%` : '100%'}
                            />
                            <Metric label="SQLite 대상 테이블" value="test_records" />
                        </div>
                    </Section>

                    <Section title="느린 요청 TOP 10 (전체 RTT 기준)">
                        <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label="샘플 수" value={latencyStats.count} />
                            <Metric
                                label="평균 RTT (mean)"
                                value={latencyStats.count > 0 ? `${latencyStats.mean.toFixed(1)} ms` : '-'}
                            />
                            <Metric
                                label="최소 RTT"
                                value={latencyStats.count > 0 ? `${latencyStats.min.toFixed(1)} ms` : '-'}
                            />
                            <Metric
                                label="최대 RTT"
                                value={latencyStats.count > 0 ? `${latencyStats.max.toFixed(1)} ms` : '-'}
                            />
                        </div>

                        {slowOps.length === 0 ? (
                            <p className="py-8 text-center text-[12.5px] text-muted-foreground">
                                아직 측정된 실행 기록이 없습니다. 성능 시나리오를 실행하면 자동으로 집계됩니다.
                            </p>
                        ) : (
                            <div className="rounded-xl border border-border bg-background">
                                <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                        실행 기록 (느린 순)
                                    </p>
                                    <button
                                        type="button"
                                        onClick={resetStats}
                                        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors"
                                    >
                                        통계 초기화
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

                    {/* 2. 대시보드 3단 탭 셀렉터 */}
                    <Section title="모니터링 탭 선택">
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
                                        ? '성능 시나리오'
                                        : tab === 'explorer'
                                          ? '레코드 익스플로러'
                                          : `실시간 로그 (${logs.length})`}
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
                            <Section title="시나리오 1: 대용량 데이터 성능 측정">
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    대량의 데이터 쓰기 및 조회 처리를 빈번히 수행할 때 네이티브 SQLite의 소요 시간 및
                                    평균 처리량(throughput)을 측정합니다.
                                </p>

                                <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                    테스트 대상 레코드 개수
                                </p>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {BULK_COUNTS.map(count => (
                                        <Chip
                                            key={count}
                                            label={`${count}개 레코드`}
                                            active={sqliteBulkCount === count}
                                            onClick={() => setSqliteBulkCount(count)}
                                        />
                                    ))}
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <ActionButton
                                        icon={<Plus size={14} />}
                                        label="대량 저장"
                                        tone="primary"
                                        onClick={runSqliteBulkSave}
                                        disabled={isRunning}
                                    />
                                    <ActionButton
                                        icon={<RefreshCw size={14} />}
                                        label="대량 로드"
                                        onClick={runSqliteBulkFetch}
                                        disabled={isRunning}
                                    />
                                    <ActionButton
                                        icon={<Trash2 size={14} />}
                                        label="전체 초기화"
                                        tone="danger"
                                        onClick={runSqliteClear}
                                        disabled={isRunning}
                                    />
                                </div>
                            </Section>

                            {/* Scenario 2: Concurrency Write-Consistency Verification */}
                            <Section title="시나리오 2: 동시 쓰기 정합성 및 Mutex 검증">
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    동일한 키에 대해 수백 개의 빈번한 쓰기 요청을 동시에 전송(Promise.all)하고, 최종
                                    저장된 레코드가 마지막으로 요청된 값과 정확히 일치하는지 순차 정합성을 검증합니다.
                                </p>

                                <div className="mb-4 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            테스트 테이블 키
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
                                            동시 쓰기 횟수 (N)
                                        </label>
                                        <select
                                            value={concurrencyCount}
                                            onChange={e => setConcurrencyCount(Number(e.target.value))}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="50">50회 연속 쓰기</option>
                                            <option value="100">100회 연속 쓰기</option>
                                            <option value="200">200회 연속 쓰기</option>
                                            <option value="500">500회 연속 쓰기</option>
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
                                                    ? '직렬화 쓰기 큐 순서 제어 검증 중...'
                                                    : concurrencyResult.status === 'success'
                                                      ? '순차 정합성 검증 완료 (통과)'
                                                      : '순차 일관성 훼손 오류 (실패)'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1">
                                            <div>
                                                예상 최종값:{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.expected}
                                                </span>
                                            </div>
                                            <div>
                                                DB 실제값:{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.actual}
                                                </span>
                                            </div>
                                            <div>
                                                소요 시간:{' '}
                                                <span className="font-semibold text-foreground">
                                                    {concurrencyResult.duration.toFixed(1)}ms
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <ActionButton
                                    icon={<Lock size={14} />}
                                    label="순차 정합성 일관성 검증하기"
                                    tone="primary"
                                    onClick={runSqliteConcurrencyTest}
                                    disabled={isRunning}
                                />
                            </Section>

                            {/* Scenario 3: Hybrid Bridge Flooding / Stress Testing */}
                            <Section title="시나리오 3: 하이브리드 브릿지 포화 스트레스 테스트">
                                <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                    웹뷰 브릿지를 통해 서로 다른 라우팅 방식으로 수천 개의 동시 작업을 쏟아부어 포화
                                    상태에서의 반응 속도와 대기 전송 안정성을 테스트합니다.
                                </p>

                                <div className="mb-4 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            총 요청 전송 수
                                        </label>
                                        <select
                                            value={floodCount}
                                            onChange={e => setFloodCount(Number(e.target.value))}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="100">100회 브릿지 부하 전송</option>
                                            <option value="500">500회 브릿지 부하 전송</option>
                                            <option value="1000">1000회 브릿지 부하 전송</option>
                                            <option value="2000">2000회 브릿지 부하 전송</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            부하 분배 전송 방식
                                        </label>
                                        <select
                                            value={floodStrategy}
                                            onChange={e => setFloodStrategy(e.target.value as any)}
                                            className="w-full h-[38px] rounded-[8px] border border-border bg-background px-3 py-1 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                        >
                                            <option value="parallel">일시 병렬 전송 (Promise.all)</option>
                                            <option value="chunked">그룹 청크 분할 (50개씩 지연)</option>
                                            <option value="sequential">단일 동기식 순차 전송 (Waterfall)</option>
                                        </select>
                                    </div>
                                </div>

                                {isRunning && floodProgress > 0 && (
                                    <div className="mb-4">
                                        <div className="mb-1.5 flex items-center justify-between text-[11px] font-mono font-bold text-muted-foreground">
                                            <span>부하 전송 진행도</span>
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
                                            스트레스 벤치마크 분석 보고
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">총 소요 시간</p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.totalTime} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">처리량</p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.rps} req/s
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">전송 성공률</p>
                                                <p className="text-[13.5px] font-semibold text-primary">
                                                    {floodStats.successRate}%
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">평균 RTT</p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    {floodStats.avgMs} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">RTT 표준편차</p>
                                                <p className="text-[13.5px] font-semibold text-foreground">
                                                    σ {floodStats.stddevMs} ms
                                                </p>
                                            </div>
                                            <div className="rounded-[10px] border border-border bg-background/60 p-2">
                                                <p className="text-[9px] text-muted-foreground">느린 요청 (Top1)</p>
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
                                                        느린 요청 TOP 10 (Flood 단건 RTT)
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
                                    label="브릿지 포화 스트레스 테스트 기동"
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
                        <Section title="SQLite 실시간 레코드 익스플로러">
                            <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
                                모바일 기기 SQLite `test_records` 테이블 내부의 모든 레코드를 조회하고 직접 개별적으로
                                수정 및 추가할 수 있는 데이터 제어 패널입니다.
                            </p>

                            {/* Manual Insert Form */}
                            <div className="mb-4 rounded-xl border border-border bg-background p-3">
                                <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                                    <Sparkles size={11} />
                                    <span>신규 테스트 레코드 수동 추가</span>
                                </p>
                                <div className="flex flex-col gap-2.5 sm:flex-row">
                                    <input
                                        type="text"
                                        placeholder="키 (Key) 입력..."
                                        value={newKey}
                                        onChange={e => setNewKey(e.target.value)}
                                        className="flex-1 rounded-[8px] border border-border bg-card px-3 py-1.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
                                    />
                                    <input
                                        type="text"
                                        placeholder="값 (Value) 입력..."
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
                                        <span>추가</span>
                                    </button>
                                </div>
                            </div>

                            {/* Search and Action Bar */}
                            <div className="mb-3 flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="키 또는 값 실시간 필터 검색..."
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
                                    title="목록 새로고침"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${isExplorerLoading ? 'animate-spin' : ''}`} />
                                </button>
                            </div>

                            {/* Records List Container */}
                            <div className="overflow-y-auto rounded-xl border border-border bg-background max-h-[500px]">
                                {isExplorerLoading && records.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                                        <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                                        <span className="text-[12px] text-muted-foreground">SQLite DB 조회 중...</span>
                                    </div>
                                ) : filteredRecords.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                                        <FileText className="mb-2 h-7 w-7 text-muted-foreground/50" />
                                        <p className="text-[12.5px] font-medium">데이터가 없습니다.</p>
                                        <p className="text-[10px] text-muted-foreground/75 mt-0.5 font-sans">
                                            수동 추가 폼 또는 성능 시나리오 탭에서 데이터를 먼저 삽입하세요.
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
                                                                        title="수정사항 저장"
                                                                    >
                                                                        <Check size={13} />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={cancelEditing}
                                                                        className="flex h-7 w-7 items-center justify-center rounded-[6px] border border-border bg-card text-foreground"
                                                                        title="취소"
                                                                    >
                                                                        <XCircle size={13} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="mt-1 break-all font-mono text-[12.5px] text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
                                                                    {record.value || (
                                                                        <span className="italic text-muted-foreground/40">
                                                                            (빈 값)
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
                                                                title="값 수정"
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="mt-2.5 flex items-center justify-between text-[9px] text-muted-foreground">
                                                        <span>마지막 변경</span>
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
                        <Section title={`텔레메트리 실시간 분석 로그 (${logs.length})`}>
                            {logs.length > 0 ? (
                                <div className="mb-3 flex items-center justify-between">
                                    <button
                                        type="button"
                                        onClick={clearLogs}
                                        className="text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
                                    >
                                        로그 스트림 비우기
                                    </button>
                                    <button
                                        type="button"
                                        onClick={resetStats}
                                        className="text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors uppercase tracking-wider"
                                    >
                                        롤링 통계 초기화
                                    </button>
                                </div>
                            ) : null}

                            {logs.length === 0 ? (
                                <p className="py-16 text-center text-[13px] text-muted-foreground">
                                    측정 데이터 및 이벤트 히스토리가 비어 있습니다.
                                    <br />
                                    성능 시나리오 또는 레코드 제어를 실행하세요.
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
