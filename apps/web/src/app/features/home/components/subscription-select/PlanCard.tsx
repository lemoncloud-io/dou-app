import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

interface PlanCardProps {
    product: ProductView;
    isSelected: boolean;
    isBlocked: boolean;
    isKo: boolean;
    onSelect: (product: ProductView) => void;
}

export const PlanCard = ({ product, isSelected, isBlocked, isKo, onSelect }: PlanCardProps) => {
    const { t } = useTranslation();
    const hasTrial = (product.trialDays ?? 0) > 0;
    const description = isKo ? product.desc : (product.descEn ?? product.desc);
    const displayName = isKo ? (product.name ?? product.id) : (product.nameEn ?? product.name ?? product.id);

    return (
        <button
            onClick={() => !isBlocked && onSelect(product)}
            disabled={isBlocked}
            className={cn(
                'flex w-full items-center gap-[3px] rounded-[20px] border bg-white px-4 py-3 text-left shadow-[0px_2px_14px_0px_rgba(0,0,0,0.08)] transition-colors dark:bg-card',
                isSelected ? 'border-[#B0EA10]' : 'border-[#F4F5F5]',
                isBlocked && 'opacity-60'
            )}
        >
            <div className="flex flex-1 flex-col gap-[4px]">
                <div className="flex items-center gap-2">
                    <span className="text-[18px] font-semibold leading-[1.29] tracking-[-0.015em] text-[#222325] dark:text-foreground">
                        {displayName}
                    </span>
                    {hasTrial && (
                        <span className="rounded-full bg-[#B0EA10] px-2 py-0.5 text-[11px] font-semibold text-[#222325]">
                            {product.trialDays}d Free
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-[13px] leading-[1.4] tracking-[-0.02em] text-[#78828A]">{description}</p>
                )}
                {product.price != null && (
                    <span className="text-[14px] font-medium text-[#222325] dark:text-foreground">
                        {t('mypage.subscription.pricePerMonth', { price: `$${product.price}` })}
                        <span className="ml-1 text-[12px] text-[#78828A]">{t('mypage.subscription.vatIncluded')}</span>
                    </span>
                )}
            </div>
            <div className="flex h-[25px] w-[25px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[#CFD0D3]">
                {isSelected && <div className="h-[13px] w-[13px] rounded-full bg-[#B0EA10]" />}
            </div>
        </button>
    );
};
