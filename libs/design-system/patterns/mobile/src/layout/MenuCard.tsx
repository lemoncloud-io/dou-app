import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface MenuCardProps {
    title?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const MenuCard = ({ title, children, className }: MenuCardProps) => {
    return (
        <div
            className={cn(
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
