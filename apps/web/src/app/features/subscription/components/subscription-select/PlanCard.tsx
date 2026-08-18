import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { planDisplayName } from '../../lib';

interface PlanCardProps {
    product: ProductView;
    isSelected: boolean;
    isBlocked: boolean;
    isKo: boolean;
    /** The plan the user is already subscribed to. */
    isCurrent?: boolean;
    /** Why this tier cannot be picked (tier jump). Shown in place of a silent disabled card. */
    disabledReason?: string;
    onSelect: (product: ProductView) => void;
}

/**
 * One tier in the plan picker, shared by the plans page and the home subscribe sheet.
 *
 * A blocked tier stays visible with its reason rather than disappearing — the plan is to tell the
 * user why, not to make the option vanish.
 */
export const PlanCard = ({
    product,
    isSelected,
    isBlocked,
    isKo,
    isCurrent = false,
    disabledReason,
    onSelect,
}: PlanCardProps) => {
    const { t } = useTranslation();
    const hasTrial = (product.trialDays ?? 0) > 0;
    const description = isKo ? product.desc : (product.descEn ?? product.desc);
    const displayName = planDisplayName(product, isKo);
    const isDisabled = isBlocked || isCurrent || !!disabledReason;

    return (
        <button
            onClick={() => !isDisabled && onSelect(product)}
            disabled={isDisabled}
            className={cn(
                'flex w-full items-center gap-[3px] rounded-[20px] border bg-white px-4 py-3 text-left shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] transition-colors dark:bg-card',
                isSelected ? 'border-[#B0EA10]' : 'border-[#F4F5F5]',
                isDisabled && 'opacity-60'
            )}
        >
            <div className="flex flex-1 flex-col gap-[4px]">
                <div className="flex items-center gap-2">
                    <span className="text-[18px] font-semibold leading-[1.29] tracking-[-0.015em] text-[#222325] dark:text-foreground">
                        {displayName}
                    </span>
                    {hasTrial && (
                        <span className="rounded-full bg-[#B0EA10] px-2 py-0.5 text-[11px] font-semibold text-[#222325]">
                            {t('mypage.subscription.trialBadge', { days: product.trialDays })}
                        </span>
                    )}
                    {isCurrent && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {t('mypage.subscription.currentBadge')}
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-[13px] leading-[1.4] tracking-[-0.02em] text-[#78828A]">{description}</p>
                )}
                <div className="flex flex-col gap-[1px]">
                    {product.price != null && (
                        <div className="flex items-center gap-1">
                            <span className="text-[16px] font-medium leading-[1.5] tracking-[-0.02em] text-[#222325] dark:text-foreground">
                                {t('mypage.subscription.pricePerMonth', { price: `$${product.price}` })}
                            </span>
                            <span className="text-[14px] leading-[1.5] tracking-[-0.02em] text-[#78828A]">
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
                        <span className="text-[13px] leading-[1.5] tracking-[-0.02em] text-muted-foreground">
                            {disabledReason}
                        </span>
                    )}
                </div>
            </div>
            <div className="flex h-[25px] w-[25px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[#CFD0D3]">
                {isSelected && <div className="h-[13px] w-[13px] rounded-full bg-[#B0EA10]" />}
            </div>
        </button>
    );
};
