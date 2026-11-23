import { changeKindOf } from '../../lib/changeKindOf';

import type { Account, Plan } from '../../types';

export type PlansMode = 'visitor' | 'new' | 'change' | 'changeUnavailable' | 'storeBilled';

export type PlanTag =
    | 'firstTrial'
    | 'trialUsed'
    | 'afterSubscribe'
    | 'current'
    | 'upgrade'
    | 'downgrade'
    | 'adjacentOnly';

export interface PlanChoice {
    plan: Plan;
    tag?: PlanTag;
    pickable: boolean;
    selected: boolean;
}

export interface PlanChoices {
    mode: PlansMode;
    cards: PlanChoice[];
    entry?: Plan;
    upgrade?: Plan;
    downgrade?: Plan;
}

export const planChoicesOf = ({
    plans,
    current,
    account,
    withTrial,
    canChange = true,
}: {
    plans: Plan[];
    current: Plan | undefined;
    account: Account | null;
    withTrial: boolean;
    canChange?: boolean;
}): PlanChoices => {
    const sorted = [...plans].sort((a, b) => a.sort - b.sort);
    const kinds = sorted.map(plan => ({ plan, kind: changeKindOf(current, plan, account) }));

    if (account && (account.billingSource === 'appStore' || account.billingSource === 'googlePlay')) {
        return {
            mode: 'storeBilled',
            cards: sorted.map(plan => ({ plan, pickable: false, selected: false })),
        };
    }

    if (!current) {
        const entry = kinds.find(k => k.kind === 'new')?.plan;
        return {
            mode: account ? 'new' : 'visitor',
            entry,
            cards: kinds.map(({ plan, kind }) =>
                kind === 'new'
                    ? { plan, tag: withTrial ? 'firstTrial' : 'trialUsed', pickable: true, selected: true }
                    : { plan, tag: 'afterSubscribe', pickable: false, selected: false }
            ),
        };
    }

    if (!canChange) {
        return {
            mode: 'changeUnavailable',
            cards: kinds.map(({ plan, kind }) =>
                kind === 'current'
                    ? { plan, tag: 'current', pickable: false, selected: false }
                    : { plan, pickable: false, selected: false }
            ),
        };
    }

    const upgrade = kinds.find(k => k.kind === 'upgrade')?.plan;
    const downgrade = kinds.find(k => k.kind === 'downgrade')?.plan;
    const suggested = upgrade ?? downgrade;
    return {
        mode: 'change',
        upgrade,
        downgrade,
        cards: kinds.map(({ plan, kind }) => {
            if (kind === 'current') return { plan, tag: 'current', pickable: false, selected: false };
            if (kind === 'upgrade' || kind === 'downgrade') {
                return { plan, tag: kind, pickable: true, selected: plan.id === suggested?.id };
            }
            return { plan, tag: 'adjacentOnly', pickable: false, selected: false };
        }),
    };
};
