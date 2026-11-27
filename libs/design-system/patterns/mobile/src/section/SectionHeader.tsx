import * as React from 'react';

import { cn } from '@chatic/ui-kit';

export interface SectionHeaderProps {
    title: string;
    count?: number;
    actions?: React.ReactNode;
    onClick?: () => void;
    className?: string;
}

export const SectionHeader = ({ title, count, actions, onClick, className }: SectionHeaderProps) => {
    return (
        <div
            className={cn('flex h-11 w-full items-center justify-between px-4', onClick && 'cursor-pointer', className)}
            onClick={onClick}
        >
            <div className="flex items-center gap-1">
                <span className="text-[18px] font-semibold leading-[25px] tracking-[-0.09px] text-foreground">
                    {title}
                </span>
                {count != null && (
                    <span className="text-[18px] font-semibold leading-[25px] text-foreground">{count}</span>
                )}
            </div>
            {actions && (
                <div
                    className="flex items-center gap-3"
                    onClick={onClick ? event => event.stopPropagation() : undefined}
                >
                    {actions}
                </div>
            )}
        </div>
    );
};
