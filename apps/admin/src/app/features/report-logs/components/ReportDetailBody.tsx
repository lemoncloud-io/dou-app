import { useEffect, useState } from 'react';

import { useT } from '../../../i18n';
import { levelTextClass } from '../lib/badgeClass';
import type { ReportLogRow, ReportPayload } from '../lib/parseReportLog';
import { mapMatchesStack, readBundleNames, resolveStack } from '../lib/resolveStack';
import { formatClock } from '../lib/timeFormat';
import { buildTraceBlob, composeStackText } from '../lib/traceBlob';

const stringify = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const redactDataUrls = (text: string): string =>
    text.replace(
        /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\\]+/g,
        match => `data:image…(${match.length} chars, omitted)`
    );

const KeyValueSection = ({ title, data }: { title: string; data?: Record<string, unknown> | null }) => {
    if (!data || typeof data !== 'object') return null;
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return null;
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
                {entries.map(([k, v]) => (
                    <div key={k} className="contents">
                        <dt className="truncate text-muted-foreground">{k}</dt>
                        <dd className="whitespace-pre-wrap break-words font-mono text-xs text-foreground">
                            {typeof v === 'object' ? stringify(v) : String(v)}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
};

const HttpSection = ({ http }: { http?: ReportPayload['http'] }) => {
    const { t } = useT('allLogs');
    if (!http) return null;

    const request = { url: http.url, method: http.method, params: http.params, requestBody: http.requestBody };
    const response = {
        status: http.status,
        statusText: http.statusText,
        code: http.code,
        reason: http.reason,
        responseData: http.responseData,
    };

    return (
        <>
            <KeyValueSection title={t('body.httpRequest')} data={request} />
            <KeyValueSection title={t('body.httpResponse')} data={response} />
        </>
    );
};

interface LogEntry {
    level?: string;
    tag?: string;
    message?: string;
    timestamp?: number;
    data?: string;
    error?: string;
}

const LogsSection = ({ logs }: { logs: unknown[] }) => {
    const { t, lng } = useT('allLogs');
    const entries = logs.filter((l): l is LogEntry => typeof l === 'object' && l !== null);
    if (entries.length === 0) return null;
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('body.recentLogs', { n: entries.length })}
            </h3>
            <ul className="flex max-h-80 flex-col gap-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                {entries.map((log, i) => (
                    <li key={i} className="border-b border-border/40 pb-1 last:border-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`font-semibold uppercase ${levelTextClass(log.level)}`}>
                                {log.level ?? '-'}
                            </span>
                            {log.tag && <span className="text-muted-foreground">[{log.tag}]</span>}
                            {log.timestamp && (
                                <span className="text-muted-foreground">{formatClock(log.timestamp, lng)}</span>
                            )}
                        </div>
                        {log.message && (
                            <div className="whitespace-pre-wrap break-words text-foreground">{log.message}</div>
                        )}
                        {log.data && (
                            <div className="whitespace-pre-wrap break-words text-muted-foreground">{log.data}</div>
                        )}
                        {log.error && (
                            <div className="whitespace-pre-wrap break-words text-destructive">{log.error}</div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
};

const LogEntryDetailSection = ({ row }: { row: ReportLogRow }) => {
    const { t } = useT('allLogs');
    const rawObj = row.raw && typeof row.raw === 'object' ? (row.raw as Record<string, unknown>) : undefined;
    const context = rawObj
        ? {
              runId: row.runId,
              uid: row.userId,
              sid: rawObj.sid,
              cid: rawObj.cid,
              appVersion: rawObj.appVersion,
              webVersion: rawObj.webVersion,
              route: rawObj.route,
              os: rawObj.os,
              osVersion: rawObj.osVersion,
              model: rawObj.model,
              error: rawObj.error,
          }
        : { runId: row.runId, uid: row.userId };

    return (
        <>
            <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('body.logEntry')}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`font-semibold uppercase ${levelTextClass(row.level)}`}>{row.level ?? '-'}</span>
                    {row.tag && <span className="text-muted-foreground">[{row.tag}]</span>}
                    {row.source && <span className="text-muted-foreground">· {row.source}</span>}
                </div>
                {row.message && (
                    <p className="whitespace-pre-wrap break-words text-sm text-foreground">{row.message}</p>
                )}
            </section>
            {row.logData !== undefined && typeof row.logData === 'object' && row.logData !== null ? (
                <KeyValueSection title={t('body.data')} data={row.logData as Record<string, unknown>} />
            ) : (
                <TextSection title={t('body.data')} text={row.logDataRaw} />
            )}
            <KeyValueSection title={t('body.context')} data={context} />
        </>
    );
};

const ImagesSection = ({ images }: { images: string[] }) => {
    const { t } = useT('allLogs');
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('body.attachments', { n: images.length })}
            </h3>
            <ul className="flex flex-wrap gap-2">
                {images.map((src, i) => (
                    <li key={i}>
                        <a
                            href={src}
                            target="_blank"
                            rel="noreferrer"
                            title={t('body.attachmentTitle', { i: i + 1 })}
                            className="block"
                        >
                            <img
                                src={src}
                                alt={t('body.attachmentAlt', { i: i + 1 })}
                                className="size-24 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
                            />
                        </a>
                    </li>
                ))}
            </ul>
        </section>
    );
};

