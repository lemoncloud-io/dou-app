import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconEmojiAdd } from '../../resources/icons';

/** Counts past this are shown as `+99` — the design's overflow form (Figma 4710:14074). */
const COUNT_CAP = 99;

/**
 * `12` / `+99` — a reaction's tally as the design writes it.
 *
 * Exported because the reactor sheet's tabs and the chips under a message have to agree:
 * a chip reading `+99` next to a tab reading `140` would look like two different numbers
 * for one reaction.
 */
export const formatReactionCount = (count: number): string => (count > COUNT_CAP ? `+${COUNT_CAP}` : String(count));

/**
 * `sm` — under a message, 26px tall (Figma 4710:14081).
 * `md` — the reactor sheet's tab row, 40px tall (Figma 4717:21265).
 */
export type ReactionChipSize = 'sm' | 'md';

export interface ReactionChipProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    /** The emoji as it should be shown — the display string, not the fold key. */
    emoji: string;
    /** Reactor count; rendered through `formatReactionCount`. */
    count: number;
    /** The signed-in user is among the reactors: accent border, accent count. */
    mine?: boolean;
    size?: ReactionChipSize;
    /** Underlines the chip in the accent color — the reactor sheet's selected tab. */
    selected?: boolean;
}

/**
 * One reaction as a pill: the emoji, then how many people picked it.
 *
 * `mine` is carried by the border and the count's color, never by the emoji — the emoji has
 * to stay legible at 13px, and tinting it would read as a different emoji. The unpressed fill
 * is the input-border token at 44%, which is what keeps the pill visible on both the white
 * message ground and the sheet's own surface without a border of its own.
 *
 * Presentational only: it owns no gesture. The tap-to-toggle and press-and-hold-for-reactors
 * gestures belong to the host, because only the host knows whether the target message is
 * persisted enough to react to.
 */
export const ReactionChip = React.forwardRef<HTMLButtonElement, ReactionChipProps>(
    ({ emoji, count, mine = false, size = 'sm', selected = false, className, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            // The pressed state says "this reaction is mine", which is the toggle the tap flips —
            // NOT whether this is the selected tab (`selected` is a separate, visual concern).
            // Declared before the spread, so a host using the chip as a tab can replace it with
            // `role`/`aria-selected` instead.
            aria-pressed={mine}
            className={cn(
                'relative flex shrink-0 select-none items-center justify-center rounded-full leading-normal transition-colors',
                size === 'sm' ? 'h-[26px] gap-1 px-2.5' : 'h-10 gap-1.5 px-2.5',
                mine
                    ? 'bg-main-accent/[0.06] border-main-accent'
                    : 'bg-input-border/[0.44] border-transparent active:bg-input-border/70',
                // 1.5px in the sheet's larger chip, 1px under a message — the heavier chip needs
                // the heavier ring to read as the same weight at 40px.
                mine && (size === 'sm' ? 'border' : 'border-[1.5px]'),
                !mine && 'border',
                className
            )}
            {...props}
        >
            <span aria-hidden className={cn('font-medium text-foreground', size === 'sm' ? 'text-[13px]' : 'text-xl')}>
                {emoji}
            </span>
            <span
                className={cn(
                    'font-semibold tabular-nums',
                    size === 'sm' ? 'text-xs tracking-[-0.06px]' : 'text-sm tracking-[-0.07px]',
                    mine ? 'text-main-accent' : 'text-foreground'
                )}
            >
                {formatReactionCount(count)}
            </span>
            {/* The selected tab's underline. Sits outside the pill (`-bottom-*`) so it reads as an
                indicator under the row rather than a stripe inside the chip. */}
            {selected && (
                <span
                    aria-hidden
                    className="absolute -bottom-[6px] left-1/2 h-1 w-6 -translate-x-1/2 rounded-full bg-main-accent"
                />
            )}
        </button>
    )
);
ReactionChip.displayName = 'ReactionChip';

export interface ReactionAddButtonProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    size?: ReactionChipSize;
}

/**
 * The affordance at the end of a reaction row: add a reaction that is not there yet.
 *
 * Chip-shaped and chip-sized so it reads as the row's last item rather than a separate control
 * bolted onto the end, but it carries NO pressed state — tapping a chip and tapping this are
 * different acts, and this one opens a picker rather than toggling anything.
 */
export const ReactionAddButton = React.forwardRef<HTMLButtonElement, ReactionAddButtonProps>(
    ({ size = 'sm', className, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            className={cn(
                'flex shrink-0 items-center justify-center rounded-full bg-input-border/[0.44] px-2.5 text-foreground transition-colors active:bg-input-border/70',
                size === 'sm' ? 'h-[26px]' : 'size-10',
                className
            )}
            {...props}
        >
            <IconEmojiAdd size={size === 'sm' ? 18 : 20} />
        </button>
    )
);
ReactionAddButton.displayName = 'ReactionAddButton';
