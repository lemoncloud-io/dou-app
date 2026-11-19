import { renderHook } from '@testing-library/react';

import { logger } from '@chatic/bridges';

import { WebSubscriptionActiveError } from '../lib/webSubscriptionActive';
import { useSubscriptionIap } from './useSubscriptionIap';
import { useLinkedAccounts } from '../../../hooks';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@chatic/bridges', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));

const membershipMutate = jest.fn().mockResolvedValue({ isValid: true });

let mockIsGuest = false;
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        session: {
            useRuntimeProfile: () => ({ isGuest: mockIsGuest }),
        },
        data: {
            cloudsKeys: { all: ['clouds'] },
        },
        get checkout() {
            return mockCheckoutKind === 'store' ? mockStore : { kind: 'web', open: jest.fn() };
        },
    })
);

jest.mock('../../../hooks/queryKeys', () => ({ subscriptionKeys: { all: ['subscription'] } }));
jest.mock('../../../hooks/useMembership', () => ({
    useValidateMembership: () => ({ mutateAsync: membershipMutate }),
}));
jest.mock('../../../hooks', () => ({ useLinkedAccounts: jest.fn() }));
// The host's store, as the `checkout` port offers it. Its purchase never settles unless a test says
// how the store answered.
const mockStore = {
    kind: 'store' as const,
    store: 'google' as 'google' | 'apple',
    products: jest.fn(),
    purchase: jest.fn(),
    finish: jest.fn(),
    currentPurchases: jest.fn(),
    openManagement: jest.fn(),
};
let mockCheckoutKind: 'store' | 'web' = 'store';
jest.mock('../consts', () => ({ APP_ID: 'app', IS_DEV: false }));

const setSocial = (social: 'linked' | 'absent' | 'unknown') =>
    (useLinkedAccounts as jest.Mock).mockReturnValue({ phone: 'unknown', social });

const product = { id: 'plan-1' };

beforeEach(() => {
    jest.clearAllMocks();
    mockIsGuest = false;
    mockCheckoutKind = 'store';
    mockStore.store = 'google';
    mockStore.purchase.mockReturnValue(new Promise(() => undefined));
    mockStore.finish.mockResolvedValue(undefined);
    mockStore.currentPurchases.mockResolvedValue([]);
    mockStore.products.mockResolvedValue([]);
});

describe('useSubscriptionIap — 로그인 가드', () => {
    it('게스트는 스토어를 열기 전에 로그인 안내로 거절한다', async () => {
        mockIsGuest = true;
        setSocial('linked');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow('mypage.subscription.loginRequired');

        expect(mockStore.purchase).not.toHaveBeenCalled();
        expect(membershipMutate).not.toHaveBeenCalled();
    });

    it('게스트 안내가 소셜 연동 안내보다 앞선다 — 게스트는 연동 화면을 쓸 수 없다', async () => {
        mockIsGuest = true;
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow('mypage.subscription.loginRequired');
    });

    it('게스트도 복구(restore)는 막지 않는다', async () => {
        mockIsGuest = true;
        setSocial('linked');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.restorePurchases()).resolves.toBe(0);
        expect(mockStore.currentPurchases).toHaveBeenCalled();
    });
});

describe('useSubscriptionIap — 클라우드 소유를 위한 소셜 연동 가드', () => {
    it('소셜이 없다고 서버가 말했으면 스토어를 열기 전에 거절한다', async () => {
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow(
            'mypage.subscription.socialLinkRequired'
        );

        // The purchase must not even start — validateMembership runs after the purchase, so if it
        // isn't blocked here, money leaves and there's nothing for the subscription to attach to.
        expect(mockStore.purchase).not.toHaveBeenCalled();
        expect(membershipMutate).not.toHaveBeenCalled();
    });

    it("'unknown'은 막지 않는다 — 백필 전 기존 유료 사용자를 세우면 안 된다", async () => {
        setSocial('unknown');
        const { result } = renderHook(() => useSubscriptionIap());

        // No push event arrives, so this never resolves. What matters is that it wasn't rejected
        // and got as far as the store call.
        void result.current.purchaseAndValidate(product);

        expect(mockStore.purchase).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
    });

    it('연동이 확인되면 정상적으로 스토어를 연다', async () => {
        setSocial('linked');
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate(product);

        expect(mockStore.purchase).toHaveBeenCalled();
    });

    it('복구(restore)는 막지 않는다 — 이미 존재하는 결제는 누군가의 것이다', async () => {
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());

        const restored = await result.current.restorePurchases();

        // Doesn't throw from the guard — it defers to the server's verdict and ends up with 0 restored.
        expect(restored).toBe(0);
        expect(mockStore.currentPurchases).toHaveBeenCalled();
    });

    it('화면이 미리 안내할 수 있도록 판정을 내보낸다', () => {
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());
        expect(result.current.isMissingSocialForCloud).toBe(true);

        setSocial('unknown');
        const { result: unknownResult } = renderHook(() => useSubscriptionIap());
        expect(unknownResult.current.isMissingSocialForCloud).toBe(false);
    });
});

