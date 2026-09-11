/**
 * `pages/memberships/MembershipsPage.tsx`
 * - Admin membership console: filters, the list, and the detail column that grants/blocks/releases.
 *
 * Composed like the log console — header strip, filter rail, list, detail column — because the work
 * is the same shape: narrow, scan, act, narrow again.
 *
 * Filters and stage live in the URL so a refresh or a shared link keeps the view.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAdminMemberships } from '../api/membershipsQuery';
import { clearAllPatch, matchesFilters, toChips, type FilterKey, type FilterValues } from '../lib/filters';
import {
    RELAY_STAGES,
    configuredEndpoint,
    configuredStage,
    describeTargetServer,
    relayBaseFor,
    type RelayStage,
} from '../lib/targetServer';
import { MembershipConsoleShell } from '../components/MembershipConsoleShell';
import { MembershipDetailPanel } from '../components/MembershipDetailPanel';
import { MembershipFilterRail } from '../components/MembershipFilterRail';
import { MembershipStatusStrip } from '../components/MembershipStatusStrip';
import { MembershipTable } from '../components/MembershipTable';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const PAGE_SIZE = 100;
const REFRESH_MS = 15_000;

export const MembershipsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [selected, setSelected] = useState<MembershipView | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // A hand-edited or shared `?page=x` would otherwise put NaN into the query key and the footer.
    const parsedPage = parseInt(searchParams.get('page') || '0', 10);
    const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;

    const stageParam = searchParams.get('stage');
    const stage: RelayStage = stageParam === 'v1' || stageParam === 'd1' ? stageParam : configuredStage();

    const filters: FilterValues = {
        status: searchParams.get('status') || '',
        productId: searchParams.get('productId') || '',
        platform: searchParams.get('platform') || '',
        userId: searchParams.get('userId') || '',
        isSuper: searchParams.get('isSuper') || '',
    };

    const setParams = (patch: Record<string, string>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        // Any filter or stage change invalidates the current offset.
        if (!('page' in patch)) next.delete('page');
        setSearchParams(next);
    };

    const { data, isLoading, isFetching, error, refetch } = useAdminMemberships(
        { page, limit: PAGE_SIZE },
        autoRefresh ? REFRESH_MS : false,
        stage
    );

    // One instant for the whole render, so every row judges override expiry against the same clock.
    const now = Date.now();
    const target = describeTargetServer(relayBaseFor(configuredEndpoint(), stage));
    const chips = toChips(filters);

    const fetched = data?.list ?? [];
    // The relay ignores these axes on this route, so they are applied here — see `MembershipFilterRail`.
    const rows = fetched.filter(row => matchesFilters(row, filters));
    const total = data?.total ?? 0;

    const header = (
        <>
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-semibold text-foreground">Memberships</h1>
                {isFetching && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
                <span className="flex-1" />

                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    스테이지
                    <select
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring"
                        value={stage}
                        onChange={event => setParams({ stage: event.target.value })}
                    >
                        {RELAY_STAGES.map(value => (
                            <option key={value} value={value}>
                                {value === 'v1' ? '운영 (v1)' : '개발 (d1)'}
                            </option>
                        ))}
                    </select>
                </label>

                <button
                    type="button"
                    onClick={() => setAutoRefresh(v => !v)}
                    title={`${REFRESH_MS / 1000}초마다 다시 불러옵니다`}
                    className={`h-7 rounded-md border px-2 text-xs transition-colors ${
                        autoRefresh
                            ? 'border-ring bg-accent text-foreground'
                            : 'border-input bg-background text-muted-foreground hover:text-foreground'
                    }`}
                >
                    자동 새로고침
                </button>
                <button
                    type="button"
                    onClick={() => void refetch()}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                    새로고침
                </button>

                {/* The console is not deployed — it writes to whatever this stage resolves to. */}
                <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] ${
                        target.isProd
                            ? 'border-red-500/50 bg-red-500/10 text-red-400'
                            : 'border-border text-muted-foreground'
                    }`}
                >
                    {target.label}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{target.endpoint}</span>
            </div>

            <MembershipStatusStrip rows={rows} pageSize={fetched.length} total={total} />

            {chips.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {chips.map(chip => (
                        <button
                            key={chip.key}
                            type="button"
                            onClick={() => setParams({ [chip.key]: '' })}
                            className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-muted px-2 text-[11px] text-foreground hover:border-ring"
                        >
                            {chip.label}
                            <span className="text-muted-foreground">×</span>
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setParams(clearAllPatch())}
                        className="text-[11px] text-muted-foreground underline hover:text-foreground"
                    >
                        전체 해제
                    </button>
                </div>
            )}
        </>
    );

    const main = error ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16">
            <p className="text-sm text-red-400">멤버십을 불러오지 못했습니다</p>
            <button
                type="button"
                onClick={() => void refetch()}
                className="h-7 rounded-md border border-input px-3 text-xs text-foreground hover:bg-muted"
            >
                다시 시도
            </button>
        </div>
    ) : isLoading || !data ? (
        <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-3 rounded bg-muted" style={{ width: `${90 - (i % 4) * 12}%` }} />
            ))}
        </div>
    ) : (
        <MembershipTable rows={rows} selectedUserId={selected?.userId} onSelect={setSelected} now={now} />
    );

    const footer = (
        <>
            <span className="tabular-nums">
                {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
            </span>
            <span className="flex-1" />
            <button
                type="button"
                onClick={() => setParams({ page: String(Math.max(0, page - 1)) })}
                disabled={page === 0}
                className="h-6 rounded border border-input px-2 text-[11px] text-foreground disabled:opacity-40"
            >
                이전
            </button>
            <button
                type="button"
                onClick={() => setParams({ page: String(page + 1) })}
                disabled={(page + 1) * PAGE_SIZE >= total}
                className="h-6 rounded border border-input px-2 text-[11px] text-foreground disabled:opacity-40"
            >
                다음
            </button>
        </>
    );

    return (
        <MembershipConsoleShell
            header={header}
            rail={
                <MembershipFilterRail
                    values={filters}
                    onChange={patch => setParams(patch as Record<FilterKey, string>)}
                    pageSize={fetched.length}
                />
            }
            main={main}
            detail={
                <MembershipDetailPanel
                    membership={selected}
                    now={now}
                    stage={stage}
                    onClose={() => setSelected(null)}
                    // The mutation response IS the updated view, so the open panel takes it directly
                    // rather than waiting on a refetch the search index may not have caught up to.
                    onUpdated={setSelected}
                />
            }
            footer={footer}
        />
    );
};
