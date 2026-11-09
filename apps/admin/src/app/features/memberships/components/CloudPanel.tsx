/**
 * `components/memberships/CloudPanel.tsx`
 * - The selected user's clouds, with the status aggregation the relay returns alongside the list.
 *
 * This is where a grant or a block is actually confirmed: a grant should bring suspended clouds
 * back, and a block should push them into the hold/reclaim path. Neither is visible on the
 * membership row itself.
 */
import { formatDate } from '@chatic/shared';
import { Badge } from '@chatic/ui-kit/components/ui/badge';

import { readAggrBuckets } from '../lib/cloudAggregation';

import type { AggrResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { JSX } from 'react';

interface CloudPanelProps {
    clouds: CloudView[] | undefined;
    /** The relay may send one aggregation or a list of them. */
    aggr: AggrResult | AggrResult[] | undefined;
    isLoading: boolean;
}

export const CloudPanel = ({ clouds, aggr, isLoading }: CloudPanelProps): JSX.Element => {
    if (isLoading) {
        return <p className="text-muted-foreground text-sm">Loading clouds…</p>;
    }

    const buckets = readAggrBuckets(aggr);

    return (
        <div className="space-y-3">
            {buckets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {buckets.map(([status, count]) => (
                        <Badge key={status} variant="secondary">
                            {status} {count}
                        </Badge>
                    ))}
                </div>
            )}

            {!clouds || clouds.length === 0 ? (
                <p className="text-muted-foreground text-sm">No owned clouds.</p>
            ) : (
                <ul className="space-y-1.5">
                    {clouds.map(cloud => (
                        <li key={cloud.id} className="rounded-md border px-3 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-mono">{cloud.id}</span>
                                <Badge variant={cloud.status === 'active' ? 'default' : 'outline'}>
                                    {cloud.status ?? '-'}
                                </Badge>
                            </div>
                            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                                <span>{cloud.name || cloud.email || '-'}</span>
                                {cloud.suspendedAt ? <span>Suspended {formatDate(cloud.suspendedAt)}</span> : null}
                                {cloud.releasedAt ? <span>Released {formatDate(cloud.releasedAt)}</span> : null}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
