import * as React from 'react';

import { cn } from '@chatic/lib/utils';

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
    /** Whether this is the current place — the filled navy chip. */
    selected?: boolean;
    /** Fired on tap. */
    onClick?: () => void;
    /** Accessible announcement for the unread pill (e.g. a localized "2 unread"). */
    unreadLabel?: string;
    className?: string;
}

/**
 * Place chip — one place in the home's horizontal place row (Figma "place chip" 5964:33635): an
 * initial disc, the name and an unread pill. The current place is the navy chip with white text;
 * the others sit on a light chip with a hairline.
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
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={showUnread ? `${name}, ${unreadLabel ?? unreadText}` : name}
            className={cn(
                'inline-flex max-w-[200px] shrink-0 items-center gap-1.5 rounded-[20px] py-1 pl-1.5 pr-2',
                'transition-[background-color,color,transform] duration-200 active:scale-95 motion-reduce:transition-none',
                selected ? 'bg-chip-ink' : 'border-[0.5px] border-input-border bg-chip-surface',
                className
            )}
        >
            {avatar ?? (
                <span
                    aria-hidden
                    className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-[14px] tracking-[-0.22px]',
                        selected ? 'bg-tile-ring text-chip-ink' : 'bg-chip-ink text-white'
                    )}
                >
                    {initial}
                </span>
            )}
            <span
                className={cn(
                    'truncate text-[13px] font-medium tracking-[-0.26px]',
                    selected ? 'text-white' : 'text-foreground'
                )}
            >
                {name}
            </span>
            {showUnread && (
                <span
                    aria-hidden
                    className="flex shrink-0 items-center justify-center rounded-full bg-point-pink px-1.5 py-[3px] text-[11px] font-semibold leading-[11px] tracking-[-0.11px] text-white duration-200 animate-in fade-in-0 zoom-in-75 motion-reduce:animate-none"
                >
                    {unreadText}
                </span>
            )}
        </button>
    );
};
