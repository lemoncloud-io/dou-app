import type { ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

interface RailTileProps {
    /** The word under the tile. */
    label: string;
    /** What a screen reader says, when it must say more than the label (an unread dot, for one). */
    accessibleName?: string;
    /** The open destination: filled tile, bold label, `aria-current="page"`. */
    active?: boolean;
    /** A red dot in the tile's corner. */
    dot?: boolean;
    onClick: () => void;
    /** The glyph drawn in the tile, sized by the caller. */
    children: ReactNode;
}

/**
 * One tile of the nav rail: a 44px icon box with its label under it. The rail's destinations draw it,
 * and so does an action placed on the rail (the mini app button), so both look the same.
 */
export const RailTile = ({ label, accessibleName, active = false, dot = false, onClick, children }: RailTileProps) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={accessibleName ?? label}
        aria-current={active ? 'page' : undefined}
        className="group flex flex-col items-center gap-1 rounded-lg focus-ring"
    >
        <span
            className={cn(
                'relative flex h-11 w-11 items-center justify-center rounded-xl text-rail-foreground transition-colors duration-150 ease-tactile tactile',
                // Light mode takes the palette's tile; dark mode keeps its lime tint.
                active
                    ? 'bg-rail-active text-rail-active-foreground dark:bg-primary/[0.24] dark:text-rail-foreground'
                    : 'group-hover:bg-accent'
            )}
        >
            {children}
            {dot && (
                <span className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-badge-unread" />
            )}
        </span>
        <span
            aria-hidden
            className={cn(
                'text-micro leading-tight',
                active ? 'font-bold text-foreground' : 'font-medium text-rail-foreground'
            )}
        >
            {label}
        </span>
    </button>
);
