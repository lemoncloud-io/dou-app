import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface BenefitItemProps {
    /** 32px leading icon node. */
    icon?: React.ReactNode;
    /** Benefit title. */
    title: string;
    /** Supporting description below the title. */
    description?: string;
    className?: string;
}

/**
 * Subscription benefit row — the Figma "구독 혜택" item: a leading icon with a
 * title, and a description line beneath.
 */
export const BenefitItem = ({ icon, title, description, className }: BenefitItemProps) => {
    return (
        <div className={cn('flex w-full flex-col gap-0.5 px-4', className)}>
            <div className="flex items-center gap-1">
                {icon && <span className="flex size-8 shrink-0 items-center justify-center">{icon}</span>}
                <span className="text-[16px] font-semibold leading-[23px] tracking-[-0.08px] text-foreground">
                    {title}
                </span>
            </div>
            {description && (
                <p className="pl-1.5 text-[14px] leading-6 tracking-[-0.07px] text-description">{description}</p>
            )}
        </div>
    );
};
