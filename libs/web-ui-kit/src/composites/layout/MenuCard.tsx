import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface MenuCardProps {
    /** Rows composed into the card (e.g. ListRow items). */
    children: React.ReactNode;
    className?: string;
}

/**
 * Rounded menu card — the Figma "My" settings card that groups a stack of rows on
 * a raised surface. A container only: compose ListRow (or toggle rows) as
 * children. Differs from ListSection, which is a titled list with no card
 * surface. Dark mode swaps the soft shadow for a hairline border.
 */
export const MenuCard = ({ children, className }: MenuCardProps) => {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
                className
            )}
        >
            {children}
        </div>
    );
};
