import { type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
                'flex flex-col items-start gap-2 rounded-2xl border bg-card p-5 text-left transition-colors',
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
            <span className={cn('mt-2 text-2xl font-bold', disabled ? 'text-subtitle' : 'text-navy')}>
                {t('subscription.common.plan.perMonth', { price: formatMoney(plan.monthly, i18n.language) })}
            </span>
            <span className="text-xs text-subtitle">{t('subscription.common.plan.vatNote')}</span>
        </button>
    );
};
