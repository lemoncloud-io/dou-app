import { ChevronLeft, Database, Download, HardDrive, Plus, Trash2, XCircle } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { getMobileAppInfo, type CacheType } from '@chatic/app-messages';
import { useNavigateWithTransition } from '@chatic/shared';

import { webBridge } from '../../../shared/bridges/webBridge';

const CACHE_TYPES: CacheType[] = ['channel', 'chat', 'user', 'join', 'site', 'invitecloud'];
const BULK_COUNTS = [10, 50, 100, 500, 1000];

type LogLevel = 'info' | 'success' | 'error';

interface LogEntry {
    id: string;
    level: LogLevel;
    label: string;
    message: string;
    timestamp: string;
}

const generateMockItem = (type: CacheType, index: number): Record<string, unknown> => {
    const id = `test-${type}-${index}`;
    const base = { id, cid: 'test-cid', createdAt: Date.now(), updatedAt: Date.now() };

    switch (type) {
        case 'channel':
            return { ...base, sid: 'test-site', name: `Channel ${index}`, isNotificationEnabled: true };
        case 'chat':
            return { ...base, content: `Test message ${index}`, tempId: `temp-${index}` };
        case 'user':
            return { ...base, name: `User ${index}`, email: `user${index}@test.com` };
        case 'join':
            return { ...base, channelId: `ch-${index}`, userId: `u-${index}` };
        case 'site':
            return { ...base, name: `Site ${index}`, order: index };
        case 'invitecloud':
            return { ...base, name: `Cloud ${index}`, backend: 'https://test.api', wss: 'wss://test.ws' };
        default:
            return base;
    }
};

// --- UI Components ---

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
            ? 'bg-primary text-primary-foreground'
            : tone === 'danger'
              ? 'border-destructive/25 bg-destructive/10 text-destructive'
              : 'border-border bg-background text-foreground';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold disabled:opacity-40 ${toneClassName}`}
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
        className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
            active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground'
        }`}
    >
        {label}
    </button>
);

const levelClassName: Record<LogLevel, string> = {
    info: 'bg-muted text-muted-foreground',
    success: 'bg-primary/10 text-primary',
    error: 'bg-destructive/10 text-destructive',
};

// --- Page ---

