import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconEmojiAdd } from '../../resources/icons';

const COUNT_CAP = 99;

export const formatReactionCount = (count: number): string => (count > COUNT_CAP ? `+${COUNT_CAP}` : String(count));

export type ReactionChipSize = 'sm' | 'md';

export interface ReactionChipProps extends Omit<React.ComponentPropsWithoutRef<'button'>, 'children'> {
    emoji: string;
    count: number;
    mine?: boolean;
    size?: ReactionChipSize;
    selected?: boolean;
}

export const ReactionChip = React.forwardRef<HTMLButtonElement, ReactionChipProps>(
    ({ emoji, count, mine = false, size = 'sm', selected = false, className, ...props }, ref) => (
        <button
            ref={ref}
            type="button"
            aria-pressed={mine}
            className={cn(
                'relative flex shrink-0 select-none items-center justify-center rounded-full leading-normal transition-colors',
                size === 'sm' ? 'h-[26px] gap-1 px-2.5' : 'h-10 gap-1.5 px-2.5',
                mine
                    ? 'bg-main-accent/[0.06] border-main-accent'
                    : 'bg-input-border/[0.44] border-transparent active:bg-input-border/70',
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
