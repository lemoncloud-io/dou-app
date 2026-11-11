import type { SandboxQuery } from './createHttpPort';
import type { runtime } from '@chatic/app-runtime';

/**
 * The HTTP port hands the sandbox query to the runtime's subscription repository. A repository method
 * with fewer parameters would still satisfy the port's own `SubscriptionApi`, and drop the query without
 * a word — so these check, at compile time, that each payer-scoped method really takes it.
 */
type Repository = ReturnType<typeof runtime.data.useRuntimeRepositories>['subscription'];
type Takes<F, I extends number> = F extends (...args: infer A) => unknown
    ? SandboxQuery extends NonNullable<A[I]>
        ? true
        : false
    : false;

const checks: Record<string, true> = {
    fetchSubscriptionCards: true as Takes<Repository['fetchSubscriptionCards'], 0>,
    issueBillingKey: true as Takes<Repository['issueBillingKey'], 1>,
    startSubscription: true as Takes<Repository['startSubscription'], 1>,
    addCard: true as Takes<Repository['addCard'], 1>,
    setDefaultCard: true as Takes<Repository['setDefaultCard'], 1>,
    removeCard: true as Takes<Repository['removeCard'], 1>,
};

describe('the runtime subscription repository', () => {
    it('takes the sandbox query on each payer-scoped call', () => {
        expect(Object.keys(checks)).toHaveLength(6);
    });
});
