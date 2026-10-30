import { changeKindOf } from '../../lib/changeKindOf';

import type { Account, Plan } from '../../types';

/** Which of the plan picker's scenes the reader is in. */
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
    /** Picking this card leads somewhere (a first subscription, or a change). */
    pickable: boolean;
    /** Drawn as the highlighted card. */
    selected: boolean;
}

export interface PlanChoices {
    mode: PlansMode;
    cards: PlanChoice[];
    /** The plan a first subscription buys — the only pickable card before subscribing. */
    entry?: Plan;
    upgrade?: Plan;
    downgrade?: Plan;
}

/**
 * The plan picker's scene, read off `changeKindOf` so the page never re-derives which plan may be
 * picked. Before subscribing only the entry plan is offered; with a plan in force, the one step up
 * and the one step down; a store subscriber is offered nothing here.
 *
 * `account` is `null` for a visitor. `withTrial` says whether a first subscription would start with
 * the free trial; a visitor's answer is not known until they sign in, so the caller passes `true` —
 * the trial is what a first subscription normally comes with. `trialOffered` is whether there is a
 * trial at all: without one, nothing is said about it — not even that it was used. `canChange` is whether the plan in
 * force may be changed in its current state (the caller reads it off `sceneOf`): a subscription
 * awaiting payment, ending, or carrying a scheduled change has something else to settle first, and
 * offering it a change here would only lead to one the change page refuses.
 */
export const planChoicesOf = ({
    plans,
    current,
    account,
    withTrial,
    trialOffered = true,
    canChange = true,
}: {
    plans: Plan[];
    current: Plan | undefined;
    account: Account | null;
    withTrial: boolean;
    trialOffered?: boolean;
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
                    ? {
                          plan,
                          tag: withTrial ? 'firstTrial' : trialOffered ? 'trialUsed' : undefined,
                          pickable: true,
                          selected: true,
                      }
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
    // The step up is the suggestion when there is one, as an upgrade is the change most readers came for.
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
