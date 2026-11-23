import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { formatPlanPrice, planDisplayName } from '../../lib';

interface PlanCardProps {
    product: ProductView;
    isSelected: boolean;
    isBlocked: boolean;
    isKo: boolean;
    isCurrent?: boolean;
    disabledReason?: string;
    isSelectable?: boolean;
    displayPrice?: string;
    trialDays?: number;
    onSelect: (product: ProductView) => void;
}

export const PlanCard = ({
    product,
    isSelected,
    isBlocked,
    isKo,
    isCurrent = false,
    disabledReason,
    isSelectable = true,
    displayPrice,
    trialDays = 0,
    onSelect,
}: PlanCardProps) => {
    const { t } = useTranslation();
    const displayName = planDisplayName(product, isKo);
    const isUnavailable = !isSelectable || isCurrent || !!disabledReason;
    const price = formatPlanPrice(displayPrice);

    return (
        <button
            onClick={() => !isBlocked && onSelect(product)}
            disabled={isBlocked}
            aria-disabled={isUnavailable}
            className={cn(
                'flex w-full items-center gap-3 rounded-[16px] border-2 bg-card px-4 py-3 text-left transition-colors',
                isSelected ? 'border-[#B0EA10]' : 'border-[#F4F5F5] dark:border-border',
                isUnavailable && 'opacity-60'
            )}
        >
            <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[17px] font-semibold leading-[1.35] tracking-[-0.015em] text-foreground">
                        {displayName}
                    </span>
                    {isCurrent && (
                        <span className="shrink-0 text-[15px] font-semibold text-point-blue">
                            {t('mypage.subscription.state.active')}
                        </span>
                    )}
                    {trialDays > 0 && !isCurrent && (
                        <span className="shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[12px] font-semibold text-main-accent">
                            {t('mypage.subscription.trialBadge', { days: trialDays })}
                        </span>
                    )}
                </div>

                {price && (
                    <div className="flex items-baseline gap-1">
                        <span className="text-[17px] font-semibold leading-[1.4] tracking-[-0.02em] text-foreground">
                            {t('mypage.subscription.pricePerMonth', { price })}
                        </span>
                        <span className="text-[14px] leading-[1.5] text-[#78828A]">
                            {t('mypage.subscription.vatIncluded')}
                        </span>
                    </div>
                )}

                {product.maxClouds != null && (
                    <span className="text-[14px] leading-[1.5] tracking-[-0.02em] text-[#78828A]">
                        {t('mypage.subscription.maxClouds', { count: product.maxClouds })}
                    </span>
                )}

                {disabledReason && (
                    <span className="text-[13px] leading-[1.5] text-muted-foreground">{disabledReason}</span>
                )}
            </div>

            <span
                className={cn(
                    'flex size-[25px] shrink-0 items-center justify-center rounded-full border-2',
                    isSelected ? 'border-[#B0EA10]' : 'border-[#CFD0D3]'
                )}
            >
                {isSelected && <span className="size-[13px] rounded-full bg-[#B0EA10]" />}
            </span>
        </button>
    );
};