export const DebugCacheTestPage = () => {
    const navigate = useNavigateWithTransition();

    const [selectedType, setSelectedType] = useState<CacheType>('channel');
    const [bulkCount, setBulkCount] = useState(10);
    const [cid, setCid] = useState('test-cloud');
    const [uid, setUid] = useState('test-user');
    const [isRunning, setIsRunning] = useState(false);
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

    const runTest = useCallback(
        async (label: string, type: string, data: Record<string, unknown>, bulkN?: number) => {
            setIsRunning(true);
            addLog('info', label, `Sending ${type}...`);
            const start = Date.now();
            try {
                const result = await webBridge.request(type as any, { data } as any);
                const elapsed = Date.now() - start;
                const resData = (result as any).data ?? {};

                let detail = '';
                if (resData.items != null) detail = `items=${resData.items.length}건`;
                else if (resData.ids != null) detail = `saved=${resData.ids.length}건`;
                else if (resData.item !== undefined) detail = `found=${resData.item !== null}`;
                else if (resData.success !== undefined) detail = `success=${resData.success}`;

                const avg = bulkN ? ` (${(elapsed / bulkN).toFixed(1)}ms/건)` : '';
                addLog('success', label, `${elapsed}ms${avg} — ${detail}`);
            } catch (e: any) {
                const elapsed = Date.now() - start;
                addLog('error', label, `${elapsed}ms — ${e.message ?? e}`);
            } finally {
                setIsRunning(false);
            }
        },
        [addLog]
    );

    const testSaveSingle = useCallback(() => {
        const item = generateMockItem(selectedType, 0);
        runTest('Save', 'SaveCacheData', { type: selectedType, cid, uid, id: item.id, item });
    }, [selectedType, cid, uid, runTest]);

    const testFetchSingle = useCallback(() => {
        runTest('Fetch', 'FetchCacheData', { type: selectedType, cid, uid, id: `test-${selectedType}-0` });
    }, [selectedType, cid, uid, runTest]);

    const testBulkSave = useCallback(() => {
        const items = Array.from({ length: bulkCount }, (_, i) => generateMockItem(selectedType, i));
        runTest('BulkSave', 'SaveAllCacheData', { type: selectedType, cid, uid, items }, bulkCount);
    }, [selectedType, cid, uid, bulkCount, runTest]);

    const testBulkFetch = useCallback(() => {
        runTest('BulkFetch', 'FetchAllCacheData', { type: selectedType, cid, uid });
    }, [selectedType, cid, uid, runTest]);

    const testDeleteSingle = useCallback(() => {
        runTest('Delete', 'DeleteCacheData', { type: selectedType, cid, uid, id: `test-${selectedType}-0` });
    }, [selectedType, cid, uid, runTest]);

    const testClearAll = useCallback(() => {
        runTest('Clear', 'ClearCacheData', { type: selectedType, cid, uid });
    }, [selectedType, cid, uid, runTest]);

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">Cache DB Test</span>
            </header>

            <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none pb-safe-bottom">
                <div className="flex min-w-0 max-w-full flex-col gap-3 p-4 pb-10">
                    {/* Status */}
                    <Section title="Status">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label="Mobile App" value={isOnMobileApp} />
                            <Metric label="Running" value={isRunning} />
                            <Metric label="CacheType" value={selectedType} />
                            <Metric label="Bulk Count" value={bulkCount} />
                        </div>
                        {!isOnMobileApp ? (
                            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                                Native bridge response is only available in mobile WebView.
                            </p>
                        ) : null}
                    </Section>

                    {/* Config */}
                    <Section title="Config">
                        <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">CacheType</p>
                        <div className="flex flex-wrap gap-2">
                            {CACHE_TYPES.map(t => (
                                <Chip
                                    key={t}
                                    label={t}
                                    active={selectedType === t}
                                    onClick={() => setSelectedType(t)}
                                />
                            ))}
                        </div>

                        <p className="mb-2 mt-4 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Bulk Count
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {BULK_COUNTS.map(n => (
                                <Chip
                                    key={n}
                                    label={String(n)}
                                    active={bulkCount === n}
                                    onClick={() => setBulkCount(n)}
                                />
                            ))}
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">cid</p>
                                <input
                                    type="text"
                                    value={cid}
                                    onChange={e => setCid(e.target.value)}
                                    className="w-full rounded-[8px] border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary"
                                />
                            </div>
                            <div>
                                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">uid</p>
                                <input
                                    type="text"
                                    value={uid}
                                    onChange={e => setUid(e.target.value)}
                                    className="w-full rounded-[8px] border border-border bg-background px-3 py-2 font-mono text-[13px] text-foreground outline-none focus:border-primary"
                                />
                            </div>
                        </div>
                    </Section>

                    {/* Actions */}
                    <Section title="Actions">
                        <div className="grid grid-cols-2 gap-2">
                            <ActionButton
                                icon={<Plus size={15} />}
                                label="단일 저장"
                                tone="primary"
                                onClick={testSaveSingle}
                                disabled={isRunning}
                            />
                            <ActionButton
                                icon={<Download size={15} />}
                                label="단일 조회"
                                onClick={testFetchSingle}
                                disabled={isRunning}
                            />
                            <ActionButton
                                icon={<HardDrive size={15} />}
                                label="대량 생성"
                                tone="primary"
                                onClick={testBulkSave}
                                disabled={isRunning}
                            />
                            <ActionButton
                                icon={<Database size={15} />}
                                label="대량 로드"
                                onClick={testBulkFetch}
                                disabled={isRunning}
                            />
                            <ActionButton
                                icon={<Trash2 size={15} />}
                                label="단일 삭제"
                                tone="danger"
                                onClick={testDeleteSingle}
                                disabled={isRunning}
                            />
                            <ActionButton
                                icon={<XCircle size={15} />}
                                label="전체 삭제"
                                tone="danger"
                                onClick={testClearAll}
                                disabled={isRunning}
                            />
                        </div>
                    </Section>

                    {/* Logs */}
                    <Section title={`Results (${logs.length})`}>
                        {logs.length > 0 ? (
                            <button
                                type="button"
                                onClick={clearLogs}
                                className="mb-2 text-[11px] font-medium text-muted-foreground"
                            >
                                Clear
                            </button>
                        ) : null}
                        {logs.length === 0 ? (
                            <p className="py-8 text-center text-[13px] text-muted-foreground">No test results yet</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {logs.map(log => (
                                    <div key={log.id} className="py-2.5 first:pt-0 last:pb-0">
                                        <div className="mb-1 flex items-center gap-2">
                                            <span
                                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${levelClassName[log.level]}`}
                                            >
                                                {log.label}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">{log.timestamp}</span>
                                        </div>
                                        <p className="max-w-full break-words font-mono text-[12px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
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
