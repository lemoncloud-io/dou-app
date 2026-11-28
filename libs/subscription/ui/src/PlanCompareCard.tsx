import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconBolt } from '@chatic/design-system-assets/icons';
import { PlanBadge } from '@chatic/design-system-components-mobile';

export interface PlanCompareCardProps {
    name: string;
    tier: 'free' | 'paid';
    tierLabel: string;
    headline: string;
    children: React.ReactNode;
    className?: string;
}

export const PlanCompareCard = ({ name, tier, tierLabel, headline, children, className }: PlanCompareCardProps) => {
    const isPaid = tier === 'paid';

    return (
        <div
            data-tier={tier}
            className={cn(
                'flex w-full flex-col',
                isPaid && 'rounded-2xl shadow-[0_0_8px_0_hsl(var(--primary)/0.16)]',
                className
            )}
        >
            <div className={cn('flex items-center rounded-t-2xl px-5 py-3.5', isPaid ? 'bg-primary' : 'bg-secondary')}>
                <span
                    className={cn(
                        'flex-1 text-[18px] font-bold leading-[1.35] tracking-[-0.09px]',
                        isPaid ? 'text-brand-ink' : 'text-foreground'
                    )}
                >
                    {name}
                </span>
            </div>
            <div
                className={cn(
                    'flex flex-col gap-4 rounded-b-2xl border-b border-l border-r bg-surface px-5 pb-6 pt-6',
                    isPaid ? 'border-[hsl(var(--primary)/0.24)]' : 'border-input-border'
                )}
            >
                <div className="flex flex-col items-start gap-3.5">
                    <PlanBadge
                        label={tierLabel}
                        accent={isPaid}
                        icon={isPaid ? <IconBolt className="size-4 text-foreground" /> : undefined}
                    />
                    <p className="text-[18px] font-bold leading-[1.35] tracking-[-0.09px] text-foreground">
                        {headline}
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
};
