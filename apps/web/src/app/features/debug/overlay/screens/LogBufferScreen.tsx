import { ChevronDown, ChevronRight, Copy, RefreshCw, Search, Trash2, Zap } from 'lucide-react';
import { type ReactNode, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isNative, logger, toAppLogInfo } from '@chatic/bridges';
import type { AppLogInfo, AppLogLevel } from '@chatic/bridge-messages';

import { appBridge } from '../../../../bridge';
import { getLogQueueView } from '../../../../runtime/logging/logQueueView';
import { isLogUploadHeld, isLogUploadHeldByApp, setLogUploadHold } from '../../../../runtime/logging/logUploadSwitch';
import { useCopyFeedback } from '../../hooks/useCopyFeedback';
import { useLogBufferScreenStrings } from '../../i18n/screens/LogBufferScreen';
import {
    collectLogTags,
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

const HoldToggle = ({ held, byApp, onToggle }: { held: boolean; byApp: boolean; onToggle: () => void }) => {
    const t = useLogBufferScreenStrings();
    return (
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
                <span>{held ? t.upload.holding : t.upload.hold}</span>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        held ? 'bg-yellow-500/20' : 'bg-muted text-muted-foreground'
                    }`}
                >
                    {held ? t.upload.on : t.upload.off}
                </span>
            </button>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
                {byApp ? t.upload.heldByApp : held ? t.upload.heldNote : t.upload.notHeldNote}
            </p>
        </div>
    );
};

const LogCopyButton = ({ label, value, onCopy }: { label: string; value: string; onCopy: (value: string) => void }) => (
    <button
        type="button"
        onClick={event => {
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
    const t = useLogBufferScreenStrings();
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
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                    {t.logs.data}
                                </span>
                                <LogCopyButton label={t.logs.copy} value={data} onCopy={onCopy} />
                            </div>
                            <pre className="max-h-[240px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-muted p-2 font-mono text-[11px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                                {data}
                            </pre>
                        </div>
                    ) : null}
                    {error ? (
                        <div className="min-w-0">
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide text-destructive">
                                    {t.logs.error}
                                </span>
                                <LogCopyButton label={t.logs.copy} value={error} onCopy={onCopy} />
                            </div>
                            <pre className="max-h-[240px] max-w-full overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-destructive/10 p-2 font-mono text-[11px] leading-relaxed text-destructive [overflow-wrap:anywhere]">
                                {error}
                            </pre>
                        </div>
                    ) : null}
                    <div className="flex justify-end">
                        <LogCopyButton label={t.logs.copyEntry} value={formatLogForCopy(log)} onCopy={onCopy} />
                    </div>
                </div>
            ) : null}
        </article>
    );
};

export const LogBufferScreen = () => {
    const t = useLogBufferScreenStrings();
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [limit, setLimit] = useState(LOG_FETCH_LIMIT);
    const [logs, setLogs] = useState<AppLogInfo[]>([]);
    const [queueSize, setQueueSize] = useState<number | null>(null);
    const [isFetchingLogs, setIsFetchingLogs] = useState(false);
    const [lastAction, setLastAction] = useState(t.actions.idle);
    const [lastResponseAt, setLastResponseAt] = useState<string | null>(null);
    const [clearSuccess, setClearSuccess] = useState<boolean | null>(null);

    const [uploadHeld, setUploadHeld] = useState(isLogUploadHeld);
    const [flushState, setFlushState] = useState<'idle' | 'sending' | 'sent' | 'unavailable'>('idle');
    const heldByApp = useMemo(isLogUploadHeldByApp, []);

    const [activeLevels, setActiveLevels] = useState<Set<AppLogLevel>>(new Set());
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [expandedKey, setExpandedKey] = useState<number | null>(null);
    const { state: copyState, copy } = useCopyFeedback();

    const isOnMobileApp = useMemo(() => {
        if (typeof window === 'undefined') return false;
        return isNative();
    }, []);

    const hasMoreLogs = isOnMobileApp && (queueSize === null || logs.length < queueSize);

    const visibleLogs = useMemo(
        () => filterLogs(logs, { levels: activeLevels, query, tags: activeTags }),
        [logs, activeLevels, query, activeTags]
    );

    const availableTags = useMemo(() => collectLogTags(logs), [logs]);

    const toggleTag = useCallback((tag: string) => {
        setActiveTags(previous => {
            const next = new Set(previous);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            return next;
        });
    }, []);

    const keyByLog = useMemo(() => new Map(logs.map((log, index) => [log, logs.length - 1 - index])), [logs]);

    const markRequest = useCallback(
        (action: string) => {
            setLastAction(t.requested(action));
            setLastResponseAt(null);
            setClearSuccess(null);
        },
        [t]
    );

    const markResponse = useCallback(
        (action: string, size: number) => {
            setLastAction(t.received(action));
            setQueueSize(size);
            setLastResponseAt(new Date().toLocaleTimeString());
        },
        [t]
    );

    const fetchLogs = useCallback(
        async (nextLimit: number, action = t.actions.fetch) => {
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
                const res = await appBridge.fetchLogUploadQueue(normalizedLimit);
                setLogs(res.data?.logs ?? []);
                markResponse(action, res.data?.size ?? 0);
            } catch (error) {
                setLastAction(t.failed(action));
                logger.warn('LOG_BUFFER', 'fetchLogUploadQueue failed', error);
            } finally {
                setIsFetchingLogs(false);
            }
        },
        [isOnMobileApp, markRequest, markResponse, t]
    );

    const refreshLogs = useCallback(() => {
        fetchLogs(LOG_FETCH_LIMIT, t.actions.refresh);
    }, [fetchLogs, t]);

    const loadMoreLogs = useCallback(() => {
        if (isFetchingLogs || !hasMoreLogs) return;

        const nextLimit = queueSize === null ? limit + LOG_FETCH_LIMIT : Math.min(limit + LOG_FETCH_LIMIT, queueSize);
        fetchLogs(nextLimit, t.actions.loadMore);
    }, [queueSize, fetchLogs, hasMoreLogs, isFetchingLogs, limit, t]);

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

    const discardQueued = useCallback(async () => {
        setExpandedKey(null);

        if (!isOnMobileApp) {
            getLogQueueView()?.clear();
            setLogs([]);
            setClearSuccess(true);
            markResponse(t.actions.discard, 0);
            return;
        }

        markRequest(t.actions.discard);
        try {
            const res = await appBridge.clearLogUploadQueue();
            setLogs([]);
            setClearSuccess(Boolean(res?.success));
            markResponse(t.actions.discard, res.data?.size ?? 0);
        } catch (error) {
            setLastAction(t.failed(t.actions.discard));
            logger.warn('LOG_BUFFER', 'clearLogUploadQueue failed', error);
        }
    }, [isOnMobileApp, markRequest, markResponse, t]);

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

        setLastAction(t.sampleLogsSent);
        window.setTimeout(refreshLogs, isOnMobileApp ? 250 : 0);
    }, [isOnMobileApp, refreshLogs, t]);

    const toggleLevel = useCallback((level: AppLogLevel) => {
        setActiveLevels(prev => {
            const next = new Set(prev);
            if (next.has(level)) next.delete(level);
            else next.add(level);
            return next;
        });
    }, []);

    const handleCopy = useCallback((value: string) => void copy(value), [copy]);

    const toggleExpanded = useCallback((key: number) => {
        setExpandedKey(prev => (prev === key ? null : key));
    }, []);

    const toggleUploadHold = useCallback(() => {
        const next = !uploadHeld;
        setLogUploadHold(next);
        setUploadHeld(next);
    }, [uploadHeld]);

    const flushNow = useCallback(async () => {
        const view = getLogQueueView();
        if (!view) return setFlushState('unavailable');
        setFlushState('sending');
        try {
            await view.flush();
            setFlushState('sent');
        } catch (error) {
            logger.warn('LOG_BUFFER', 'flush failed', error);
            setFlushState('idle');
            setLastAction(t.upload.flushFailed);
        }
    }, [t]);

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
                    <Section title={t.status.title}>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Metric label={t.status.mobileApp} value={isOnMobileApp} />
                            <Metric label={t.status.queueSize} value={queueSize} />
                            <Metric label={t.status.loadedLogs} value={logs.length} />
                            <Metric label={t.status.shown} value={visibleLogs.length} />
                            <Metric label={t.status.lastAction} value={lastAction} />
                            <Metric label={t.status.lastResponse} value={lastResponseAt} />
                            {isOnMobileApp ? <Metric label={t.status.limit} value={limit} /> : null}
                            <Metric label={t.status.discarded} value={clearSuccess} />
                        </div>
                        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                            {isOnMobileApp ? t.status.queueNoteApp : t.status.queueNoteWeb}
                        </p>
                    </Section>

                    <Section title={t.controls.title}>
                        <div className="grid grid-cols-2 gap-2">
                            <ActionButton
                                icon={<Zap size={15} />}
                                label={t.controls.sample}
                                tone="primary"
                                onClick={generateSampleLogs}
                            />
                            <ActionButton
                                icon={<RefreshCw size={15} />}
                                label={t.controls.refresh}
                                onClick={refreshLogs}
                            />
                            <ActionButton
                                icon={<Trash2 size={15} />}
                                label={t.controls.discard}
                                tone="danger"
                                onClick={discardQueued}
                            />
                        </div>
                    </Section>

                    <Section title={t.upload.title}>
                        <HoldToggle held={uploadHeld} byApp={heldByApp} onToggle={toggleUploadHold} />
                        <div className="flex items-center gap-2 pt-1">
                            <button
                                type="button"
                                disabled={flushState === 'sending'}
                                onClick={() => void flushNow()}
                                className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                            >
                                {t.upload.sendNow}
                            </button>
                            <span className="text-xs text-muted-foreground">
                                {flushState === 'sending' && t.upload.sending}
                                {flushState === 'sent' && t.upload.sent}
                                {flushState === 'unavailable' && t.upload.unavailable}
                                {uploadHeld && flushState === 'idle' && t.upload.onHold}
                            </span>
                        </div>
                    </Section>

                    <Section title={t.filter.title}>
                        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-background px-3">
                            <Search size={14} className="shrink-0 text-muted-foreground" />
                            <input
                                type="text"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder={t.filter.placeholder}
                                className="min-h-[40px] w-full min-w-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                            />
                            {query ? (
                                <button
                                    type="button"
                                    onClick={() => setQuery('')}
                                    className="shrink-0 text-[12px] font-semibold text-muted-foreground"
                                >
                                    {t.filter.clear}
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
                                    {t.filter.reset}
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
                                        {t.filter.reset}
                                    </button>
                                ) : null}
                            </div>
                        ) : null}
                    </Section>

                    <Section title={t.logs.title(visibleLogs.length, logs.length)}>
                        {visibleLogs.length === 0 ? (
                            <div className="py-8 text-center">
                                <p className="text-[13px] text-muted-foreground">
                                    {logs.length > 0 ? t.logs.noMatch : uploadHeld ? t.logs.heldEmpty : t.logs.empty}
                                </p>
                                {logs.length === 0 && !uploadHeld ? (
                                    <p className="mx-auto mt-2 max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">
                                        {t.logs.emptyHint}
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
                                {isFetchingLogs ? t.logs.loading : t.logs.loadMore(LOG_FETCH_LIMIT)}
                            </div>
                        ) : null}
                    </Section>
                </div>
            </div>

            {copyState !== 'idle' ? (
                <div
                    className={`pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[12px] font-semibold shadow-lg ${
                        copyState === 'failed'
                            ? 'bg-destructive text-destructive-foreground'
                            : 'bg-foreground text-background'
                    }`}
                >
                    {copyState === 'failed' ? t.copyFailed : t.copied}
                </div>
            ) : null}
        </div>
    );
};
