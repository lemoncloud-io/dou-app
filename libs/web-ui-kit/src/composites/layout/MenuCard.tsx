import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface MenuCardProps {
    /** Optional small grey section header rendered above the rows, inside the card. */
    title?: React.ReactNode;
    /** Rows composed into the card (e.g. ListRow items). */
    children: React.ReactNode;
    className?: string;
}

/**
 * Rounded menu card — the Figma "My" settings card that groups a stack of rows on
 * a raised surface. A container only: compose ListRow (or toggle rows) as
 * children. Pass `title` to label the group with the Figma section header.
 * Differs from ListSection, which is a titled list with no card surface. Dark
 * mode swaps the soft shadow for a hairline border.
 */
export const MenuCard = ({ title, children, className }: MenuCardProps) => {
    return (
        <div
            className={cn(
                // shrink-0: the card is often a flex child of a scrolling column, where the default
                // flex-shrink would compress and clip its rows instead of letting the column scroll.
                'shrink-0',
                'overflow-hidden rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none',
                className
            )}
        >
            {title && (
                <div className="py-2 pl-4 pr-3 text-[14px] leading-[1.4] tracking-[-0.07px] text-description">
                    {title}
                </div>
            )}
            {children}
        </div>
    );
};
