import {
    clearPendingCheckout,
    peekPendingCheckout,
    savePendingCardChange,
    savePendingCheckout,
    takePendingCardChange,
} from './pendingCheckout';

const DETAILS = {
    country: 'KR',
    emailId: 'em-1',
    payer: { name: '김민지', phone: '01012345678', email: 'minji.kim@gmail.com' },
};

beforeEach(() => window.sessionStorage.clear());

describe('pending checkout', () => {
    it('keeps what the checkout needs across the trip, for the plan it was saved for', () => {
        savePendingCheckout({ planId: 'pro-tier-01', details: DETAILS }, 1_000);
        expect(peekPendingCheckout('pro-tier-01', 2_000)).toEqual({ planId: 'pro-tier-01', details: DETAILS });
    });

    it('does not hand one plan the checkout saved for another', () => {
        savePendingCheckout({ planId: 'pro-tier-01', details: DETAILS });
        expect(peekPendingCheckout('pro-tier-02')).toBeUndefined();
        expect(peekPendingCheckout(null)).toBeUndefined();
    });

    it('is not trusted past a quarter of an hour', () => {
        savePendingCheckout({ planId: 'pro-tier-01', details: DETAILS }, 0);
        expect(peekPendingCheckout('pro-tier-01', 15 * 60_000)).toBeDefined();
        expect(peekPendingCheckout('pro-tier-01', 15 * 60_000 + 1)).toBeUndefined();
    });

    it('is gone once cleared, and reading does not clear it', () => {
        savePendingCheckout({ planId: 'pro-tier-01', details: DETAILS });
        expect(peekPendingCheckout('pro-tier-01')).toBeDefined();
        expect(peekPendingCheckout('pro-tier-01')).toBeDefined();
        clearPendingCheckout();
        expect(peekPendingCheckout('pro-tier-01')).toBeUndefined();
    });

    it('ignores a record it cannot read', () => {
        window.sessionStorage.setItem('subscription.pendingCheckout', '{not json');
        expect(peekPendingCheckout('pro-tier-01')).toBeUndefined();
    });
});

describe('pending card change', () => {
    it('hands back the payer once, then nothing', () => {
        savePendingCardChange(DETAILS.payer, 1_000);
        expect(takePendingCardChange(2_000)).toEqual(DETAILS.payer);
        expect(takePendingCardChange(2_000)).toBeUndefined();
    });

    it('is not trusted past a quarter of an hour', () => {
        savePendingCardChange(DETAILS.payer, 0);
        expect(takePendingCardChange(15 * 60_000 + 1)).toBeUndefined();
    });

    it('is taken away even when it is too old to use', () => {
        savePendingCardChange(DETAILS.payer, 0);
        takePendingCardChange(15 * 60_000 + 1);
        expect(takePendingCardChange(1)).toBeUndefined();
    });
});
