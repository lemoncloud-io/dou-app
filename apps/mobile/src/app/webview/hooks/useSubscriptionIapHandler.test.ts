import { renderHook } from '@testing-library/react';

import { pushedEventErrors, pushedEvents } from './appEventContract';
import { useSubscriptionIapHandler } from './useSubscriptionIapHandler';

// The store's callbacks, as the hook hands them to useSubscriptionIap.
let mockCallbacks: { onPurchaseSuccess?: (purchase: unknown) => void; onPurchaseError?: (error: unknown) => void } = {};

jest.mock('react-native-iap', () => ({ ErrorCode: { AlreadyOwned: 'already-owned' } }));
jest.mock('../../hooks', () => ({
    useSubscriptionIap: jest.fn((callbacks: typeof mockCallbacks) => {
        mockCallbacks = callbacks;
        return { products: [], currentPurchases: [], loading: false };
    }),
}));
jest.mock('../../services', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

// A store purchase, in the shape react-native-iap reports one.
const purchase = {
    id: 'txn_1',
    productId: 'dou.plus.monthly',
    transactionId: 'txn_1',
    transactionDate: 1_700_000_000_000,
    purchaseToken: 'receipt',
    purchaseState: 'purchased',
    platform: 'ios',
    store: 'apple',
    quantity: 1,
    isAutoRenewing: true,
};

describe('useSubscriptionIapHandler', () => {
    let bridge: { pushEvent: jest.Mock };

    beforeEach(() => {
        mockCallbacks = {};
        bridge = { pushEvent: jest.fn() };
    });

    describe('app → web event contract', () => {
        // The purchase outcome arrives after Purchase has already been answered, so it is pushed.
        it("pushes 'OnPurchaseSuccess' with the store's purchase", () => {
            renderHook(() => useSubscriptionIapHandler(bridge as any));

            mockCallbacks.onPurchaseSuccess?.(purchase);

            expect(pushedEvents(bridge.pushEvent)).toEqual([
                expect.objectContaining({ type: 'OnPurchaseSuccess', success: true, data: { purchase } }),
            ]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });

        it.each([
            ['an already-owned error', { code: 'already-owned', message: 'owned', productId: 'dou.plus.monthly' }],
            ['any other store error', { code: 'user-cancelled', message: 'cancelled' }],
        ])("pushes 'OnPurchaseError' with %s", (_case, error) => {
            renderHook(() => useSubscriptionIapHandler(bridge as any));

            mockCallbacks.onPurchaseError?.(error);

            expect(pushedEvents(bridge.pushEvent)).toEqual([
                expect.objectContaining({ type: 'OnPurchaseError', success: false, data: { error } }),
            ]);
            expect(pushedEventErrors(pushedEvents(bridge.pushEvent))).toEqual([]);
        });
    });
});
