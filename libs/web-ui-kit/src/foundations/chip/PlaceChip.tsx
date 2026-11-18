import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface PlaceChipProps {
    /** Place name. */
    name: string;
    /**
     * The 24px disc on the left. Omit it to draw the design's initial disc from `name`'s first
     * character; pass a node (e.g. a `PlaceAvatar` with a photo) to replace it.
     */
    avatar?: React.ReactNode;
    /** Unread messages in the place. `<= 0` hides the pill; above `max` → "+max". */
    unread?: number;
    max?: number;
    /** Whether this is the current place — the filled navy chip, the only one that shows its name. */
    selected?: boolean;
    /** Fired on tap. */
    onClick?: () => void;
    /** Accessible announcement for the unread pill (e.g. a localized "2 unread"). */
    unreadLabel?: string;
    className?: string;
}

/**
 * Place chip — one place in the home's horizontal place row (Figma "place chip" 5964:33635, icon
 * variant 6303:124): the current place is the navy chip with its disc, name and unread pill; every
 * other place folds down to its disc and pill on a light chip with a hairline. Becoming current
 * unfolds the name while the fill moves, so the row reads as one chip handing over to another.
 *
 * Stateless: the host decides which place is current and switches on `onClick`.
 */
export const PlaceChip = ({
    name,
    avatar,
    unread = 0,
    max = 999,
    selected = false,
    onClick,
    unreadLabel,
    className,
}: PlaceChipProps) => {
    const showUnread = unread > 0;
    const unreadText = unread > max ? `+${max}` : String(unread);
    const initial = Array.from(name.trim())[0] ?? '';
    // A folded chip with nothing but its disc is a 32px circle; a pill needs the wider right edge.
    const padding = selected || showUnread ? 'py-1 pl-1.5 pr-2' : 'p-1';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={showUnread ? `${name}, ${unreadLabel ?? unreadText}` : name}
            className={cn(
                // The hairline stays on the filled chip too (transparent), so the fill change does
                // not shift the row by a pixel mid-animation.
                'inline-flex max-w-[200px] shrink-0 items-center rounded-[20px] border-[0.5px]',
                'transition-[background-color,border-color,padding,transform] duration-300 ease-out active:scale-95 motion-reduce:transition-none',
                padding,
                selected ? 'border-transparent bg-chip-ink' : 'border-input-border bg-chip-surface',
                className
            )}
        >
            {avatar ?? (
                <span
                    aria-hidden
                    className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-[14px] tracking-[-0.22px]',
                        'transition-colors duration-300 motion-reduce:transition-none',
                        selected ? 'bg-tile-ring text-chip-ink' : 'bg-chip-ink text-white'
                    )}
                >
                    {initial}
                </span>
            )}
            {/*
             * The name stays mounted and folds to zero width, so it can unfold rather than pop in.
             * A grid track animating 0fr → 1fr sizes it to the text without measuring; the gap
             * before it lives inside the fold so a folded chip carries no empty slot.
             */}
            <span
                aria-hidden={!selected}
                data-testid="place-chip-name"
                className={cn(
                    'grid min-w-0 transition-[grid-template-columns,opacity] duration-300 ease-out motion-reduce:transition-none',
                    selected ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'
                )}
            >
                <span className="min-w-0 overflow-hidden">
                    {/*
                     * Sized by its own text (capped so a long name still ellipsizes at rest), not by
                     * the folding track — otherwise every frame of the unfold would show "Sun…".
                     */}
                    <span
                        className={cn(
                            'block w-max max-w-[118px] truncate pl-1.5 text-[13px] font-medium tracking-[-0.26px] transition-colors duration-300 motion-reduce:transition-none',
                            selected ? 'text-white' : 'text-foreground'
                        )}
                    >
                        {name}
                    </span>
                </span>
            </span>
            {showUnread && (
                <span
                    aria-hidden
                    className={cn(
                        'flex shrink-0 items-center justify-center rounded-full bg-point-pink px-1.5 py-[3px] text-[11px] font-semibold leading-[11px] tracking-[-0.11px] text-white',
                        'transition-[margin] duration-300 ease-out animate-in fade-in-0 zoom-in-75 motion-reduce:animate-none motion-reduce:transition-none',
                        selected ? 'ml-1.5' : 'ml-1'
                    )}
                >
                    {unreadText}
                </span>
            )}
        </button>
    );
};
