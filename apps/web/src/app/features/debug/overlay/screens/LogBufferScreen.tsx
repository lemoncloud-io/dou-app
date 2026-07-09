import { ChevronDown, ChevronRight, Copy, RefreshCw, Scissors, Search, Trash2, Zap } from 'lucide-react';
import { type ReactNode, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isNative, logger } from '@chatic/bridges';
import type { AppLogInfo, AppLogLevel } from '@chatic/app-messages';

import {
    appBridge,
    useOnClearAppLogBuffer,
    useOnFetchAppLogBuffer,
    useOnFetchAppLogBufferSize,
    useOnPollAppLogBuffer,
} from '../../../../bridge';
import {
    copyText,
    filterLogs,
    formatLogForCopy,
    formatTimestamp,
    hasErrorValue,
    stringifyValue,
    webLogSource,
} from '../../lib';

const LOG_FETCH_LIMIT = 20;

const LEVELS: AppLogLevel[] = ['debug', 'info', 'warn', 'error'];

const levelClassName: Record<AppLogLevel | 'unknown', string> = {
    debug: 'bg-muted text-muted-foreground',
    info: 'bg-primary/10 text-primary',
    warn: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
    error: 'bg-destructive/10 text-destructive',
    unknown: 'bg-muted text-muted-foreground',
};

const createNonce = (prefix: string) =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

/** Small copy button used inside an expanded log entry. */
const CopyButton = ({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => void }) => (
    <button
        type="button"
        onClick={event => {
            // Row header owns the expand toggle; keep copy from collapsing it.
            event.stopPropagation();
            onCopy(value);
        }}
        className="inline-flex items-center gap-1 rounded-[8px] border border-border bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground"
    >
        <Copy size={12} />
        {label}
    </button>
);

