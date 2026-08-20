import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { formatPlanPrice, planDisplayName } from '../../lib';

interface PlanCardProps {
    product: ProductView;
    isSelected: boolean;
    /** A purchase is in flight — the only state that actually swallows a tap. */
    isBlocked: boolean;
    isKo: boolean;
    /** The plan the user is already subscribed to. */
    isCurrent?: boolean;
    /** Why this tier cannot be picked (tier jump). Shown in place of a silent disabled card. */
    disabledReason?: string;
    /** Whether the tier can be picked at all. An unpickable one still reports its tap (see below). */
    isSelectable?: boolean;
    /** The store's localized price. Absent off-native, where nothing can be bought. */
    displayPrice?: string;
    /** Raised on every tap, pickable or not — the caller decides between selecting and explaining. */
    onSelect: (product: ProductView) => void;
}

/**
 * One tier in the plan picker: name, price with the VAT note, and how many clouds it allows.
 *
 * A blocked tier stays visible with its reason rather than disappearing — the plan is to tell the
 * user why, not to make the option vanish. It also stays TAPPABLE: an HTML-disabled card fires no
 * event at all, so the reason printed under it was the only explanation anyone got, and a tap that
 * does nothing reads as a broken button. The tap goes up to the caller, which answers with the
 * refusal dialog (`TierRefusalDialog`). Only a purchase in flight really disables the card.
 */
export const PlanCard = ({
    product,
    isSelected,
    isBlocked,
    isKo,
    isCurrent = false,
    disabledReason,
    isSelectable = true,
    displayPrice,
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
            // Greyed out and announced as unavailable, but still reachable: `aria-disabled` keeps the
            // tap (and the explanation it opens), where `disabled` would drop both.
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
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                            {t('mypage.subscription.currentBadge')}
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

            {/* Radio — filled ring when selected, hollow otherwise (Figma "Component 19"). */}
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
