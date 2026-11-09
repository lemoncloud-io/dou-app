/**
 * `components/cost-monitor/CostFilterBar.tsx`
 * - The date, the row filters, the estimate inputs and the Cost Explorer calibration switch.
 */
import { Button } from '@chatic/ui-kit/components/ui/button';
import { Input } from '@chatic/ui-kit/components/ui/input';
import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { addDays, DEFAULTS, type EstimateOptions } from '../lib/cost';

import type { CostSummary } from '../lib/costRows';
import type { SlotFilter } from '../lib/relations';
import type { JSX } from 'react';

export type KindFilter = 'all' | 'dou';

const SLOT_FILTERS: [SlotFilter, string][] = [
    ['all', 'All slots'],
    ['assigned', 'In use'],
    ['idle', 'Idle'],
    ['problem', 'Problem'],
];

interface CostFilterBarProps {
    date: string;
    today: string;
    onDateChange: (date: string) => void;
    kind: KindFilter;
    onKindChange: (kind: KindFilter) => void;
    kindCount: Record<KindFilter, number>;
    slotFilter: SlotFilter;
    onSlotFilterChange: (filter: SlotFilter) => void;
    slotCount: (filter: SlotFilter) => number;
    opt: EstimateOptions;
    onOptChange: (opt: EstimateOptions) => void;
    calibrate: boolean;
    onCalibrateChange: (on: boolean) => void;
    summary: CostSummary;
    /** The ratio every account without its own takes — over all rows, whatever the filters show. */
    allFactor?: number;
}

const Toggle = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }): JSX.Element => (
    <Button size="sm" className="h-7" variant={on ? 'default' : 'outline'} aria-pressed={on} onClick={onClick}>
        {children}
    </Button>
);

export const CostFilterBar = ({
    date,
    today,
    onDateChange,
    kind,
    onKindChange,
    kindCount,
    slotFilter,
    onSlotFilterChange,
    slotCount,
    opt,
    onOptChange,
    calibrate,
    onCalibrateChange,
    summary,
    allFactor,
}: CostFilterBarProps): JSX.Element => {
    const calibDay = addDays(date, -2);
    const calibration = !calibrate
        ? 'off'
        : summary.calibratedOwn + summary.calibratedByAll
          ? `${summary.calibratedOwn} own · ${summary.calibratedByAll} by all${allFactor !== undefined ? ` (×${allFactor.toFixed(3)})` : ''}`
          : `no actuals for UTC ${calibDay} yet`;

    return (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Date (KST)</span>
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    aria-label="Previous day"
                    onClick={() => onDateChange(addDays(date, -1))}
                >
                    ◀
                </Button>
                <Input
                    type="date"
                    aria-label="Date"
                    className="h-7 w-36 px-2 py-0 text-xs"
                    value={date}
                    max={today}
                    onChange={event => event.target.value && onDateChange(event.target.value)}
                />
                <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    aria-label="Next day"
                    disabled={date >= today}
                    onClick={() => onDateChange(addDays(date, 1))}
                >
                    ▶
                </Button>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Kind</span>
                <Toggle on={kind === 'all'} onClick={() => onKindChange('all')}>{`All ${kindCount.all}`}</Toggle>
                <Toggle on={kind === 'dou'} onClick={() => onKindChange('dou')}>{`DoU only ${kindCount.dou}`}</Toggle>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Slots</span>
                {SLOT_FILTERS.map(([value, label]) => (
                    <Toggle key={value} on={slotFilter === value} onClick={() => onSlotFilterChange(value)}>
                        {`${label} ${slotCount(value)}`}
                    </Toggle>
                ))}
            </div>
            <div className="flex items-center gap-1.5">
                <span
                    className="text-muted-foreground"
                    title="Off by default: with calibration on, Cost Explorer carries the real discount"
                >
                    Discount %
                </span>
                <Input
                    type="number"
                    step="0.1"
                    aria-label="Discount percent"
                    className="h-7 w-20 px-2 py-0 text-xs"
                    value={+(opt.discount * 100).toFixed(2)}
                    onChange={event => onOptChange({ ...opt, discount: Number(event.target.value) / 100 })}
                />
                <span
                    className="text-muted-foreground"
                    title="1 is no adjustment. 1.098 was a one-day optimistic figure, so it is not the default. 512 MB assumed."
                >
                    Lambda adj.
                </span>
                <Input
                    type="number"
                    step="0.001"
                    aria-label="Lambda adjustment"
                    className="h-7 w-20 px-2 py-0 text-xs"
                    value={opt.lambdaAdj}
                    onChange={event => onOptChange({ ...opt, lambdaAdj: Number(event.target.value) })}
                />
                <Button size="sm" variant="outline" className="h-7" onClick={() => onOptChange(DEFAULTS)}>
                    Defaults
                </Button>
            </div>
            <div
                className="flex items-center gap-1.5"
                title={`Scales each account's estimate by Cost Explorer ÷ estimate of UTC ${calibDay}, the latest day Cost Explorer has finished`}
            >
                <Switch id="cost-calibrate" checked={calibrate} onCheckedChange={onCalibrateChange} />
                <label htmlFor="cost-calibrate" className="text-muted-foreground">
                    Cost Explorer calibration
                </label>
                <span className="tabular-nums text-foreground">{calibration}</span>
            </div>
        </div>
    );
};
