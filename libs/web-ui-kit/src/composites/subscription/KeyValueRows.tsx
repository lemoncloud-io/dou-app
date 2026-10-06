import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export type KeyValueTone = 'default' | 'accent' | 'info' | 'danger' | 'warning';

export interface KeyValueRow {
    /** React key; defaults to `label`, so pass one when two rows share a label. */
    key?: string;
    /** Left-hand label. Wraps rather than truncates. */
    label: string;
    /** Right-aligned value. */
    value: React.ReactNode;
    /** Value colour: `accent` lime · `info` point blue · `danger` red · `warning` orange. */
    tone?: KeyValueTone;
    /** Small grey second line under the value (e.g. the pre-discount price "₩8,800"). */
    hint?: string;
}

export interface KeyValueRowsProps {
    rows: KeyValueRow[];
    /**
     * Drops the card shell. Use it when nesting the rows inside another card — `ProductCard`'s
     * `children` above all — so the two shadows do not stack.
     */
    bare?: boolean;
    className?: string;
}

const TONE_CLASS: Record<KeyValueTone, string> = {
    default: 'text-foreground',
    accent: 'text-main-accent',
    info: 'text-point-blue',
    danger: 'text-destructive',
    // `--warning` is declared by `apps/web` but not by this kit's `tokens.css`, so the fallback keeps
    // the colour in Storybook too. Kept identical to `ProductCard`'s scheduled tone.
    warning: 'text-[hsl(var(--warning,38_92%_50%))]',
};

/**
 * Key/value info table — the Figma "info table" on the subscription detail and payment screens:
 * a grey label on the left and a bold value on the right, one row per fact.
 *
 * Both sides may wrap. A value is capped at 65% of the row instead of being kept on one line, so a
 * long date or price wraps inside its column at a 320px width rather than pushing the row wider
 * than the screen.
 */
export const KeyValueRows = ({ rows, bare = false, className }: KeyValueRowsProps) => {
    return (
        <dl
            className={cn(
                'flex w-full flex-col',
                // Same shell as ProductCard, so a standalone table sits flush beside one.
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
                        {/* keep-all keeps Korean words whole; overflow-wrap still breaks a token that
                            is longer than the column on its own. */}
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
