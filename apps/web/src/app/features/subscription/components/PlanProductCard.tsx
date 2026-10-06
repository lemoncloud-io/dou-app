import { useTranslation } from 'react-i18next';

import { IconBoltSolid, PlanBadge, ProductCard, type ProductStatusTone } from '@chatic/web-ui-kit';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { planDisplayName } from '../lib';

interface PlanProductCardProps {
    plan: ProductView | undefined;
    /** Shown when the catalog join failed — the raw id rather than nothing, so the failure is visible. */
    fallbackName?: string;
    statusLabel?: string;
    statusTone?: ProductStatusTone;
    /**
     * Whether the allowance line reads as the plan's or as zero. A lapsed plan holds no allowance, so
     * printing its tier figure would claim a limit the user does not have.
     */
    entitled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
}

/**
 * One plan as the subscription screens draw it: the PRO badge, the plan name, a status word and the
 * allowance line. Every screen in the flow shows a plan this way, so the badge and the allowance
 * rule live here once.
 *
 * The allowance line is the design's "N clouds can be created" slot, worded with the product's own
 * unit — the subscription sells account slots, one cloud each.
 */
export const PlanProductCard = ({
    plan,
    fallbackName,
    statusLabel,
    statusTone,
    entitled = true,
    onClick,
    children,
}: PlanProductCardProps) => {
    const { t, i18n } = useTranslation();
    const name = planDisplayName(plan, i18n.language.startsWith('ko')) ?? fallbackName ?? '-';

    return (
        <ProductCard
            name={name}
            badge={<PlanBadge label="PRO" accent icon={<IconBoltSolid className="size-4" />} />}
            statusLabel={statusLabel}
            statusTone={statusTone}
            caption={
                plan?.maxClouds != null
                    ? t('mypage.subscription.maxClouds', { count: entitled ? plan.maxClouds : 0 })
                    : undefined
            }
            onClick={onClick}
        >
            {children}
        </ProductCard>
    );
};
