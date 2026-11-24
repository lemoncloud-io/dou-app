import type { Account, Plan } from './types';

export type ChangeKind = 'new' | 'current' | 'upgrade' | 'downgrade' | 'blocked';

export const ENTRY_PLAN_SORT = 1;

export const changeKindOf = (current: Plan | undefined, target: Plan, account: Account | null): ChangeKind => {
    if (account && (account.billingSource === 'appStore' || account.billingSource === 'googlePlay')) return 'blocked';
    if (!current) return target.sort === ENTRY_PLAN_SORT ? 'new' : 'blocked';
    if (current.id === target.id) return 'current';
    const step = target.sort - current.sort;
    if (step === 1) return 'upgrade';
    if (step === -1) return 'downgrade';
    return 'blocked';
};
