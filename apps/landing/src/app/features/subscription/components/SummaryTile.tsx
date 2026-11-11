import { type JSX, type ReactNode } from 'react';

import { cn } from '../utils';

/**
 * A label-over-value fact, as in the subscription card's row of them. On a phone the facts sit bare
 * inside a shared bordered card the caller draws; from `md` each is its own pale tile.
 */
export const SummaryTile = ({
    label,
    value,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    className?: string;
}): JSX.Element => (
    <div className={cn('flex min-w-0 flex-col gap-1 md:rounded-2xl md:bg-note md:px-[18px] md:py-3.5', className)}>
        <span className="text-xs font-medium text-mute">{label}</span>
        <span className="text-base font-bold text-ink md:text-lg md:font-semibold">{value}</span>
    </div>
);