describe('useSubscriptionIap — what reaches the store', () => {
    beforeEach(() => setSocial('linked'));

    it('hands the product to the store unchanged; the store port shapes it for its own store', () => {
        const tierChange = {
            id: 'dou_pro_subscription',
            newPlanId: 'pro-tier-02',
            offerToken: 'base-02',
            oldPlanId: 'pro-tier-01',
        };
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate(tierChange);

        expect(mockStore.purchase).toHaveBeenCalledWith(tierChange);
    });

    it.each([
        ['apple', 'apple-inapp'],
        ['google', 'google-inapp'],
    ] as const)('validates a receipt from the %s store as %s', async (store, paymentType) => {
        mockStore.store = store;
        mockStore.purchase.mockResolvedValueOnce({ productId: 'plan-1', purchaseToken: 't' });
        const { result } = renderHook(() => useSubscriptionIap());

        await result.current.purchaseAndValidate(product);

        expect(membershipMutate).toHaveBeenCalledWith({ body: expect.objectContaining({ paymentType }) });
    });

    it('finishes the transaction once the relay has validated it', async () => {
        const purchase = { productId: 'plan-1', purchaseToken: 't' };
        mockStore.purchase.mockResolvedValueOnce(purchase);
        const { result } = renderHook(() => useSubscriptionIap());

        await result.current.purchaseAndValidate(product);

        expect(mockStore.finish).toHaveBeenCalledWith(purchase);
    });

    it('refuses at once where no store sells, rather than asking a shell that is not there', async () => {
        mockCheckoutKind = 'web';
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow('no store sells on this host');
        await expect(result.current.restorePurchases()).rejects.toThrow('no store sells on this host');
    });
});

describe('useSubscriptionIap — 결제 기록', () => {
    beforeEach(() => setSocial('linked'));

    it('영수증이 거절되면(isValid=false) 에러로 남긴다 — 돈은 나갔는데 권한이 안 붙는 지점', async () => {
        membershipMutate.mockResolvedValueOnce({ isValid: false });
        const { result } = renderHook(() => useSubscriptionIap());

        mockStore.purchase.mockResolvedValueOnce({ productId: 'plan-1', purchaseToken: 'RECEIPT-SECRET' });
        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow('Validation failed');

        expect(logger.error).toHaveBeenCalledWith('IAP', 'membership validation rejected receipt (isValid=false)', {
            data: { productId: 'plan-1' },
        });
        // The receipt never rides along — redaction is key-name based and would not catch it here.
        expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('RECEIPT-SECRET');
    });

    it('resolves to the membership the relay validated', async () => {
        const validated = { isValid: true, productId: '#pro-tier-02', pendingProductId: '#pro-tier-01' };
        membershipMutate.mockResolvedValueOnce(validated);
        const { result } = renderHook(() => useSubscriptionIap());

        mockStore.purchase.mockResolvedValueOnce({ productId: 'plan-1', purchaseToken: 't' });

        await expect(result.current.purchaseAndValidate(product)).resolves.toBe(validated);
    });
});

describe('useSubscriptionIap — website subscription refusal', () => {
    const refusal = new Error(
        '409 CONFLICT - portone subscription is active - verifyMembershipPurchase(membership/MS1)'
    );

    it('restore stops with the typed error instead of skipping the receipt', async () => {
        mockStore.currentPurchases.mockResolvedValueOnce([{ productId: 'P', purchaseToken: 'T' }]);
        membershipMutate.mockRejectedValueOnce(refusal);
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.restorePurchases()).rejects.toBeInstanceOf(WebSubscriptionActiveError);
        expect(mockStore.finish).not.toHaveBeenCalled();
    });

    it('receipts restored before the refusal still refresh the caches, and the refusal is rethrown', async () => {
        mockStore.currentPurchases.mockResolvedValueOnce([
            { productId: 'P1', purchaseToken: 'T1' },
            { productId: 'P2', purchaseToken: 'T2' },
        ]);
        membershipMutate.mockResolvedValueOnce({ isValid: true }).mockRejectedValueOnce(refusal);
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.restorePurchases()).rejects.toBeInstanceOf(WebSubscriptionActiveError);
        expect(mockStore.finish).toHaveBeenCalledTimes(1);
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['subscription'] });
    });

    it('other validation failures stay skippable during restore', async () => {
        mockStore.currentPurchases.mockResolvedValueOnce([{ productId: 'P', purchaseToken: 'T' }]);
        membershipMutate.mockRejectedValueOnce(new Error('403 INVALID PAYMENT'));
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.restorePurchases()).resolves.toBe(0);
    });
});