const LogRow = ({
    log,
    index,
    expanded,
    onToggle,
    onCopy,
}: {
    log: AppLogInfo;
    index: number;
    expanded: boolean;
    onToggle: () => void;
    onCopy: (value: string) => void;
}) => {
    const level = (log.level ?? 'unknown') as AppLogLevel | 'unknown';
    const data = stringifyValue(log.data);
    const error = hasErrorValue(log.error) ? stringifyValue(log.error) : '';

    return (
        <article className="min-w-0 max-w-full overflow-hidden py-3 first:pt-0 last:pb-0">
            <button type="button" onClick={onToggle} className="flex w-full min-w-0 flex-col text-left">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        {expanded ? (
                            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${levelClassName[level]}`}
                        >
                            {level}
                        </span>
                        <span className="truncate font-mono text-[12px] font-semibold text-foreground">{log.tag}</span>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">#{index + 1}</span>
                </div>
                <p
                    className={`max-w-full break-words text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere] ${expanded ? '' : 'line-clamp-2'}`}
                >
                    {log.message || '-'}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">{formatTimestamp(log.timestamp)}</p>
            </button>

            {expanded ? (
                <div className="mt-2 flex flex-col gap-2">
                    {data ? (
                        <div className="min-w-0">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">data</span>
                                <CopyButton label="Copy" value={data} onCopy={onCopy} />
                            </div>
                            <pre className="max-h-[240px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                                {data}
                            </pre>
                        </div>
                    ) : null}
                    {error ? (
                        <div className="min-w-0">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-destructive">error</span>
                                <CopyButton label="Copy" value={error} onCopy={onCopy} />
                            </div>
                            <pre className="max-h-[240px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-destructive/10 p-2 font-mono text-[11px] leading-relaxed text-destructive [overflow-wrap:anywhere]">
                                {error}
                            </pre>
                        </div>
                    ) : null}
                    <div className="flex justify-end">
                        <CopyButton label="Copy entry" value={formatLogForCopy(log)} onCopy={onCopy} />
                    </div>
                </div>
            ) : null}
        </article>
    );
};

export const LogBufferScreen = () => {
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const requestedLimitRef = useRef(LOG_FETCH_LIMIT);
    const [limit, setLimit] = useState(LOG_FETCH_LIMIT);
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [bufferSize, setBufferSize] = useState<number | null>(null);
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [lastAction, setLastAction] = useState('Idle');
    const [lastResponseAt, setLastResponseAt] = useState<string | null>(null);
    const [clearSuccess, setClearSuccess] = useState<boolean | null>(null);

    const [activeLevels, setActiveLevels] = useState<Set<AppLogLevel>>(new Set());
    const [query, setQuery] = useState('');
    const [expandedKey, setExpandedKey] = useState<number | null>(null);
    const [copiedAt, setCopiedAt] = useState<number | null>(null);

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return isNative();
    }, []);

    // Native loads oldest-first in pages; web loads the whole snapshot at once.
    const hasMoreLogs = isOnMobileApp && (bufferSize === null || logs.length < bufferSize);

    const visibleLogs = useMemo(() => filterLogs(logs, { levels: activeLevels, query }), [logs, activeLevels, query]);

    // Each buffer entry is a distinct object even when content is identical
    // (socket retries repeat the same tag/message/timestamp). Keying rows by
    // their position in the loaded snapshot gives React unique, stable keys —
    // content-based keys collide and break list reconciliation on filtering.
    const keyByLog = useMemo(() => new Map(logs.map((log, index) => [log, index])), [logs]);

    const markRequest = useCallback((action: string) => {
        setLastAction(`${action} requested`);
        setLastResponseAt(null);
        setClearSuccess(null);
    }, []);

    const markResponse = useCallback((action: string, size: number) => {
        setLastAction(`${action} received`);
        setBufferSize(size);
        setLastResponseAt(new Date().toLocaleTimeString());
    }, []);

    const fetchLogs = useCallback(
        (nextLimit: number, action = 'Fetch') => {
            // Plain web: read the whole in-memory buffer synchronously. Ordering
            // and paging are handled at display time (newest-first), so there is
            // no incremental limit or bridge round-trip here.
            if (!isOnMobileApp) {
                const { logs: webLogs, size } = webLogSource.fetch();
                setLogs(webLogs);
                setIsFetchingLogs(false);
                markResponse(action, size);
                return;
            }

            const normalizedLimit = Math.max(LOG_FETCH_LIMIT, nextLimit);
            const nonce = createNonce('fetch-log-buffer');
            requestedLimitRef.current = normalizedLimit;
            setLimit(normalizedLimit);
            setIsFetchingLogs(true);
            markRequest(action);
            appBridge.fetchAppLogBuffer(nonce, normalizedLimit);
        },
        [isOnMobileApp, markRequest, markResponse]
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

    // Native-only: poll consumes entries from the app buffer. Omitted on web
    // because consuming logs from a live viewer is destructive.
    const pollLogs = useCallback(() => {
        const nonce = createNonce('poll-log-buffer');
        markRequest('Poll');
        appBridge.pollAppLogBuffer(nonce, limit);
    }, [limit, markRequest]);

    const clearLogs = useCallback(() => {
        setExpandedKey(null);

        if (!isOnMobileApp) {
            const { success, size } = webLogSource.clear();
            setLogs([]);
            setClearSuccess(success);
            markResponse('Clear', size);
            return;
        }

        const nonce = createNonce('clear-log-buffer');
        markRequest('Clear');
        appBridge.clearAppLogBuffer(nonce);
    }, [isOnMobileApp, markRequest, markResponse]);

    const generateSampleLogs = useCallback(() => {
        const requestId = Date.now().toString(36);
        const source = 'LogBufferScreen';

        logger.debug('LOG_BUFFER_TEST', 'debug sample', { requestId, source });
        logger.info('LOG_BUFFER_TEST', 'info sample', { requestId, source });
        logger.warn('LOG_BUFFER_TEST', 'warn sample', { requestId, source });
        logger.error('LOG_BUFFER_TEST', 'error sample', {
            error: new Error('debug log buffer sample'),
            data: { requestId, source },
        });

        setLastAction('Sample logs sent');
        // Native needs a bridge round-trip; web reads synchronously. A short
        // delay lets the native buffer settle before we re-fetch.
        window.setTimeout(refreshLogs, isOnMobileApp ? 250 : 0);
    }, [isOnMobileApp, refreshLogs]);

    const toggleLevel = useCallback((level: AppLogLevel) => {
        setActiveLevels(prev => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }, []);

    const handleCopy = useCallback((value: string) => {
        copyText(value);
        setCopiedAt(Date.now());
    }, []);

    const toggleExpanded = useCallback((key: number) => {
        setExpandedKey(prev => (prev === key ? null : key));
    }, []);

    // Auto-hide the "Copied" hint shortly after a copy.
    useEffect(() => {
        if (copiedAt === null) return;
        const timer = window.setTimeout(() => setCopiedAt(null), 1500);
        return () => window.clearTimeout(timer);
    }, [copiedAt]);

    useOnFetchAppLogBuffer(message => {
        setLogs(message.data.logs ?? []);
        setLimit(requestedLimitRef.current);
        setIsFetchingLogs(false);
        markResponse('Fetch', message.data.size);
    });

    useOnPollAppLogBuffer(message => {
        setLogs(message.data.logs ?? []);
        setIsFetchingLogs(false);
        markResponse('Poll', message.data.size);
    });

    useOnClearAppLogBuffer(message => {
        setLogs([]);
        setLimit(LOG_FETCH_LIMIT);
        requestedLimitRef.current = LOG_FETCH_LIMIT;
        setIsFetchingLogs(false);
        setClearSuccess(message.data.success);
        markResponse('Clear', message.data.size);
    });

    useOnFetchAppLogBufferSize(message => {
        markResponse('Size', message.data.size);
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
        <div className="relative flex h-full min-w-0 max-w-full flex-col overflow-x-hidden bg-background">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-none"
            >
                <div className="flex min-w-0 max-w-full flex-col gap-3 p-4 pb-10">
                    <Section title="Status">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label="Mobile App" value={isOnMobileApp} />
                            <Metric label="Buffer Size" value={bufferSize} />
                            <Metric label="Loaded Logs" value={logs.length} />
                            <Metric label="Shown" value={visibleLogs.length} />
                            <Metric label="Last Action" value={lastAction} />
                            <Metric label="Last Response" value={lastResponseAt} />
                            {isOnMobileApp ? <Metric label="Limit" value={limit} /> : null}
                            <Metric label="Clear Success" value={clearSuccess} />
                        </div>
                        {!isOnMobileApp ? (
                            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                                Showing the in-memory web log buffer, newest first (current session only).
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
                            {isOnMobileApp ? (
                                <ActionButton icon={<Scissors size={15} />} label="Poll" onClick={pollLogs} />
                            ) : null}
                            <ActionButton icon={<Trash2 size={15} />} label="Clear" tone="danger" onClick={clearLogs} />
                        </div>
                    </Section>

                    <Section title="Filter">
                        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-background px-3">
                            <Search size={14} className="shrink-0 text-muted-foreground" />
                            <input
                                type="text"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="Search tag or message"
                                className="min-h-[40px] w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="shrink-0 text-[12px] font-semibold text-muted-foreground"
                                >
                                    Clear
                                </button>
                            ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {LEVELS.map(level => {
                                const active = activeLevels.has(level);
                                return (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => toggleLevel(level)}
                                        className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase ${
                                            active ? levelClassName[level] : 'bg-muted/50 text-muted-foreground'
                                        }`}
                                    >
                                        {level}
                                    </button>
                                );
                            })}
                            {activeLevels.size > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setActiveLevels(new Set())}
                                    className="rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground"
                                >
                                    Reset
                                </button>
                            ) : null}
                        </div>
                    </Section>

                    <Section
                        title={`Logs (${visibleLogs.length}${visibleLogs.length !== logs.length ? ` / ${logs.length}` : ''})`}
                    >
                        {visibleLogs.length === 0 ? (
                            <p className="py-8 text-center text-[13px] text-muted-foreground">
                                {logs.length === 0 ? 'No logs loaded' : 'No logs match the filter'}
                            </p>
                        ) : (
                            <div className="divide-y divide-border">
                                {visibleLogs.map((log, index) => {
                                    const key = keyByLog.get(log) ?? index;
                                    return (
                                        <LogRow
                                            key={key}
                                            log={log}
                                            index={index}
                                            expanded={expandedKey === key}
                                            onToggle={() => toggleExpanded(key)}
                                            onCopy={handleCopy}
                                        />
                                    );
                                })}
                            </div>
                        )}
                        {hasMoreLogs && visibleLogs.length > 0 ? (
                            <div className="border-t border-border py-3 text-center text-[12px] text-muted-foreground">
                                {isFetchingLogs ? 'Loading...' : `Scroll to load ${LOG_FETCH_LIMIT} more`}
                            </div>
                        ) : null}
                    </Section>
                </div>
            </div>

            {copiedAt !== null ? (
                <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-semibold text-background shadow-lg">
                    Copied
                </div>
            ) : null}
        </div>
    );
};
