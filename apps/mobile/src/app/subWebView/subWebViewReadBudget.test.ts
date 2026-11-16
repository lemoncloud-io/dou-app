import { createSubWebViewReadBudget } from './subWebViewReadBudget';

describe('createSubWebViewReadBudget', () => {
    it('spaces reads by the interval and says how long to wait', () => {
        const budget = createSubWebViewReadBudget({ minIntervalMs: 250, perMinute: 60 });

        expect(budget.take(1_000)).toEqual({ ok: true });
        expect(budget.take(1_100)).toEqual({ ok: false, retryAfterMs: 150 });
        expect(budget.take(1_250)).toEqual({ ok: true });
    });

    it('caps reads in any minute, and frees one as the oldest ages out', () => {
        const budget = createSubWebViewReadBudget({ minIntervalMs: 0, perMinute: 3 });

        expect(budget.take(0)).toEqual({ ok: true });
        expect(budget.take(10)).toEqual({ ok: true });
        expect(budget.take(20)).toEqual({ ok: true });
        expect(budget.take(30)).toEqual({ ok: false, retryAfterMs: 59_970 });
        expect(budget.take(60_000)).toEqual({ ok: true });
    });

    it('does not spend a refused read', () => {
        const budget = createSubWebViewReadBudget({ minIntervalMs: 0, perMinute: 1 });

        budget.take(0);
        budget.take(5);
        budget.take(6);
        expect(budget.take(60_000)).toEqual({ ok: true });
    });
});
