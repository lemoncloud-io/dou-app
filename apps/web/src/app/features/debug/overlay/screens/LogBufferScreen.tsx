import { ChevronDown, ChevronRight, Copy, RefreshCw, Search, Trash2, Zap } from 'lucide-react';
import { type ReactNode, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isNative, logger, toAppLogInfo } from '@chatic/bridges';
import type { AppLogInfo, AppLogLevel } from '@chatic/app-messages';

import { appBridge } from '../../../../bridge';
import { getLogQueueView } from '../../../../runtime/logging/logQueueView';
import { isLogUploadHeld, isLogUploadHeldByApp, setLogUploadHold } from '../../../../runtime/logging/logUploadSwitch';
import {
    collectLogTags,
    copyText,
    filterLogs,
    formatLogForCopy,
    formatTimestamp,
    hasErrorValue,
    stringifyValue,
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

/**
 * The send-hold lever.
 *
 * Held means the queue is not drained, which is what makes it readable — so the
 * copy has to keep saying that this is a send pause, not an opt-out. Someone who
 * reads it as "stop collecting my logs" would believe a privacy control that
 * isn't one.
 */
const HoldToggle = ({ held, byApp, onToggle }: { held: boolean; byApp: boolean; onToggle: () => void }) => (
    <div className="flex flex-col gap-2">
        <button
            type="button"
            onClick={onToggle}
            disabled={byApp}
            className={`flex min-h-[42px] items-center justify-between gap-3 rounded-[10px] border px-3 text-left text-[13px] font-semibold disabled:opacity-60 ${
                held
                    ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                    : 'border-border bg-background text-foreground'
            }`}
        >
            <span>서버 전송 {held ? '보류 중' : '보류'}</span>
            <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    held ? 'bg-yellow-500/20' : 'bg-muted text-muted-foreground'
                }`}
            >
                {held ? 'ON' : 'OFF'}
            </span>
        </button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
            {byApp
                ? '앱 디버그 메뉴가 보류를 켰습니다 — 끄는 것도 그쪽입니다.'
                : held
                  ? '큐를 비우지 않습니다. 재현한 로그가 큐에 남습니다. 수집은 계속되며, 끄면 다음 전송에 쌓인 것이 나갑니다.'
                  : '평시에는 전송돼 큐가 비어 있는 것이 정상입니다. 수집 거부(기기 opt-out)와는 다른 레버입니다.'}
        </p>
    </div>
);

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
    const [limit, setLimit] = useState(LOG_FETCH_LIMIT);
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [lastAction, setLastAction] = useState('Idle');
    const [lastResponseAt, setLastResponseAt] = useState<string | null>(null);
    const [clearSuccess, setClearSuccess] = useState<boolean | null>(null);

    const [uploadHeld, setUploadHeld] = useState(isLogUploadHeld);
    const heldByApp = useMemo(isLogUploadHeldByApp, []);

    const [activeLevels, setActiveLevels] = useState<Set<AppLogLevel>>(new Set());
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [expandedKey, setExpandedKey] = useState<number | null>(null);
    const [copiedAt, setCopiedAt] = useState<number | null>(null);

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return isNative();
    }, []);

    // Native loads oldest-first in pages; web loads the whole snapshot at once.
    const hasMoreLogs = isOnMobileApp && (queueSize === null || logs.length < queueSize);

    const visibleLogs = useMemo(
        () => filterLogs(logs, { levels: activeLevels, query, tags: activeTags }),
        [logs, activeLevels, query, activeTags]
    );

    /**
     * Tag chips, derived from what is present rather than from the tag
     * constant. A picker listing every tag the app can emit — of which two
     * occurred — is a worse picker, and there is no room for it in the panel.
     */
    const availableTags = useMemo(() => collectLogTags(logs), [logs]);

    const toggleTag = useCallback((tag: string) => {
        setActiveTags(previous => {
            const next = new Set(previous);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    // Each buffer entry is a distinct object even when content is identical
    // (socket retries repeat the same tag/message/timestamp), so rows are keyed
    // by position rather than content — content-based keys collide and break
    // reconciliation on filtering.
    //
    // The key is the entry's rank FROM THE NEWEST end (`length-1-index`), not its
    // raw oldest-first index. Paging (Load more) fetches a larger recent window,
    // which PREPENDS older entries to `logs` and would shift every raw index —
    // changing all keys, forcing React to tear down and rebuild the whole list,
    // which clamps the scroll and drops the expanded row (the "보던 위치가 튄다"
    // jump). Ranking from the newest end keeps already-shown rows' keys stable
    // across paging, so only the new (older) rows mount, appended at the bottom.
    const keyByLog = useMemo(() => new Map(logs.map((log, index) => [log, logs.length - 1 - index])), [logs]);

    const markRequest = useCallback((action: string) => {
        setLastAction(`${action} requested`);
        setLastResponseAt(null);
        setClearSuccess(null);
    }, []);

    const markResponse = useCallback((action: string, size: number) => {
        setLastAction(`${action} received`);
        setQueueSize(size);
        setLastResponseAt(new Date().toLocaleTimeString());
    }, []);

    const fetchLogs = useCallback(
        async (nextLimit: number, action = 'Fetch') => {
            // Plain web: read the running uploader's queue synchronously.
            // Ordering and paging are handled at display time (newest-first), so
            // there is no incremental limit or bridge round-trip here.
            if (!isOnMobileApp) {
                const view = getLogQueueView();
                const entries = view?.snapshot() ?? [];
                setLogs(entries.map(toAppLogInfo));
                setIsFetchingLogs(false);
                markResponse(action, entries.length);
                return;
            }

            const normalizedLimit = Math.max(LOG_FETCH_LIMIT, nextLimit);
            setLimit(normalizedLimit);
            setIsFetchingLogs(true);
            markRequest(action);

            try {
                // `FetchLogUploadQueue` is non-destructive by contract, which is
                // what makes it usable from a viewer at all — the old
                // `PollAppLogBuffer` consumed what it showed.
                const res = await appBridge.fetchLogUploadQueue(normalizedLimit);
                setLogs(res.data?.logs ?? []);
                markResponse(action, res.data?.size ?? 0);
            } catch (error) {
                setLastAction(`${action} failed`);
                logger.warn('LOG_BUFFER', 'fetchLogUploadQueue failed', error);
            } finally {
                setIsFetchingLogs(false);
            }
        },
        [isOnMobileApp, markRequest, markResponse]
    );

    const refreshLogs = useCallback(() => {
        fetchLogs(LOG_FETCH_LIMIT, 'Refresh');
    }, [fetchLogs]);

    const loadMoreLogs = useCallback(() => {
        if (isFetchingLogs || !hasMoreLogs) return;

        const nextLimit = queueSize === null ? limit + LOG_FETCH_LIMIT : Math.min(limit + LOG_FETCH_LIMIT, queueSize);
        fetchLogs(nextLimit, 'Load more');
    }, [queueSize, fetchLogs, hasMoreLogs, isFetchingLogs, limit]);

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

    /**
     * Throws away what is queued.
     *
     * Destructive, and there is no undo: these entries were waiting to be sent,
     * so discarding them means the server never sees them. That is the point
     * during a reproduction — you want a clean slate for the next attempt — which
     * is why the label says 버리기 rather than the old neutral "Clear".
     */
    const discardQueued = useCallback(async () => {
        setExpandedKey(null);

        if (!isOnMobileApp) {
            getLogQueueView()?.clear();
            setLogs([]);
            setClearSuccess(true);
            markResponse('Discard', 0);
            return;
        }

        markRequest('Discard');
        try {
            const res = await appBridge.clearLogUploadQueue();
            setLogs([]);
            setClearSuccess(Boolean(res?.success));
            markResponse('Discard', res.data?.size ?? 0);
        } catch (error) {
            setLastAction('Discard failed');
            logger.warn('LOG_BUFFER', 'clearLogUploadQueue failed', error);
        }
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
        // The debug sample never reaches the queue and so never shows up here —
        // that is the level policy working, not a bug.
        // Hybrid needs a charge to land before the app queue holds these, which
        // is a bridge round-trip away; web queues synchronously.
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

    const toggleUploadHold = useCallback(() => {
        // Written outside the state updater: an updater can be re-invoked, and
        // the uploader reads the stored flag rather than this component's state,
        // so the persist has to be the deliberate step and the render a
        // consequence of it.
        const next = !uploadHeld;
        setLogUploadHold(next);
        setUploadHeld(next);
    }, [uploadHeld]);

    // Auto-hide the "Copied" hint shortly after a copy.
    useEffect(() => {
        if (copiedAt === null) return;
        const timer = window.setTimeout(() => setCopiedAt(null), 1500);
        return () => window.clearTimeout(timer);
    }, [copiedAt]);

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
                            <Metric label="Queue Size" value={queueSize} />
                            <Metric label="Loaded Logs" value={logs.length} />
                            <Metric label="Shown" value={visibleLogs.length} />
                            <Metric label="Last Action" value={lastAction} />
                            <Metric label="Last Response" value={lastResponseAt} />
                            {isOnMobileApp ? <Metric label="Limit" value={limit} /> : null}
                            <Metric label="Discarded" value={clearSuccess} />
                        </div>
                        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                            {isOnMobileApp
                                ? '앱의 미전송 큐입니다 (비-debug만). debug는 콘솔에만 남습니다.'
                                : '이 탭의 미전송 큐입니다 (비-debug만). debug는 콘솔에만 남습니다.'}
                        </p>
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
                            <ActionButton
                                icon={<Trash2 size={15} />}
                                label="버리기"
                                tone="danger"
                                onClick={discardQueued}
                            />
                        </div>
                    </Section>

                    <Section title="Upload">
                        <HoldToggle held={uploadHeld} byApp={heldByApp} onToggle={toggleUploadHold} />
                    </Section>

                    <Section title="Filter">
                        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-background px-3">
                            <Search size={14} className="shrink-0 text-muted-foreground" />
                            <input
                                type="text"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder={'검색 · -제외 · tag:NET · "따옴표 구"'}
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

                        {availableTags.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {availableTags.map(({ tag, count }) => {
                                    const active = activeTags.has(tag);
                                    return (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTag(tag)}
                                            className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
                                                active
                                                    ? 'bg-primary text-primary-foreground'
                                                    : 'bg-muted/50 text-muted-foreground'
                                            }`}
                                        >
                                            {tag}
                                            <span className="ml-1 opacity-60">{count}</span>
                                        </button>
                                    );
                                })}
                                {activeTags.size > 0 ? (
                                    <button
                                        type="button"
                                        onClick={() => setActiveTags(new Set())}
                                        className="rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground"
                                    >
                                        Reset
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </Section>

                    <Section
                        title={`Logs (${visibleLogs.length}${visibleLogs.length !== logs.length ? ` / ${logs.length}` : ''})`}
                    >
                        {visibleLogs.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-[13px] text-muted-foreground">
                                    {logs.length > 0
                                        ? 'No logs match the filter'
                                        : uploadHeld
                                          ? '보류 중이지만 큐가 비어 있습니다 — 아직 전송할 로그가 없습니다.'
                                          : '큐가 비어 있습니다.'}
                                </p>
                                {/* The empty view is the expected state while sending is on
                                    — the uploader drains what it ships. Saying so here is
                                    the only thing standing between this screen and a bug
                                    report (S11). */}
                                {logs.length === 0 && !uploadHeld ? (
                                    <p className="mx-auto mt-2 max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">
                                        전송이 켜져 있으면 비어 있는 것이 정상입니다. 로그를 붙잡아 보려면 위의 전송
                                        보류를 켜세요.
                                    </p>
                                ) : null}
                            </div>
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
