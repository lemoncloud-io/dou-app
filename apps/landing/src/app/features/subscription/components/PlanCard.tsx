import { type JSX, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import radioChecked from '../../../../assets/subscription/radio-checked.svg';
import radioUnchecked from '../../../../assets/subscription/radio-unchecked.svg';
import { cn, formatMoney } from '../utils';

import type { Plan } from '../types';

/**
 * One plan as the plan picker draws it: name, cloud allowance, monthly price, and a radio on the
 * right. Selection and the tag above the name (`첫 구독 · 7일 무료`, `구독 후 변경`, …) are the
 * caller's — this card knows no rules. A plan that cannot be picked sits back, pale and dimmed.
 */
export const PlanCard = ({
    plan,
    tag,
    selected = false,
    disabled = false,
    onSelect,
}: {
    plan: Plan;
    tag?: ReactNode;
    selected?: boolean;
    disabled?: boolean;
    onSelect?: () => void;
}): JSX.Element => {
    const { t, i18n } = useTranslation();
    return (
        <button
            type="button"
            onClick={onSelect}
            disabled={disabled || !onSelect}
            aria-pressed={selected}
            className={cn(
                // min-w-0: a grid cell otherwise grows to the widest unbreakable line inside it.
                'flex w-full min-w-0 items-center gap-2 rounded-[20px] border py-4 pl-5 pr-4 text-left transition-colors',
                disabled ? 'border-[#eaeaec] bg-surface opacity-[0.52]' : 'border-line bg-card',
                onSelect && !disabled && !selected && 'hover:border-navy/40'
            )}
        >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
                {tag && <span>{tag}</span>}
                <span className="text-lg font-semibold leading-[1.4] text-[#222325]">
                    {t('subscription.common.planName', { sort: plan.sort })}
                </span>
                <span className="flex flex-col gap-0.5 font-medium leading-[1.4] md:gap-1.5">
                    {/* Amount and note share a line on a phone card, where the card is wide and short, and stack
                        in the narrower desktop columns. */}
                    <span className="flex flex-col min-[375px]:max-md:flex-row min-[375px]:max-md:items-center min-[375px]:max-md:gap-1">
                        <Trans
                            i18nKey="subscription.common.plan.perMonth"
                            values={{ price: formatMoney(plan.monthly, i18n.language) }}
                            components={{ price: <span className="text-base text-[#222325]" /> }}
                        />
                        <span className="text-sm text-mute">{t('subscription.common.plan.vatNote')}</span>
                    </span>
                    <span className="text-[13px] text-subtitle">
                        {t('subscription.common.plan.clouds', { count: plan.maxClouds })}
                    </span>
                </span>
            </span>
            <img src={selected ? radioChecked : radioUnchecked} alt="" aria-hidden className="size-[25px] shrink-0" />
        </button>
    );
};
