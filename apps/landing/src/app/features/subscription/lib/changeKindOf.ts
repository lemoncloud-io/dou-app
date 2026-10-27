import type { Account, Plan } from '../types';

/** What picking `target` would do, given the plan in force. */
export type ChangeKind = 'new' | 'current' | 'upgrade' | 'downgrade' | 'blocked';

/** Every subscription starts here. */
export const ENTRY_PLAN_SORT = 1;

/**
 * The same rule the app applies to its store plans, so a plan that is pickable in one is pickable in
 * the other.
 *
 * - With no subscription in force, only the entry plan can be bought: an allowance of several clouds
 *   arrives with a verification per cloud, and starting at the bottom keeps those one at a time.
 * - With one in force, only the plan directly above or below it: a jump of two would ask for two cloud
 *   verifications back to back on the way up, and on the way down there is no screen yet for
 *   releasing the clouds a multi-step drop would strand.
 * - An account billed by a store changes its plan in that store, never here.
 *
 * `current` is the plan of the live subscription; pass `undefined` when there is none (an expired one
 * counts as none — subscribing again starts at the entry plan).
 */
export const changeKindOf = (current: Plan | undefined, target: Plan, account: Account | null): ChangeKind => {
    if (account && (account.billingSource === 'appStore' || account.billingSource === 'googlePlay')) return 'blocked';
    if (!current) return target.sort === ENTRY_PLAN_SORT ? 'new' : 'blocked';
    if (current.id === target.id) return 'current';
    const step = target.sort - current.sort;
    if (step === 1) return 'upgrade';
    if (step === -1) return 'downgrade';
    return 'blocked';
};
