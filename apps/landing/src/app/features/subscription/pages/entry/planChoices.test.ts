import { MOCK_PLANS } from '../../lib/mock/policy';
import { planChoicesOf } from './planChoices';

import type { Account, Plan } from '../../types';

const account = (patch: Partial<Account> = {}): Account => ({
    id: 'acc-1',
    provider: 'google',
    email: 'reader@example.com',
    billingSource: 'none',
    trialUsed: false,
    ...patch,
});

const plan = (sort: number): Plan => MOCK_PLANS.find(p => p.sort === sort) as Plan;
const tags = (choices: ReturnType<typeof planChoicesOf>) => choices.cards.map(c => c.tag);

describe('planChoicesOf', () => {
    it('tags the entry plan with nothing about a trial when none is offered', () => {
        const signedIn = { id: 'a', provider: 'google', billingSource: 'none', trialUsed: true } as Account;
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: undefined,
            account: signedIn,
            withTrial: false,
            trialOffered: false,
        });
        expect(choices.cards[0].tag).toBeUndefined();
        expect(
            planChoicesOf({ plans: MOCK_PLANS, current: undefined, account: signedIn, withTrial: false }).cards[0].tag
        ).toBe('trialUsed');
    });

    it('offers a visitor the entry plan only, with the trial', () => {
        const choices = planChoicesOf({ plans: MOCK_PLANS, current: undefined, account: null, withTrial: true });

        expect(choices.mode).toBe('visitor');
        expect(choices.entry?.sort).toBe(1);
        expect(tags(choices)).toEqual([
            'firstTrial',
            'afterSubscribe',
            'afterSubscribe',
            'afterSubscribe',
            'afterSubscribe',
        ]);
        expect(choices.cards.map(c => c.pickable)).toEqual([true, false, false, false, false]);
        expect(choices.cards.map(c => c.selected)).toEqual([true, false, false, false, false]);
    });

    it('marks the entry plan as trial used for a signed-in reader without a trial', () => {
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: undefined,
            account: account({ trialUsed: true }),
            withTrial: false,
        });

        expect(choices.mode).toBe('new');
        expect(choices.cards[0].tag).toBe('trialUsed');
    });

    it('offers a subscriber the step up and the step down, suggesting the step up', () => {
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: plan(2),
            account: account({ billingSource: 'web', trialUsed: true }),
            withTrial: false,
        });

        expect(choices.mode).toBe('change');
        expect(choices.upgrade?.sort).toBe(3);
        expect(choices.downgrade?.sort).toBe(1);
        expect(tags(choices)).toEqual(['downgrade', 'current', 'upgrade', 'adjacentOnly', 'adjacentOnly']);
        expect(choices.cards.map(c => c.pickable)).toEqual([true, false, true, false, false]);
        expect(choices.cards.find(c => c.selected)?.plan.sort).toBe(3);
    });

    it('suggests the step down when the top plan is in force', () => {
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: plan(5),
            account: account({ billingSource: 'web' }),
            withTrial: false,
        });

        expect(choices.upgrade).toBeUndefined();
        expect(choices.cards.find(c => c.selected)?.plan.sort).toBe(4);
    });

    it('offers nothing to pick when the plan in force cannot change now', () => {
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: plan(2),
            account: account({ billingSource: 'web', trialUsed: true }),
            withTrial: false,
            canChange: false,
        });

        expect(choices.mode).toBe('changeUnavailable');
        expect(choices.upgrade).toBeUndefined();
        expect(choices.downgrade).toBeUndefined();
        expect(tags(choices)).toEqual([undefined, 'current', undefined, undefined, undefined]);
        expect(choices.cards.some(c => c.pickable || c.selected)).toBe(false);
    });

    it('offers a store subscriber nothing', () => {
        const choices = planChoicesOf({
            plans: MOCK_PLANS,
            current: undefined,
            account: account({ billingSource: 'appStore' }),
            withTrial: false,
        });

        expect(choices.mode).toBe('storeBilled');
        expect(choices.entry).toBeUndefined();
        expect(choices.cards.every(c => !c.pickable && !c.selected && !c.tag)).toBe(true);
    });

    it('draws the cards in plan order whatever order the port returns', () => {
        const choices = planChoicesOf({
            plans: [...MOCK_PLANS].reverse(),
            current: undefined,
            account: null,
            withTrial: true,
        });

        expect(choices.cards.map(c => c.plan.sort)).toEqual([1, 2, 3, 4, 5]);
    });
});
