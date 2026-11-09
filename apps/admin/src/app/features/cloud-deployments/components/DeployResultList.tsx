/**
 * `components/cloud-deployments/DeployResultList.tsx`
 * - One line per call of the current run, and the tally once it ends.
 *
 * A success here means the goods service queued the deploy, not that it finished. Where the deploy
 * got to shows on the product's status in the table, after a refresh.
 */
import { Badge } from '@chatic/ui-kit/components/ui/badge';

import type { DeployResult, DeploySummary } from '../lib/runDeploys';
import type { GoodsTarget } from '../lib/goodsTarget';
import type { JSX } from 'react';

interface DeployResultListProps {
    /** The goods service this run called, fixed when it started. */
    target: GoodsTarget;
    total: number;
    results: DeployResult[];
    /** Absent while the run is going. */
    summary?: DeploySummary;
}

export const DeployResultList = ({ target, total, results, summary }: DeployResultListProps): JSX.Element => (
    <div className="flex flex-col gap-2 p-3 text-xs">
        <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">Run</span>
            <Badge variant={target.isProd ? 'destructive' : 'outline'}>{target.label}</Badge>
            <span className="tabular-nums text-muted-foreground">
                {results.length} / {total}
            </span>
        </div>

        {summary && (
            <p className="tabular-nums text-foreground">
                {summary.succeeded} succeeded · {summary.failed} failed · {summary.notStarted} not started
            </p>
        )}

        <ul className="flex flex-col divide-y divide-border">
            {results.map(({ call, ok, message }, index) => (
                <li key={`${index}-${call.productId}`} className="flex flex-col gap-0.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? 'OK' : 'FAIL'}</span>
                        <span className="font-mono text-[11px] text-foreground">{call.productId}</span>
                        <span className="text-muted-foreground">{call.service}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                        {call.ownerName || '-'} · <span className="font-mono">{call.ownerId || '-'}</span>
                    </div>
                    <div className={`break-all text-[11px] ${ok ? 'text-muted-foreground' : 'text-red-400'}`}>
                        {message}
                    </div>
                </li>
            ))}
        </ul>
    </div>
);
