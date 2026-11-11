/**
 * `components/cost-monitor/CostSummary.tsx`
 * - The slot pool line and the four header cards: today, yesterday's estimate, its actual, the gap.
 */
import { addDays, HOUR, utcDay } from '../lib/cost';
import { pct, usd, type CostSummary as Summary } from '../lib/costRows';
import { POOL_KEYS } from '../lib/display';

import type { Tenants } from '../api/costApi';
import type { JSX } from 'react';

const Card = ({ label, value, note }: { label: string; value: string; note: string }): JSX.Element => (
    <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        <p className="text-[10px] text-muted-foreground">{note}</p>
    </div>
);

interface CostSummaryProps {
    date: string;
    summary: Summary;
    pool?: Tenants;
    actualsLoaded: boolean;
    actualsFailed: boolean;
}

export const CostSummary = ({ date, summary, pool, actualsLoaded, actualsFailed }: CostSummaryProps): JSX.Element => {
    const yday = addDays(date, -1);
    const now = Date.now();
    const ydayOpen = now < utcDay(yday)[1];
    // Cost Explorer fills the latest day late: 10-26 collected at 10-27 15:00 was about 17% short.
    const ydayFresh = now < utcDay(yday)[1] + 48 * HOUR;
    const calibrated = summary.calibratedOwn + summary.calibratedByAll > 0;

    return (
        <>
            {pool && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-semibold text-foreground">Slot pool {pool.pool.total}</span>
                    {POOL_KEYS.map(([key, label]) => (
                        <span
                            key={key}
                            className={
                                key === 'errorCount' && pool.pool[key] ? 'text-red-400' : 'text-muted-foreground'
                            }
                        >
                            {label} <b className="tabular-nums text-foreground">{pool.pool[key]}</b>
                        </span>
                    ))}
                    <span className="text-[10px] text-muted-foreground">
                        {pool.poolFromList ? 'counted from the list (view=status gave nothing)' : 'view=status'}
                        {pool.duplicates ? ` · ${pool.duplicates} slot(s) listed twice, latest kept` : ''}
                    </span>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <Card
                    label={`Today · KST ${date} from 00:00`}
                    value={usd(summary.today)}
                    note={
                        calibrated
                            ? `7 metrics · calibrated to Cost Explorer · raw estimate ${usd(summary.rawToday)}`
                            : '7 metrics · estimate'
                    }
                />
                <Card
                    label={`Yesterday est. · UTC ${yday}`}
                    value={usd(summary.yesterdayEstimate)}
                    note={`7 metrics · estimate${ydayOpen ? ' · day still running' : ''}`}
                />
                <Card
                    label={`Yesterday actual · Cost Explorer UTC ${yday}`}
                    value={
                        actualsLoaded
                            ? summary.withActual
                                ? usd(summary.actual7)
                                : 'not collected'
                            : actualsFailed
                              ? 'error'
                              : '…'
                    }
                    note={
                        summary.withActual
                            ? `7 metrics · all ${usd(summary.actualAll)} · ${summary.withActual} account(s)${ydayFresh ? ' · not final within 2 days' : ''}`
                            : 'Collected nightly at 22:40 KST'
                    }
                />
                <Card
                    label="Yesterday diff · estimate vs actual (7)"
                    value={pct(summary.diff)}
                    note={`Accounts with an actual only · UTC${ydayFresh && summary.withActual ? ' · actual not final yet' : ''}`}
                />
            </div>
        </>
    );
};
