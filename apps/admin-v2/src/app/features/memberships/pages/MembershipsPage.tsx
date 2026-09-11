/**
 * `pages/memberships/MembershipsPage.tsx`
 * - Admin membership console: query, result shape, list, and the drawer that grants/blocks/releases.
 *
 * Laid out as a monitoring screen — fixed toolbar, chips, summary, scrolling body — on the shared
 * `--sm-*` scale, so it reads like socket-lab rather than like a form page.
 *
 * Filters live in the URL so a refresh or a shared link keeps the view. Text fields are debounced
 * before they get there: typing a userId should narrow the list, not fire a request per keystroke.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAdminMemberships } from '../api/membershipsQuery';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { asListParams, clearAllPatch, countByStatus, toChips, type FilterKey } from '../lib/filters';
import { currentTargetServer } from '../lib/targetServer';
import { MembershipDetailDrawer } from '../components/MembershipDetailDrawer';
import { MembershipTable } from '../components/MembershipTable';
import '../memberships.css';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

const PAGE_SIZE = 20;
const STATUSES = ['', 'active', 'expired', 'canceled', 'none'];
const PLATFORMS = ['', 'apple-inapp', 'google-inapp'];
const REFRESH_MS = 15_000;

const DOT_CLASS: Record<string, string> = {
    active: 'mb-dot mb-dot-active',
    expired: 'mb-dot mb-dot-expired',
    canceled: 'mb-dot mb-dot-canceled',
};

export const MembershipsPage = (): JSX.Element => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [selected, setSelected] = useState<MembershipView | null>(null);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // A hand-edited or shared `?page=x` would otherwise put NaN into the query key and the footer.
    const parsedPage = parseInt(searchParams.get('page') || '0', 10);
    const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;

    const filters = {
        status: searchParams.get('status') || '',
        productId: searchParams.get('productId') || '',
        platform: searchParams.get('platform') || '',
        userId: searchParams.get('userId') || '',
        isSuper: searchParams.get('isSuper') || '',
    };

    const setParams = (patch: Record<string, string>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        // Any filter change invalidates the current offset.
        if (!('page' in patch)) next.delete('page');
        setSearchParams(next);
    };

    // Text fields are typed into, so they hold local state and settle into the URL. Selects and
    // toggles commit immediately — there is nothing to debounce about one click.
    const [userIdDraft, setUserIdDraft] = useState(filters.userId);
    const [productDraft, setProductDraft] = useState(filters.productId);
    const settledUserId = useDebouncedValue(userIdDraft);
    const settledProduct = useDebouncedValue(productDraft);

    useEffect(() => {
        if (settledUserId.trim() !== filters.userId) setParams({ userId: settledUserId.trim() });
    }, [settledUserId]);

    useEffect(() => {
        if (settledProduct.trim() !== filters.productId) setParams({ productId: settledProduct.trim() });
    }, [settledProduct]);

    const { data, isLoading, isFetching, error, refetch } = useAdminMemberships(
        asListParams(filters, page, PAGE_SIZE),
        autoRefresh ? REFRESH_MS : false
    );

    // One instant for the whole render, so every row judges override expiry against the same clock.
    const now = Date.now();
    const target = currentTargetServer();
    const chips = toChips(filters);
    const rows = data?.list ?? [];
    const total = data?.total ?? 0;
    const buckets = countByStatus(rows);

    const clearChip = (key: FilterKey) => {
        if (key === 'userId') setUserIdDraft('');
        if (key === 'productId') setProductDraft('');
        setParams({ [key]: '' });
    };

    const clearAll = () => {
        setUserIdDraft('');
        setProductDraft('');
        setParams(clearAllPatch());
    };

    return (
        <div className="mb-root">
            <header className="mb-topbar">
                <span className="mb-title">Memberships</span>
                <span className="mb-spacer" />
                {isFetching && <span style={{ color: 'var(--sm-text-5)', fontSize: 11 }}>불러오는 중…</span>}
                <button
                    type="button"
                    className={`mb-toggle ${autoRefresh ? 'mb-toggle-on' : ''}`}
                    onClick={() => setAutoRefresh(v => !v)}
                    title={`${REFRESH_MS / 1000}초마다 다시 불러옵니다`}
                >
                    자동 새로고침
                </button>
                <button type="button" className="mb-toggle" onClick={() => void refetch()}>
                    새로고침
                </button>
                {/* The console is not deployed — it writes to whatever the local .env names. */}
                <span className={`mb-target ${target.isProd ? 'mb-target-prod' : ''}`}>
                    <span className={`mb-tag ${target.isProd ? 'mb-tag-danger' : ''}`}>{target.label}</span>
                    <span className="mb-mono">{target.endpoint}</span>
                </span>
            </header>

            <div className="mb-toolbar">
                <div className="mb-field">
                    <label className="mb-label" htmlFor="f-status">
                        상태
                    </label>
                    <select
                        id="f-status"
                        className="mb-select"
                        value={filters.status}
                        onChange={event => setParams({ status: event.target.value })}
                    >
                        {STATUSES.map(value => (
                            <option key={value || 'all'} value={value}>
                                {value || '전체'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mb-field">
                    <label className="mb-label" htmlFor="f-platform">
                        플랫폼
                    </label>
                    <select
                        id="f-platform"
                        className="mb-select"
                        value={filters.platform}
                        onChange={event => setParams({ platform: event.target.value })}
                    >
                        {PLATFORMS.map(value => (
                            <option key={value || 'all'} value={value}>
                                {value || '전체'}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="mb-field">
                    <label className="mb-label" htmlFor="f-user">
                        userId
                    </label>
                    <input
                        id="f-user"
                        className="mb-input"
                        style={{ width: 150 }}
                        placeholder="1000904"
                        value={userIdDraft}
                        onChange={event => setUserIdDraft(event.target.value)}
                    />
                </div>

                <div className="mb-field">
                    <label className="mb-label" htmlFor="f-product">
                        상품
                    </label>
                    <input
                        id="f-product"
                        className="mb-input"
                        style={{ width: 150 }}
                        placeholder="pro_tier_01"
                        value={productDraft}
                        onChange={event => setProductDraft(event.target.value)}
                    />
                </div>

                <div className="mb-field">
                    <span className="mb-label">이관 확인</span>
                    {/* The retired super flag is still filterable, and checking who still carries
                        it is the precondition for dropping the app's read of it. */}
                    <button
                        type="button"
                        className={`mb-toggle ${filters.isSuper ? 'mb-toggle-on' : ''}`}
                        onClick={() => setParams({ isSuper: filters.isSuper ? '' : '1' })}
                    >
                        isSuper=1만
                    </button>
                </div>
            </div>

            {chips.length > 0 && (
                <div className="mb-chips">
                    {chips.map(chip => (
                        <button key={chip.key} type="button" className="mb-chip" onClick={() => clearChip(chip.key)}>
                            {chip.label}
                            <span className="mb-chip-x">×</span>
                        </button>
                    ))}
                    <button type="button" className="mb-chip-clear" onClick={clearAll}>
                        전체 해제
                    </button>
                </div>
            )}

            <div className="mb-summary">
                <span className="mb-stat">
                    전체 <span className="mb-stat-value">{total.toLocaleString()}</span>
                </span>
                <span className="mb-stat">
                    이 페이지 <span className="mb-stat-value">{rows.length}</span>
                </span>
                {buckets.map(([status, count]) => (
                    <span key={status} className="mb-stat">
                        <span className={DOT_CLASS[status] ?? 'mb-dot'} />
                        {status} <span className="mb-stat-value">{count}</span>
                    </span>
                ))}
                {/* The membership list endpoint returns no aggregation, so this counts the rows on
                    screen. Saying so keeps it from being read as a total. */}
                {buckets.length > 0 && <span style={{ color: 'var(--sm-text-6)' }}>· 집계는 이 페이지 기준</span>}
            </div>

            <div className="mb-body">
                {error ? (
                    <div className="mb-empty">
                        <p style={{ color: 'var(--sm-danger)' }}>멤버십을 불러오지 못했습니다</p>
                        <button type="button" className="mb-page-btn" onClick={() => void refetch()}>
                            다시 시도
                        </button>
                    </div>
                ) : isLoading || !data ? (
                    Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="mb-skel" style={{ width: `${90 - (i % 4) * 12}%` }} />
                    ))
                ) : (
                    <MembershipTable rows={rows} selectedUserId={selected?.userId} onSelect={setSelected} now={now} />
                )}
            </div>

            <footer className="mb-footer">
                <span>
                    {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
                </span>
                <span className="mb-spacer" />
                <button
                    type="button"
                    className="mb-page-btn"
                    onClick={() => setParams({ page: String(Math.max(0, page - 1)) })}
                    disabled={page === 0}
                >
                    이전
                </button>
                <button
                    type="button"
                    className="mb-page-btn"
                    onClick={() => setParams({ page: String(page + 1) })}
                    disabled={(page + 1) * PAGE_SIZE >= total}
                >
                    다음
                </button>
            </footer>

            <MembershipDetailDrawer
                membership={selected}
                now={now}
                onClose={() => setSelected(null)}
                // The mutation response IS the updated view, so the open drawer takes it directly
                // rather than waiting on a list refetch the search index may not have caught up to.
                onUpdated={setSelected}
            />
        </div>
    );
};
