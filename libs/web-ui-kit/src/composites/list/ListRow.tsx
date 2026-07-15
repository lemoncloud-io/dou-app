import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface ListRowProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
    /** Leading slot (avatar / icon). */
    leading?: React.ReactNode;
    /** Primary text (or a node, e.g. name + StatusBadge). */
    title: React.ReactNode;
    /** Secondary text below the title. */
    subtitle?: React.ReactNode;
    /** Trailing slot (chevron / toggle / badge). */
    trailing?: React.ReactNode;
    /** Renders the title in the destructive color (e.g. 방 삭제). */
    destructive?: boolean;
    /** Makes the whole row a button. */
    onClick?: () => void;
    /** Disables the row button (only meaningful together with `onClick`). */
    disabled?: boolean;
    className?: string;
}

/**
 * Generic list / settings row — one component for the many similar rows in the
 * room-settings and menu screens: profile row, alarm toggle, member rows, and
 * destructive menu items. Leading/trailing are slots; the row is a button when
 * `onClick` is set. Stateless — a toggle passed as `trailing` is controlled by
 * the host. Extra props (aria-*, data-*, …) pass through to the root element.
 */
export const ListRow = ({
    leading,
    title,
    subtitle,
    trailing,
    destructive = false,
    onClick,
    disabled,
    className,
    ...props
}: ListRowProps) => {
    const Root = onClick ? 'button' : 'div';
    return (
        <Root
            {...props}
            {...(onClick ? { type: 'button' as const, onClick, disabled } : {})}
            className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left',
                onClick && 'active:bg-muted/50 disabled:opacity-50',
                className
            )}
        >
            {leading && <span className="flex shrink-0 items-center">{leading}</span>}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                    className={cn(
                        'flex items-center gap-1.5 truncate text-[16px] leading-[1.4] tracking-[-0.08px]',
                        destructive ? 'text-destructive' : 'text-foreground'
                    )}
                >
                    {title}
                </span>
                {subtitle && <span className="truncate text-[14px] leading-[1.4] text-description">{subtitle}</span>}
            </span>
            {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
        </Root>
    );
};
