import { type JSX, type ReactNode } from 'react';

import { cn } from '../utils';

/** A grey label-over-value tile, as in the subscription card's row of facts. */
export const SummaryTile = ({
    label,
    value,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    className?: string;
}): JSX.Element => (
    <div className={cn('flex flex-col gap-1.5 rounded-xl bg-muted px-4 py-3.5', className)}>
        <span className="text-xs text-subtitle">{label}</span>
        <span className="text-lg font-bold text-navy">{value}</span>
    </div>
);
