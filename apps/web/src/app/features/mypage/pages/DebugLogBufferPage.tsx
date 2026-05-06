import { ChevronLeft, RefreshCw, Scissors, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';

import {
    getMobileAppInfo,
    logger,
    postMessage,
    useHandleAppMessage,
    type AppLogInfo,
    type AppLogLevel,
} from '@chatic/app-messages';
import { useNavigateWithTransition } from '@chatic/shared';

const LOG_FETCH_LIMIT = 20;

const levelClassName: Record<AppLogLevel | 'unknown', string> = {
    debug: 'bg-muted text-muted-foreground',
    info: 'bg-primary/10 text-primary',
    warn: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
    error: 'bg-destructive/10 text-destructive',
    unknown: 'bg-muted text-muted-foreground',
};

const createNonce = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-';

    const normalizedTimestamp = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalizedTimestamp);

    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString();
};

const stringifyValue = (value: unknown) => {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const hasErrorValue = (value: unknown) => {
    if (value === undefined || value === null) return false;
    if (typeof value !== 'string') return true;

    const normalized = value.trim().toLowerCase().replace(/\.+$/, '');
    return normalized !== '' && normalized !== 'unknown error';
};

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
}: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: 'default' | 'primary' | 'danger';
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
            className={`flex min-h-[42px] items-center justify-center gap-2 rounded-[10px] border px-3 text-[13px] font-semibold ${toneClassName}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
};

const LogEntry = ({ log, index }: { log: AppLogInfo; index: number }) => {
    const level = (log.level ?? 'unknown') as AppLogLevel | 'unknown';
    const data = stringifyValue(log.data);
    const error = hasErrorValue(log.error) ? stringifyValue(log.error) : '';

    return (
        <article className="min-w-0 max-w-full overflow-hidden py-3 first:pt-0 last:pb-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${levelClassName[level]}`}
                    >
                        {level}
                    </span>
                    <span className="truncate font-mono text-[12px] font-semibold text-foreground">{log.tag}</span>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">#{index + 1}</span>
            </div>
            <p className="max-w-full break-words text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {log.message || '-'}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
            {data ? (
                <pre className="mt-2 max-h-[160px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                    {data}
                </pre>
            ) : null}
            {error ? (
                <pre className="mt-2 max-h-[160px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-destructive/10 p-2 font-mono text-[11px] leading-relaxed text-destructive [overflow-wrap:anywhere]">
                    {error}
                </pre>
            ) : null}
        </article>
    );
};

