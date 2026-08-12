/**
 * `components/report-logs/ReportDetailDrawer.tsx`
 * - Right-side drawer showing a report's full payload in sections.
 *
 * Payload schemas differ between error and issue reports (and `device` shape
 * differs too), so structured sections render generic key/value pairs without
 * assuming fixed fields, and a raw-JSON block always backs them up.
 */
import { useEffect, useState } from 'react';

import { X } from 'lucide-react';

import type { ReportLogRow, ReportPayload } from '../lib/parseReportLog';
import { mapMatchesStack, readBundleNames, resolveStack } from '../lib/resolveStack';
import { buildTraceBlob, composeStackText } from '../lib/traceBlob';

interface ReportDetailDrawerProps {
    row: ReportLogRow | null;
    onClose: () => void;
    /** Jump to socket-lab Observe for the report's user (when a uid is present). */
    onObserve?: (uid: string) => void;
}

const TYPE_BADGE: Record<ReportLogRow['type'], string> = {
    error: 'bg-destructive text-destructive-foreground',
    issue: 'bg-primary text-primary-foreground',
    unknown: 'bg-muted text-muted-foreground',
};

const stringify = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

/**
 * Replace base64 image payloads with a short marker before rendering raw JSON.
 * An attached screenshot is ~100 KB of data URL; a handful of them turn the raw
 * block into megabytes of text that no one reads and the browser has to lay out.
 * The images themselves are shown properly by `ImagesSection`.
 */
const redactDataUrls = (text: string): string =>
    text.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=\\]+/g, match => `data:image…(${match.length} chars, 생략)`);

/** Render an object as a key/value grid; skips nullish values. Returns null when empty. */
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

/**
 * A failed request, read in the order it happened: the endpoint, what we sent,
 * then what came back. The generic key/value renderer would sort these by
 * whatever order the payload happened to carry, which puts the response body
 * next to the URL and buries the request — and "what did we send" is usually
 * the question that decides whether it is a client or a server bug.
 */
