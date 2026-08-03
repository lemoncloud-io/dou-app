import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';
import { PlanBadge } from '@chatic/web-ui-kit';

interface PlanCompareCardProps {
    /** Card header label ("DoU Home" / "내 클라우드"). */
    name: string;
    /** Tier shown in the badge; `pro` gets the accent (lime) outline and header. */
    tier: 'free' | 'pro';
    /** Badge label — comes from the host so it stays localizable. */
    tierLabel: string;
    /** One-line pitch under the badge. */
    headline: string;
    /** Bullet list (GuideBulletList) plus, for PRO, the app preview. */
    children: ReactNode;
}

/**
 * One plan column of the cloud guide (Figma 3519-29629 / 3519-29689): a tinted header strip above a
 * bordered white body holding the tier badge, a headline and a bullet list.
 */
export const PlanCompareCard = ({ name, tier, tierLabel, headline, children }: PlanCompareCardProps) => {
    const isPro = tier === 'pro';

    return (
        // data-tier: lets tests (and future styling) key off the tier without asserting on classes.
        <div data-tier={tier} className="flex w-full flex-col">
            <div className={cn('flex items-center rounded-t-2xl px-5 py-3.5', isPro ? 'bg-primary' : 'bg-secondary')}>
                <span className="flex-1 text-[18px] font-bold leading-[1.35] tracking-[-0.09px] text-foreground">
                    {name}
                </span>
            </div>
            <div
                className={cn(
                    'flex flex-col gap-4 rounded-b-2xl border-b border-l border-r bg-surface px-5 pb-6 pt-6',
                    isPro ? 'border-primary' : 'border-input-border'
                )}
            >
                <div className="flex flex-col items-start gap-3.5">
                    <PlanBadge label={tierLabel} accent={isPro} />
                    <p className="text-[18px] font-bold leading-[1.35] tracking-[-0.09px] text-foreground">
                        {headline}
                    </p>
                </div>
                {children}
            </div>
        </div>
    );
};
