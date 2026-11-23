import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export type KeyValueTone = 'default' | 'accent' | 'info' | 'danger' | 'warning';

export interface KeyValueRow {
    key?: string;
    label: string;
    value: React.ReactNode;
    tone?: KeyValueTone;
    hint?: string;
}

export interface KeyValueRowsProps {
    rows: KeyValueRow[];
    bare?: boolean;
    className?: string;
}

const TONE_CLASS: Record<KeyValueTone, string> = {
    default: 'text-foreground',
    accent: 'text-main-accent',
    info: 'text-point-blue',
    danger: 'text-destructive',
    warning: 'text-[hsl(var(--warning,38_92%_50%))]',
};

export const KeyValueRows = ({ rows, bare = false, className }: KeyValueRowsProps) => {
    return (
        <dl
            className={cn(
                'flex w-full flex-col',
                !bare &&
                    'rounded-[18px] bg-card px-0.5 py-2 shadow-[0_2px_6px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
                className
            )}
        >
            {rows.map(row => (
                <div key={row.key ?? row.label} className="flex items-start justify-between gap-4 px-4 py-3">
                    <dt className="min-w-0 flex-1 text-[15px] font-medium leading-[1.4] tracking-[-0.075px] text-description">
                        {row.label}
                    </dt>
                    <dd className="flex min-w-0 max-w-[65%] shrink-0 flex-col items-end text-right">
                        <span
                            className={cn(
                                'break-keep text-[15px] font-semibold leading-[1.4] tracking-[-0.075px] [overflow-wrap:anywhere]',
                                TONE_CLASS[row.tone ?? 'default']
                            )}
                        >
                            {row.value}
                        </span>
                        {row.hint && (
                            <span className="text-[13px] font-medium leading-[1.4] tracking-[-0.065px] text-description">
                                {row.hint}
                            </span>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
};
