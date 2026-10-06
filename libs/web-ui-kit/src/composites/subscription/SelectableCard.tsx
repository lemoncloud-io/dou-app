import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SelectableCardProps {
    /** Item name. Truncates on one line. */
    title: string;
    /** 42px leading slot — an avatar or a product glyph. */
    leading?: React.ReactNode;
    /** Lime label left of the radio (e.g. "Selected"). */
    trailingLabel?: string;
    /** Whether the radio is filled. Owned by the host. */
    checked: boolean;
    /** Called with the opposite of `checked` on tap; the host decides what that means for the list. */
    onToggle?: (next: boolean) => void;
    /** Blocks the tap and dims the card. */
    disabled?: boolean;
    className?: string;
}

/**
 * Radio card — the Figma pick-list card on the subscription screens (choose a plan, choose which
 * clouds to keep): an optional leading avatar, a title, an optional lime label and a radio.
 *
 * The radio is drawn exactly like the plan picker's in `apps/web` (25px ring, 13px dot) so the two
 * lists read as one control. Stateless — `checked` belongs to the host, which is also what lets the
 * same card serve single-pick and multi-pick lists.
 */
export const SelectableCard = ({
    title,
    leading,
    trailingLabel,
    checked,
    onToggle,
    disabled = false,
    className,
}: SelectableCardProps) => {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onToggle?.(!checked)}
            className={cn(
                // BK_50 edge — `--secondary` is that value in light mode.
                'flex w-full items-center rounded-[20px] border border-secondary bg-card px-1 py-2 text-left',
                'shadow-[0_2px_7px_rgba(0,0,0,0.08)] dark:border-border dark:shadow-none',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className
            )}
        >
            <span className="flex min-w-0 flex-1 items-center gap-1 py-2 pl-4 pr-3">
                <span className="flex min-w-0 flex-1 items-center gap-2 px-1 py-2">
                    {leading && (
                        <span className="flex size-[42px] shrink-0 items-center justify-center">{leading}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.4] tracking-[-0.08px] text-foreground">
                        {title}
                    </span>
                    {trailingLabel && (
                        <span className="shrink-0 text-[15px] font-semibold leading-[1.4] tracking-[-0.075px] text-main-accent">
                            {trailingLabel}
                        </span>
                    )}
                </span>
                <span
                    aria-hidden
                    data-checked={checked}
                    className={cn(
                        'flex size-[25px] shrink-0 items-center justify-center rounded-full border-2',
                        checked ? 'border-primary' : 'border-control-idle'
                    )}
                >
                    {checked && <span className="size-[13px] rounded-full bg-primary" />}
                </span>
            </span>
        </button>
    );
};
