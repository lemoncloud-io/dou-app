import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconBolt } from '../../resources/icons';
import { PlanBadge } from '../../foundations/badge/PlanBadge';

export interface PlanCompareCardProps {
    /** Header label ("DoU Home" / "내 클라우드"). */
    name: string;
    /** `paid` gets the lime header, the lime hairline border and a lime glow. */
    tier: 'free' | 'paid';
    /** Badge label — supplied by the host so it stays localizable. */
    tierLabel: string;
    /** One-line pitch under the badge. */
    headline: string;
    /** Bullet list (PlanBulletList) and, on the paid card, a product preview. */
    children: React.ReactNode;
    className?: string;
}

/**
 * One plan column of the subscription comparison (Figma 3519-29629 free / 3519-29689 paid): a tinted
 * header strip above a bordered body holding the tier badge, a headline and a bullet list.
 *
 * The paid card is distinguished three ways, all keyed off the brand lime (`--primary`): a solid
 * header, a 24%-alpha hairline border, and a soft outer glow. Alpha comes from
 * `hsl(var(--primary)/…)` rather than a literal rgba so the colour still tracks the token.
 */
export const PlanCompareCard = ({ name, tier, tierLabel, headline, children, className }: PlanCompareCardProps) => {
    const isPaid = tier === 'paid';

    return (
        // data-tier: lets tests and hosts key off the tier without asserting on utility classes.
        <div
            data-tier={tier}
            className={cn(
                'flex w-full flex-col',
                isPaid && 'rounded-2xl shadow-[0_0_8px_0_hsl(var(--primary)/0.16)]',
                className
            )}
        >
            <div className={cn('flex items-center rounded-t-2xl px-5 py-3.5', isPaid ? 'bg-primary' : 'bg-secondary')}>
                {/* brand-ink is the same navy in light and dark, so it is only safe over the lime
                    fill. The neutral header follows the theme. */}
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
