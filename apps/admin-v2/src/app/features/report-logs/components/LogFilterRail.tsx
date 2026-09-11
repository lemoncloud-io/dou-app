/**
 * `components/report-logs/LogFilterRail.tsx`
 * - The left column: every filter, grouped by whether the server or the browser applies it.
 *
 * The grouping is the whole point of the layout. A server axis re-queries the entire
 * dataset and restarts the corpus walk; a client axis only re-derives from rows already in
 * memory. Those are different operations with different reach and different cost, and an
 * operator reading a count needs to know which kind produced it — so the rail states it
 * per group instead of leaving the two indistinguishable, as the old single filter bar did.
 *
 * The text field holds its own state and settles into the URL on a delay, matching
 * `MembershipsPage`. Without it every keystroke writes a URL and re-runs a filter plus a
 * sort over the whole corpus — up to 5,000 rows synchronously, per character.
 */
import { useEffect, useRef, useState } from 'react';

import { useDebounce } from '@chatic/shared';

import type { ReportKind, ReportStage } from '../api/reportLogApi';
import type { ServerAxes } from '../hooks/use-log-console-state';
import type { FacetKey, Facets } from '../lib/logFacets';
import type { FacetSelection } from '../lib/logFacets';

interface LogFilterRailProps {
    server: ServerAxes;
    onServerAxis: (patch: Partial<Record<keyof ServerAxes, string>>) => void;
    query: string;
    onQuery: (value: string) => void;
    facets: Facets;
    selection: FacetSelection;
    onFacet: (key: FacetKey, value: string) => void;
    onClearClient: () => void;
    /** Rows the client-side filters are working over, for the group's caption. */
    corpusSize: number;
}

const KINDS: Array<{ value: ReportKind; label: string }> = [
    { value: 'all', label: '전체' },
    { value: 'log-entry', label: '로그' },
    { value: 'issue', label: '제보' },
    { value: 'error', label: '구 에러 리포트' },
];

const LEVELS = [
    { value: '', label: '전체' },
    { value: 'error', label: 'error' },
    { value: 'warn', label: 'warn' },
    { value: 'info', label: 'info' },
    { value: 'debug', label: 'debug' },
];

/** Facets worth a dropdown, in the order an operator reaches for them. */
const CLIENT_FACETS: Array<{ key: FacetKey; label: string }> = [
    { key: 'tag', label: '태그' },
    { key: 'appVersion', label: '앱 버전' },
    { key: 'webVersion', label: '웹 버전' },
    { key: 'route', label: '화면' },
    { key: 'source', label: '출처' },
    { key: 'app', label: 'App' },
    { key: 'env', label: '환경' },
    { key: 'os', label: 'OS' },
];

const fieldClass =
    'w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring';

const Group = ({
    title,
    caption,
    children,
    action,
}: {
    title: string;
    caption: string;
    children: React.ReactNode;
    action?: React.ReactNode;
}) => (
    <section className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h2>
            {action}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{caption}</p>
        {children}
    </section>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
        {label}
        {children}
    </label>
);

/** Delay before a keystroke reaches the URL. Same value memberships settled on. */
const QUERY_SETTLE_MS = 300;

export const LogFilterRail = ({
    server,
    onServerAxis,
    query,
    onQuery,
    facets,
    selection,
    onFacet,
    onClearClient,
    corpusSize,
}: LogFilterRailProps) => {
    // Local draft so typing stays instant; `query` remains the source of truth so a
    // shared link or a reset still lands in the box.
    const [draft, setDraft] = useState(query);
    useEffect(() => setDraft(query), [query]);
    const settled = useDebounce(draft, QUERY_SETTLE_MS);
    // `onQuery` is intentionally not a dependency: its identity changes with the router's
    // params, which would re-fire this with a `settled` value already written.
    const push = useRef(onQuery);
    push.current = onQuery;
    useEffect(() => {
        if (settled !== query) push.current(settled);
        // `query` is read, not depended on: it is what this effect writes, so listing it
        // would re-fire the effect with the value it just settled.
    }, [settled]);

    const hasClientNarrowing = !!query || Object.values(selection).some(Boolean);

    return (
        <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-auto border-r border-border bg-card p-4">
            <Group title="조회 조건" caption="서버에서 전체 데이터를 상대로 걸립니다. 바꾸면 다시 수집합니다.">
                <Field label="스테이지">
                    <select
                        value={server.stage}
                        onChange={e => onServerAxis({ stage: e.target.value as ReportStage })}
                        className={fieldClass}
                    >
                        <option value="v1">prod (v1)</option>
                        <option value="d1">dev (d1)</option>
                    </select>
                </Field>
                <Field label="종류">
                    <select
                        value={server.kind}
                        onChange={e => onServerAxis({ kind: e.target.value })}
                        className={fieldClass}
                    >
                        {KINDS.map(kind => (
                            <option key={kind.value} value={kind.value}>
                                {kind.label}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="레벨">
                    <select
                        value={server.level}
                        onChange={e => onServerAxis({ level: e.target.value })}
                        className={fieldClass}
                    >
                        {LEVELS.map(level => (
                            <option key={level.value} value={level.value}>
                                {level.label}
                            </option>
                        ))}
                    </select>
                </Field>
                {/* KST day boundaries, applied to `createdAt` — see the range caveat below. */}
                <Field label="시작일 (KST)">
                    <input
                        type="date"
                        value={server.from}
                        max={server.to || undefined}
                        onChange={e => onServerAxis({ from: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <Field label="종료일 (KST)">
                    <input
                        type="date"
                        value={server.to}
                        min={server.from || undefined}
                        onChange={e => onServerAxis({ to: e.target.value })}
                        className={fieldClass}
                    />
                </Field>
                <p className="text-[11px] leading-snug text-muted-foreground">
                    기간은 서버 <span className="font-mono">도달</span> 시각 기준입니다. 화면의 시각·순서는{' '}
                    <span className="font-mono">발생</span> 기준이라 경계에서 하루 어긋난 행이 섞일 수 있습니다.
                </p>
            </Group>

            <Group
                title="수집분 필터"
                caption={`수집한 ${corpusSize.toLocaleString()}건 안에서만 걸립니다. 서버가 이 축들을 조회하지 못합니다.`}
                action={
                    hasClientNarrowing ? (
                        <button
                            type="button"
                            onClick={onClearClient}
                            className="text-[11px] text-muted-foreground underline hover:text-foreground"
                        >
                            초기화
                        </button>
                    ) : undefined
                }
            >
                <Field label="검색">
                    <input
                        type="text"
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="메시지·유저·태그…"
                        className={fieldClass}
                    />
                </Field>
                {CLIENT_FACETS.map(facet => {
                    const values = facets[facet.key];
                    // A facet with nothing in it is noise; one with a single value is
                    // already the answer. Both are hidden so the rail shows only the axes
                    // that can actually narrow this corpus.
                    if (values.length < 2) return null;
                    return (
                        <Field key={facet.key} label={`${facet.label} (${values.length})`}>
                            <select
                                value={selection[facet.key] ?? ''}
                                onChange={e => onFacet(facet.key, e.target.value)}
                                className={fieldClass}
                            >
                                <option value="">전체</option>
                                {values.map(value => (
                                    <option key={value.value} value={value.value}>
                                        {value.value} ({value.count.toLocaleString()})
                                    </option>
                                ))}
                            </select>
                        </Field>
                    );
                })}
            </Group>
        </aside>
    );
};