const TextSection = ({ title, text }: { title: string; text?: string }) => {
    if (!text) return null;
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {text}
            </pre>
        </section>
    );
};

const StackSection = ({ row }: { row: ReportLogRow }) => {
    const { t } = useT('allLogs');
    const [resolved, setResolved] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ key: string; values?: Record<string, string> } | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    const stack = composeStackText(row.payload);
    if (!stack) return null;

    const bundles = readBundleNames(stack);

    const onCopyForIde = async () => {
        try {
            await navigator.clipboard.writeText(buildTraceBlob(row, stack));
            setNotice(null);
            setCopied(true);
        } catch {
            setNotice({ key: 'body.copyFailed' });
        }
    };

    const onPickMap = async (file?: File) => {
        if (!file) return;
        setNotice(null);
        try {
            const map = JSON.parse(await file.text());
            const named = file.name.replace(/\.map$/, '');
            const out = resolveStack(map, stack, bundles.length > 1 && bundles.includes(named) ? named : undefined);
            setResolved(out);
            if (out === stack) setNotice({ key: 'body.noFrames' });
            else if (!mapMatchesStack(file.name, stack)) {
                setNotice({ key: 'body.mapMismatch', values: { file: file.name, bundles: bundles.join(', ') } });
            }
        } catch {
            setNotice({ key: 'body.mapReadFailed' });
        }
    };

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('body.stack')}
                </h3>
                {bundles.length > 0 && (
                    <span className="font-mono text-[11px] text-muted-foreground">{bundles.join(', ')}</span>
                )}
                <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                    title={t('body.traceTitle')}
                    onClick={() => void onCopyForIde()}
                >
                    {copied ? t('body.traceCopied') : t('body.traceToIde')}
                </button>
                <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
                    {t('body.chooseMap')}
                    <input
                        type="file"
                        accept=".map,application/json"
                        className="hidden"
                        onChange={event => void onPickMap(event.target.files?.[0])}
                    />
                </label>
                {resolved && (
                    <button
                        type="button"
                        className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                        onClick={() => setResolved(null)}
                    >
                        {t('body.showOriginal')}
                    </button>
                )}
            </div>
            {notice && <p className="text-[11px] text-destructive">{t(notice.key, notice.values)}</p>}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {resolved ?? stack}
            </pre>
        </section>
    );
};

interface ReportDetailBodyProps {
    row: ReportLogRow;
}

export const ReportDetailBody = ({ row }: ReportDetailBodyProps) => {
    const { t } = useT('allLogs');
    const p = row.payload;

    return (
        <>
            {row.parseError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {t('body.parseError')}
                </p>
            )}

            {row.images && row.images.length > 0 && <ImagesSection images={row.images} />}

            {row.type === 'log-entry' ? (
                <LogEntryDetailSection row={row} />
            ) : (
                p && (
                    <>
                        <KeyValueSection
                            title={t('body.summary')}
                            data={{ url: p.url, timestamp: p.timestamp, userAgent: p.userAgent, path: p.path }}
                        />
                        <TextSection title={t('body.message')} text={p.message} />
                        <StackSection row={row} />
                        <TextSection title={t('body.componentStack')} text={p.componentStack} />
                        <KeyValueSection title={t('body.location')} data={p.location} />
                        <HttpSection http={p.http} />
                        <KeyValueSection title={t('body.user')} data={p.user} />
                        <KeyValueSection title={t('body.cloud')} data={p.cloud} />
                        <KeyValueSection title={t('body.device')} data={p.device} />
                        <KeyValueSection title={t('body.version')} data={p.version} />
                        <KeyValueSection
                            title={t('body.network')}
                            data={{ ...(p.network ?? {}), viewport: p.viewport && stringify(p.viewport) }}
                        />
                        {Array.isArray(p.logs) && p.logs.length > 0 && <LogsSection logs={p.logs} />}
                    </>
                )
            )}

            <TextSection title={t('body.raw')} text={redactDataUrls(stringify(row.raw))} />
        </>
    );
};

export const rawRecordText = (row: ReportLogRow): string => redactDataUrls(stringify(row.raw));
