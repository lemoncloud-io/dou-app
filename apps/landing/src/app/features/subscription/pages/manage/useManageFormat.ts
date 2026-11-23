import { useTranslation } from 'react-i18next';

import { usePlans } from '../../hooks';
import { formatDate, formatMoney } from '../../utils';
import { ddayParts, monthDay } from './manageModel';

import type { Money, PaymentMethod, Plan, PlanId } from '../../types';

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
