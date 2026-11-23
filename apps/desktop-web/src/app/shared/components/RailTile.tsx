import type { ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

interface RailTileProps {
    label: string;
    accessibleName?: string;
    active?: boolean;
    dot?: boolean;
    onClick: () => void;
    children: ReactNode;
}

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