const HttpSection = ({ http }: { http?: ReportPayload['http'] }) => {
    if (!http) return null;

    const request = { url: http.url, method: http.method, params: http.params, requestBody: http.requestBody };
    const response = {
        status: http.status,
        statusText: http.statusText,
        code: http.code,
        // Ahead of the raw body: this is the server's stated reason, which is
        // what the reader is looking for inside `responseData` anyway.
        reason: http.reason,
        responseData: http.responseData,
    };

    return (
        <>
            <KeyValueSection title="HTTP · Request" data={request} />
            <KeyValueSection title="HTTP · Response" data={response} />
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

const LEVEL_COLOR: Record<string, string> = {
    error: 'text-destructive',
    warn: 'text-yellow-500',
    info: 'text-foreground',
    debug: 'text-muted-foreground',
};

/**
 * Render the issue report's attached recent logs (fixed schema:
 * level/tag/message/timestamp/data/error) as a readable list rather than raw JSON.
 */
const LogsSection = ({ logs }: { logs: unknown[] }) => {
    const entries = logs.filter((l): l is LogEntry => typeof l === 'object' && l !== null);
    if (entries.length === 0) return null;
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Logs ({entries.length})
            </h3>
            <ul className="flex max-h-80 flex-col gap-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                {entries.map((log, i) => (
                    <li key={i} className="border-b border-border/40 pb-1 last:border-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span
                                className={`font-semibold uppercase ${LEVEL_COLOR[log.level ?? ''] ?? 'text-foreground'}`}
                            >
                                {log.level ?? '-'}
                            </span>
                            {log.tag && <span className="text-muted-foreground">[{log.tag}]</span>}
                            {log.timestamp && (
                                <span className="text-muted-foreground">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
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

/**
 * Screenshots the reporter attached, as a thumbnail grid. Each opens full size in a
 * new tab — base64 data URLs can be megabytes, so rendering them inline at full
 * resolution would stall the drawer.
 */
const ImagesSection = ({ images }: { images: string[] }) => (
    <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attachments ({images.length})
        </h3>
        <ul className="flex flex-wrap gap-2">
            {images.map((src, i) => (
                <li key={i}>
                    <a
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        title={`첨부 ${i + 1} — 새 탭에서 원본 열기`}
                        className="block"
                    >
                        <img
                            src={src}
                            alt={`첨부 ${i + 1}`}
                            className="size-24 rounded-md border border-border object-cover transition-opacity hover:opacity-80"
                        />
                    </a>
                </li>
            ))}
        </ul>
    </section>
);

/** Render a multiline text block (message/stack); returns null when empty. */
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

/**
 * Stack view with two ways out of a minified trace.
 *
 * "IDE로 추적" copies the stack with the header `yarn trace` needs to fetch the
 * build's map itself and print repo-relative frames — the whole trace lands in
 * the editor, which is where it gets read anyway. "소스맵 선택" stays for a look
 * without leaving the browser: maps are not deployed (serving them would
 * publish the sources), so the operator supplies one from the build's
 * `sourcemaps-*` CI artifact and it is read locally, never uploaded.
 *
 * Either way the bundle names are shown so the right artifact is identifiable,
 * and a map that does not belong is called out rather than silently resolving
 * to plausible wrong lines.
 */
const StackSection = ({ row }: { row: ReportLogRow }) => {
    const [resolved, setResolved] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
    }, [copied]);

    // Stack + `Caused by:` chain as one block: the cause frames are usually the
    // ones worth reading, and composing first means one symbolication pass
    // resolves them all.
    const stack = composeStackText(row.payload);
    if (!stack) return null;

    const bundles = readBundleNames(stack);

    const onCopyForIde = async () => {
        try {
            await navigator.clipboard.writeText(buildTraceBlob(row, stack));
            setNotice(null);
            setCopied(true);
        } catch {
            setNotice('클립보드에 복사하지 못했습니다 — 스택을 직접 선택해 복사하세요.');
        }
    };

    const onPickMap = async (file?: File) => {
        if (!file) return;
        setNotice(null);
        try {
            const map = JSON.parse(await file.text());
            // A map only speaks for its own bundle. Pin it to that one when the
            // trace spans several, so the others stay minified instead of
            // resolving against the wrong file.
            const named = file.name.replace(/\.map$/, '');
            const out = resolveStack(map, stack, bundles.length > 1 && bundles.includes(named) ? named : undefined);
            setResolved(out);
            if (out === stack) setNotice('이 맵으로는 어떤 프레임도 풀리지 않았습니다 — 다른 빌드의 맵일 수 있습니다.');
            else if (!mapMatchesStack(file.name, stack)) {
                setNotice(`주의: ${file.name}은 이 스택의 번들(${bundles.join(', ')})과 이름이 다릅니다.`);
            }
        } catch {
            setNotice('소스맵을 읽지 못했습니다 (.map 파일이 맞는지 확인하세요).');
        }
    };

    return (
        <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stack</h3>
                {bundles.length > 0 && (
                    <span className="font-mono text-[11px] text-muted-foreground">{bundles.join(', ')}</span>
                )}
                <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted"
                    title="복사한 뒤 리포 루트에서 `yarn trace`를 실행하면 원본 파일·줄로 풀어 출력합니다."
                    onClick={() => void onCopyForIde()}
                >
                    {copied ? '복사됨 — yarn trace' : 'IDE로 추적'}
                </button>
                <label className="cursor-pointer rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted">
                    소스맵 선택
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
                        원본 보기
                    </button>
                )}
            </div>
            {notice && <p className="text-[11px] text-destructive">{notice}</p>}
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {resolved ?? stack}
            </pre>
        </section>
    );
};

export const ReportDetailDrawer = ({ row, onClose, onObserve }: ReportDetailDrawerProps) => {
    if (!row) return null;
    const p = row.payload;
    const uid = row.userId;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden />
            {/* Panel */}
            <aside className="fixed inset-y-0 right-0 z-50 flex w-[min(92vw,32rem)] flex-col border-l border-border bg-card shadow-xl">
                <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <span
                                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${TYPE_BADGE[row.type]}`}
                            >
                                {row.type}
                            </span>
                            {row.app && <span className="text-xs text-muted-foreground">{row.app}</span>}
                            {row.env && <span className="text-xs text-muted-foreground">· {row.env}</span>}
                        </div>
                        <h2 className="break-words text-sm font-semibold text-foreground">{row.title}</h2>
                        {row.createdAt && (
                            <time className="text-xs text-muted-foreground">
                                {new Date(row.createdAt).toLocaleString()}
                            </time>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {uid && onObserve && (
                            <button
                                type="button"
                                onClick={() => onObserve(uid)}
                                className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                title={`socket-lab에서 유저 ${uid} 관측`}
                            >
                                관측
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => navigator.clipboard?.writeText(stringify(row.raw))}
                            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            복사
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </header>

                <div className="flex flex-1 flex-col gap-5 overflow-auto p-4">
                    {row.parseError && (
                        <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            payload를 파싱하지 못했습니다. 아래 raw 데이터를 확인하세요.
                        </p>
                    )}

                    {/* Outside the `p &&` block: attachments live in the record's meta, not the
                        payload, so they are still viewable when payload parsing failed. */}
                    {row.images && row.images.length > 0 && <ImagesSection images={row.images} />}

                    {p && (
                        <>
                            <KeyValueSection
                                title="Summary"
                                data={{ url: p.url, timestamp: p.timestamp, userAgent: p.userAgent, path: p.path }}
                            />
                            <TextSection title="Message" text={p.message} />
                            <StackSection row={row} />
                            <TextSection title="Component Stack" text={p.componentStack} />
                            <KeyValueSection title="Location" data={p.location} />
                            <HttpSection http={p.http} />
                            <KeyValueSection title="User" data={p.user} />
                            <KeyValueSection title="Cloud" data={p.cloud} />
                            <KeyValueSection title="Device" data={p.device} />
                            <KeyValueSection title="Version" data={p.version} />
                            <KeyValueSection
                                title="Network"
                                data={{ ...(p.network ?? {}), viewport: p.viewport && stringify(p.viewport) }}
                            />
                            {Array.isArray(p.logs) && p.logs.length > 0 && <LogsSection logs={p.logs} />}
                        </>
                    )}

                    <TextSection title="Raw" text={redactDataUrls(stringify(row.raw))} />
                </div>
            </aside>
        </>
    );
};
