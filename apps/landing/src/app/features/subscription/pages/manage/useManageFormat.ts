import { useTranslation } from 'react-i18next';

import { usePlans } from '../../hooks';
import { formatDate, formatMoney } from '../../utils';
import { ddayParts, monthDay } from './manageModel';

import type { Money, PaymentMethod, Plan, PlanId } from '../../types';

/**
 * The few ways the management screens print a value, bound to the reader's language. A value the
 * port leaves out prints as a dash rather than as an empty gap in a sentence.
 */
export const useManageFormat = () => {
    const { t, i18n } = useTranslation();
    const plans = usePlans();
    const none = t('subscription.manage.none');

    const planOf = (id: PlanId | undefined): Plan | undefined =>
        id ? plans.data?.find(plan => plan.id === id) : undefined;

    return {
        date: (iso: string | undefined): string => (iso ? formatDate(iso) : none),
        money: (money: Money | undefined): string => (money ? formatMoney(money, i18n.language) : none),
        dday: (dday: number | undefined): string => {
            if (dday === undefined) return none;
            const { key, count } = ddayParts(dday);
            return t(`subscription.manage.dday.${key}`, { count });
        },
        /** `11.02 · 11.04` — a list of days, e.g. the retries of a failed charge. */
        days: (isos: string[]): string => isos.map(monthDay).join(' · '),
        card: (pm: PaymentMethod): string => t('subscription.manage.cardLabel', { brand: pm.brand, last4: pm.last4 }),
        planOf,
        planName: (id: PlanId | undefined): string => {
            const plan = planOf(id);
            return plan ? t('subscription.common.planName', { sort: plan.sort }) : none;
        },
    };
};

export type ManageFormat = ReturnType<typeof useManageFormat>;
