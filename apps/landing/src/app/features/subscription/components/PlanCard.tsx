import { type JSX, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { cn, formatMoney } from '../utils';

import type { Plan } from '../types';

/**
 * One plan as the plan picker draws it: name, cloud allowance, monthly price. Selection and the tag
 * above the name (`첫 구독 · 7일 무료`, `구독 후 변경`, …) are the caller's — this card knows no rules.
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
                'flex w-full min-w-0 flex-col items-start gap-2 rounded-2xl border bg-card p-5 text-left transition-colors',
                selected ? 'border-2 border-main-green' : 'border-border',
                disabled && 'text-subtitle',
                onSelect && !disabled && 'hover:border-navy/40'
            )}
        >
            <span className="min-h-[24px]">{tag}</span>
            <span className={cn('text-lg font-semibold', disabled ? 'text-subtitle' : 'text-navy')}>
                {t('subscription.common.planName', { sort: plan.sort })}
            </span>
            <span className="text-sm text-subtitle">
                {t('subscription.common.plan.clouds', { count: plan.maxClouds })}
            </span>
            {/* The copy decides what is large: the whole "월 ₩8,600" in Korean, only the amount in English,
                where "₩43,000/month" at full size is wider than a five-column card. */}
            <span className={cn('mt-2 text-sm', disabled ? 'text-subtitle' : 'text-desc-alt')}>
                <Trans
                    i18nKey="subscription.common.plan.perMonth"
                    values={{ price: formatMoney(plan.monthly, i18n.language) }}
                    components={{
                        price: <span className={cn('text-2xl font-bold', disabled ? 'text-subtitle' : 'text-navy')} />,
                    }}
                />
            </span>
            <span className="text-xs text-subtitle">{t('subscription.common.plan.vatNote')}</span>
        </button>
    );
};
