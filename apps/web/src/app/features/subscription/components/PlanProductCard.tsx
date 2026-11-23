import { useTranslation } from 'react-i18next';

import { IconBoltSolid, PlanBadge, ProductCard, type ProductStatusTone } from '@chatic/web-ui-kit';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { planDisplayName } from '../lib';

interface PlanProductCardProps {
    plan: ProductView | undefined;
    fallbackName?: string;
    statusLabel?: string;
    statusTone?: ProductStatusTone;
    entitled?: boolean;
    onClick?: () => void;
    children?: React.ReactNode;
}

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