export const DebugLogBufferPage = () => {
    const navigate = useNavigateWithTransition();
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const requestedLimitRef = useRef(LOG_FETCH_LIMIT);
    const [limit, setLimit] = useState(LOG_FETCH_LIMIT);
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [bufferSize, setBufferSize] = useState<number | null>(null);
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [lastAction, setLastAction] = useState('Idle');
    const [lastNonce, setLastNonce] = useState<string | null>(null);
    const [lastResponseAt, setLastResponseAt] = useState<string | null>(null);
    const [clearSuccess, setClearSuccess] = useState<boolean | null>(null);

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return getMobileAppInfo().isOnMobileApp;
    }, []);

    const hasMoreLogs = bufferSize === null || logs.length < bufferSize;

    const markRequest = useCallback((action: string, nonce: string) => {
        setLastAction(`${action} requested`);
        setLastNonce(nonce);
        setLastResponseAt(null);
        setClearSuccess(null);
    }, []);

    const markResponse = useCallback((action: string, size: number, nonce?: string) => {
        setLastAction(`${action} received`);
        setBufferSize(size);
        setLastNonce(nonce ?? null);
        setLastResponseAt(new Date().toLocaleTimeString());
    }, []);

    const fetchLogs = useCallback(
        (nextLimit: number, action = 'Fetch') => {
            const normalizedLimit = Math.max(LOG_FETCH_LIMIT, nextLimit);
            const nonce = createNonce('fetch-log-buffer');
            requestedLimitRef.current = normalizedLimit;
            setLimit(normalizedLimit);
            setIsFetchingLogs(true);
            markRequest(action, nonce);
            postMessage({ type: 'FetchAppLogBuffer', nonce, data: { count: normalizedLimit } });
        },
        [markRequest]
    );

    const refreshLogs = useCallback(() => {
        fetchLogs(LOG_FETCH_LIMIT, 'Refresh');
    }, [fetchLogs]);

    const loadMoreLogs = useCallback(() => {
        if (isFetchingLogs || !hasMoreLogs) return;

        const nextLimit = bufferSize === null ? limit + LOG_FETCH_LIMIT : Math.min(limit + LOG_FETCH_LIMIT, bufferSize);
        fetchLogs(nextLimit, 'Load more');
    }, [bufferSize, fetchLogs, hasMoreLogs, isFetchingLogs, limit]);

    const handleScroll = useCallback(
        (event: UIEvent<HTMLDivElement>) => {
            const target = event.currentTarget;
            const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

            if (distanceToBottom < 160) {
                loadMoreLogs();
            }
        },
        [loadMoreLogs]
    );

    const pollLogs = useCallback(() => {
        const nonce = createNonce('poll-log-buffer');
        markRequest('Poll', nonce);
        postMessage({ type: 'PollAppLogBuffer', nonce, data: { count: limit } });
    }, [limit, markRequest]);

    const clearLogs = useCallback(() => {
        const nonce = createNonce('clear-log-buffer');
        markRequest('Clear', nonce);
        postMessage({ type: 'ClearAppLogBuffer', nonce });
    }, [markRequest]);

    const fetchSize = useCallback(() => {
        const nonce = createNonce('fetch-log-buffer-size');
        markRequest('Size', nonce);
        postMessage({ type: 'FetchAppLogBufferSize', nonce });
    }, [markRequest]);

    const generateSampleLogs = useCallback(() => {
        const requestId = Date.now().toString(36);
        const source = 'DebugLogBufferPage';

        logger.debug('LOG_BUFFER_TEST', 'debug sample', { requestId, source });
        logger.info('LOG_BUFFER_TEST', 'info sample', { requestId, source });
        logger.warn('LOG_BUFFER_TEST', 'warn sample', { requestId, source });
        logger.error('LOG_BUFFER_TEST', 'error sample', {
            error: new Error('debug log buffer sample'),
            data: { requestId, source },
        });

        const nextLimit = Math.max(limit, (bufferSize ?? limit) + 4);
        setLastAction('Sample logs sent');
        window.setTimeout(() => fetchLogs(nextLimit, 'Fetch'), 250);
    }, [bufferSize, fetchLogs, limit]);

    useHandleAppMessage('OnFetchAppLogBuffer', message => {
        setLogs(message.data.logs ?? []);
        setLimit(requestedLimitRef.current);
        setIsFetchingLogs(false);
        markResponse('Fetch', message.data.size, message.nonce);
    });

    useHandleAppMessage('OnPollAppLogBuffer', message => {
        setLogs(message.data.logs ?? []);
        setBufferSize(message.data.size);
        setIsFetchingLogs(false);
        markResponse('Poll', message.data.size, message.nonce);
    });

    useHandleAppMessage('OnClearAppLogBuffer', message => {
        setLogs([]);
        setLimit(LOG_FETCH_LIMIT);
        requestedLimitRef.current = LOG_FETCH_LIMIT;
        setIsFetchingLogs(false);
        setClearSuccess(message.data.success);
        markResponse('Clear', message.data.size, message.nonce);
    });

    useHandleAppMessage('OnFetchAppLogBufferSize', message => {
        markResponse('Size', message.data.size, message.nonce);
    });

    useEffect(() => {
        fetchLogs(LOG_FETCH_LIMIT);
    }, [fetchLogs]);

    useEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer || isFetchingLogs || !hasMoreLogs) return;

        if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 8) {
            loadMoreLogs();
        }
    }, [hasMoreLogs, isFetchingLogs, loadMoreLogs, logs.length]);

    return (
        <div className="flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">Log Buffer</span>
            </header>

            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none pb-safe-bottom"
            >
                <div className="flex min-w-0 max-w-full flex-col gap-3 p-4 pb-10">
                    <Section title="Status">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label="Mobile App" value={isOnMobileApp} />
                            <Metric label="Buffer Size" value={bufferSize} />
                            <Metric label="Loaded Logs" value={logs.length} />
                            <Metric label="Limit" value={limit} />
                            <Metric label="Last Action" value={lastAction} />
                            <Metric label="Last Response" value={lastResponseAt} />
                            <Metric label="Last Nonce" value={lastNonce} />
                            <Metric label="Clear Success" value={clearSuccess} />
                        </div>
                        {!isOnMobileApp ? (
                            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                                Native bridge response is only available in mobile WebView.
                            </p>
                        ) : null}
                    </Section>

                    <Section title="Controls">
                        <div className="grid grid-cols-2 gap-2">
                            <ActionButton
                                icon={<Zap size={15} />}
                                label="Sample"
                                tone="primary"
                                onClick={generateSampleLogs}
                            />
                            <ActionButton icon={<RefreshCw size={15} />} label="Refresh" onClick={refreshLogs} />
                            <ActionButton icon={<Scissors size={15} />} label="Poll" onClick={pollLogs} />
                            <ActionButton icon={<RefreshCw size={15} />} label="Size" onClick={fetchSize} />
                            <ActionButton icon={<Trash2 size={15} />} label="Clear" tone="danger" onClick={clearLogs} />
                        </div>
                    </Section>

                    <Section title={`Logs (${logs.length})`}>
                        {logs.length === 0 ? (
                            <p className="py-8 text-center text-[13px] text-muted-foreground">No logs loaded</p>
                        ) : (
                            <div className="divide-y divide-border">
                                {logs.map((log, index) => (
                                    <LogEntry
                                        key={`${log.timestamp ?? 'no-time'}-${index}-${log.tag}`}
                                        log={log}
                                        index={index}
                                    />
                                ))}
                            </div>
                        )}
                        {logs.length > 0 ? (
                            <div className="border-t border-border py-3 text-center text-[12px] text-muted-foreground">
                                {hasMoreLogs
                                    ? isFetchingLogs
                                        ? 'Loading...'
                                        : `Scroll to load ${LOG_FETCH_LIMIT} more`
                                    : 'End of buffer'}
                            </div>
                        ) : null}
                    </Section>
                </div>
            </div>
        </div>
    );
};
