/**
 * `pages/memberships/MembershipsPage.tsx`
 * - Admin membership list, filters, and the detail drawer that grants, blocks and releases.
 *
 * Filters live in the URL so a refresh (or a shared link) keeps the view — the same reason
 * `UsersPage` keeps its page there.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Badge } from '@chatic/ui-kit/components/ui/badge';
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Skeleton } from '@chatic/ui-kit/components/ui/skeleton';

import { useAdminMemberships } from '../api/membershipsQuery';
import { currentTargetServer } from '../lib/targetServer';
import { MembershipDetailDrawer } from '../components/MembershipDetailDrawer';
import { MembershipTable } from '../components/MembershipTable';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

const PAGE_SIZE = 20;
const STATUSES = ['', 'active', 'expired', 'canceled', 'none'];
const PLATFORMS = ['', 'apple-inapp', 'google-inapp'];

export const MembershipsPage = (): JSX.Element => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [selected, setSelected] = useState<MembershipView | null>(null);

    // A hand-edited or shared `?page=x` would otherwise put NaN into the query key, the wire params
    // and the footer.
    const parsedPage = parseInt(searchParams.get('page') || '0', 10);
    const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
    const status = searchParams.get('status') || '';
    const productId = searchParams.get('productId') || '';
    const platform = searchParams.get('platform') || '';
    const userId = searchParams.get('userId') || '';
    const isSuper = searchParams.get('isSuper') || '';

    const { data, isLoading, isFetching, error, refetch } = useAdminMemberships({
        page,
        limit: PAGE_SIZE,
        status,
        productId,
        platform,
        userId,
        isSuper,
    });

    // One instant for the whole render, so every row judges override expiry against the same clock.
    const now = Date.now();
    const target = currentTargetServer();

    const setFilter = (patch: Record<string, string>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        // Any filter change invalidates the current offset.
        if (!('page' in patch)) next.delete('page');
        setSearchParams(next);
    };

    const header = (
        <div className="mb-4 space-y-3">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Memberships</h1>
                <div className="flex items-center gap-2">
                    {isFetching && <span className="text-muted-foreground text-sm">불러오는 중…</span>}
                    {/* The console is not deployed — it runs against whatever the local .env names,
                        and this screen writes. Say which server that is, before anything else. */}
                    <span className="text-muted-foreground text-xs">대상 서버</span>
                    <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
                    <span className="text-muted-foreground font-mono text-xs">{target.endpoint}</span>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <select
                    aria-label="상태"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    value={status}
                    onChange={event => setFilter({ status: event.target.value })}
                >
                    {STATUSES.map(value => (
                        <option key={value || 'all'} value={value}>
                            {value || '상태 전체'}
                        </option>
                    ))}
                </select>

                <select
                    aria-label="플랫폼"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    value={platform}
                    onChange={event => setFilter({ platform: event.target.value })}
                >
                    {PLATFORMS.map(value => (
                        <option key={value || 'all'} value={value}>
                            {value || '플랫폼 전체'}
                        </option>
                    ))}
                </select>

                <Input
                    className="w-48"
                    placeholder="userId"
                    defaultValue={userId}
                    onKeyDown={event => {
                        if (event.key === 'Enter') setFilter({ userId: event.currentTarget.value.trim() });
                    }}
                    onBlur={event => setFilter({ userId: event.target.value.trim() })}
                />

                <Input
                    className="w-44"
                    placeholder="productId"
                    defaultValue={productId}
                    onKeyDown={event => {
                        if (event.key === 'Enter') setFilter({ productId: event.currentTarget.value.trim() });
                    }}
                    onBlur={event => setFilter({ productId: event.target.value.trim() })}
                />

                {/* The retired super flag is still a filterable field, and checking who still
                    carries it is the precondition for dropping the app's read of it. */}
                <Button
                    size="sm"
                    variant={isSuper ? 'secondary' : 'outline'}
                    onClick={() => setFilter({ isSuper: isSuper ? '' : '1' })}
                >
                    isSuper=1만
                </Button>
            </div>
        </div>
    );

    if (error) {
        return (
            <div className="p-6">
                {header}
                <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
                    <p className="text-destructive">멤버십을 불러오지 못했습니다</p>
                    <Button onClick={() => void refetch()}>다시 시도</Button>
                </div>
            </div>
        );
    }

    if (isLoading || !data) {
        return (
            <div className="p-6">
                {header}
                <div className="space-y-2 rounded-lg border p-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    const total = data.total ?? 0;
    const rows = data.list ?? [];

    return (
        <div className="p-6">
            {header}

            <MembershipTable rows={rows} selectedUserId={selected?.userId} onSelect={setSelected} now={now} />

            <MembershipDetailDrawer
                membership={selected}
                now={now}
                onClose={() => setSelected(null)}
                // The mutation response IS the updated view, so the open drawer takes it directly
                // rather than waiting on a list refetch the search index may not have caught up to.
                onUpdated={setSelected}
            />

            {total > PAGE_SIZE && (
                <div className="mt-4 flex items-center justify-between">
                    <div className="text-muted-foreground text-sm">
                        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFilter({ page: String(Math.max(0, page - 1)) })}
                            disabled={page === 0}
                        >
                            이전
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFilter({ page: String(page + 1) })}
                            disabled={(page + 1) * PAGE_SIZE >= total}
                        >
                            다음
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
