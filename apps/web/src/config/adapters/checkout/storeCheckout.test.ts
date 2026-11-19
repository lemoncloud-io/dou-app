import { logger } from '@chatic/bridges';

import { appBridge } from '../../../app/bridge/appBridge';
import { PURCHASE_TIMEOUT_MS, storeCheckout } from './storeCheckout';

// The shell's purchase events, captured so a test can play the store's answer back.
const mockEvents: Record<string, (message: unknown) => void> = {};
jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    webClient: {
        onEvent: (type: string, handler: (message: unknown) => void) => {
            mockEvents[type] = handler;
            return () => undefined;
        },
    },
}));
jest.mock('../../../app/bridge/appBridge', () => ({
    appBridge: {
        purchase: jest.fn(),
        finishPurchaseTransaction: jest.fn().mockResolvedValue({ data: {} }),
        fetchCurrentPurchases: jest.fn().mockResolvedValue({ data: { purchases: [{ productId: 'p' }] } }),
        fetchProducts: jest.fn().mockResolvedValue({ data: { products: [{ id: 'dou_pro_subscription' }] } }),
        openSubscriptionManagement: jest.fn(),
    },
}));

const succeed = (purchase: unknown) => mockEvents['OnPurchaseSuccess']?.({ data: { purchase } });
const fail = (error: unknown) => mockEvents['OnPurchaseError']?.({ data: { error } });

beforeEach(() => jest.clearAllMocks());

describe('storeCheckout — what is sent to the store', () => {
    const tierChange = { id: 'dou_pro_subscription', newPlanId: 'pro-tier-02', offerToken: 'base-02' };

    it('carries the old plan to Google on a tier change, which it books as a replacement only with it', () => {
        void storeCheckout('google').purchase({ ...tierChange, oldPlanId: 'pro-tier-01' });

        expect(appBridge.purchase).toHaveBeenCalledWith({
            id: 'dou_pro_subscription',
            offerToken: 'base-02',
            newPlanId: 'pro-tier-02',
            oldPlanId: 'pro-tier-01',
        });
    });

    it('sends no oldPlanId key at all on a new Google subscription', () => {
        void storeCheckout('google').purchase(tierChange);

        expect(appBridge.purchase).toHaveBeenCalledWith(expect.not.objectContaining({ oldPlanId: expect.anything() }));
    });

    it('sends Apple the product id and none of the Google-only fields', () => {
        void storeCheckout('apple').purchase({ ...tierChange, oldPlanId: 'pro_tier_01' });

        expect(appBridge.purchase).toHaveBeenCalledWith({ id: 'dou_pro_subscription' });
    });
});

describe('storeCheckout — how a purchase settles', () => {
    it('resolves with the purchase the shell reports', async () => {
        const pending = storeCheckout('google').purchase({ id: 'p' });
        succeed({ productId: 'p', purchaseToken: 't' });

        await expect(pending).resolves.toEqual({ productId: 'p', purchaseToken: 't' });
    });

    it('rejects with the store error, and logs a cancellation as info and anything else as error', async () => {
        const checkout = storeCheckout('google');

        const cancelled = checkout.purchase({ id: 'p' });
        fail({ code: 'user-cancelled' });
        await expect(cancelled).rejects.toEqual({ code: 'user-cancelled' });
        expect(logger.info).toHaveBeenCalledWith('IAP', 'native purchase cancelled by user');
        expect(logger.error).not.toHaveBeenCalled();

        const failed = checkout.purchase({ id: 'p' });
        fail({ code: 'billing-unavailable' });
        await expect(failed).rejects.toEqual({ code: 'billing-unavailable' });
        expect(logger.error).toHaveBeenCalledWith('IAP', 'native purchase failed (code=billing-unavailable)', {
            data: { code: 'billing-unavailable' },
        });
    });

    it('gives up as a timeout when the store has not answered in time, and logs it', async () => {
        jest.useFakeTimers();
        try {
            const caught = storeCheckout('google')
                .purchase({ id: 'plan-1' })
                .catch((e: unknown) => e);
            jest.advanceTimersByTime(PURCHASE_TIMEOUT_MS);

            await expect(caught).resolves.toMatchObject({ code: 'timeout' });
            expect(logger.error).toHaveBeenCalledWith('IAP', 'purchase timed out after 60s', {
                data: { productId: 'plan-1' },
            });
        } finally {
            jest.useRealTimers();
        }
    });

    it('rejects a purchase another one replaced, and its timer never touches the newer one', async () => {
        jest.useFakeTimers();
        try {
            const checkout = storeCheckout('google');
            const first = checkout.purchase({ id: 'first' }).catch((e: unknown) => e);
            jest.advanceTimersByTime(PURCHASE_TIMEOUT_MS / 2);
            const second = checkout.purchase({ id: 'second' });

            await expect(first).resolves.toMatchObject({ code: 'superseded' });
            // The first purchase's 60 seconds are up; the second has had only half of its own.
            jest.advanceTimersByTime(PURCHASE_TIMEOUT_MS / 2);
            succeed({ productId: 'second' });

            await expect(second).resolves.toEqual({ productId: 'second' });
            expect(logger.error).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it('ignores an answer after the purchase it belonged to has settled', async () => {
        const pending = storeCheckout('google').purchase({ id: 'p' });
        succeed({ productId: 'p' });
        await pending;

        expect(() => fail({ code: 'late' })).not.toThrow();
    });
});

describe('storeCheckout — the rest of the store', () => {
    it('reads the catalog and the held purchases, finishes a purchase and opens management through the bridge', async () => {
        const checkout = storeCheckout('apple');

        await expect(checkout.products()).resolves.toEqual([{ id: 'dou_pro_subscription' }]);
        await expect(checkout.currentPurchases()).resolves.toEqual([{ productId: 'p' }]);
        await expect(checkout.finish({ productId: 'p' } as never)).resolves.toBeUndefined();
        checkout.openManagement();

        expect(appBridge.finishPurchaseTransaction).toHaveBeenCalledWith({ productId: 'p' });
        expect(appBridge.openSubscriptionManagement).toHaveBeenCalled();
    });
});
