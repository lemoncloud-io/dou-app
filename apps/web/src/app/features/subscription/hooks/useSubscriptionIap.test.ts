import { renderHook } from '@testing-library/react';

import { useSubscriptionIap } from './useSubscriptionIap';
import { useLinkedAccounts } from '../../../hooks';
import { appBridge } from '../../../bridge';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));

const validateMutate = jest.fn().mockResolvedValue({ isValid: true });
const membershipMutate = jest.fn().mockResolvedValue({});
jest.mock('@chatic/web-core', () => ({
    cloudsKeys: { all: ['clouds'] },
    subscriptionKeys: { all: ['subscription'] },
    useValidateApple: () => ({ mutateAsync: validateMutate }),
    useValidateGoogle: () => ({ mutateAsync: validateMutate }),
    useValidateMembership: () => ({ mutateAsync: membershipMutate }),
}));

let mockIsGuest = false;
jest.mock('@chatic/app-runtime', () => ({ useRuntimeProfile: () => ({ isGuest: mockIsGuest }) }));

jest.mock('../../../hooks', () => ({ useLinkedAccounts: jest.fn() }));
jest.mock('../../../bridge', () => ({
    appBridge: {
        purchase: jest.fn(),
        finishPurchaseTransaction: jest.fn().mockResolvedValue(undefined),
        fetchCurrentPurchases: jest.fn().mockResolvedValue({ data: { purchases: [] } }),
        fetchProducts: jest.fn().mockResolvedValue({ data: { products: [] } }),
    },
    // The purchase result arrives as a push event; these register callbacks the tests never fire.
    useOnPurchaseSuccess: jest.fn(),
    useOnPurchaseError: jest.fn(),
}));
jest.mock('../consts', () => ({ APP_ID: 'app', IS_DEV: false }));

const setSocial = (social: 'linked' | 'absent' | 'unknown') =>
    (useLinkedAccounts as jest.Mock).mockReturnValue({ phone: 'unknown', social });

const product = { id: 'plan-1' };

beforeEach(() => {
    jest.clearAllMocks();
    mockIsGuest = false;
});

describe('useSubscriptionIap — 로그인 가드', () => {
    it('게스트는 스토어를 열기 전에 로그인 안내로 거절한다', async () => {
        mockIsGuest = true;
        setSocial('linked');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow('mypage.subscription.loginRequired');

        expect(appBridge.purchase).not.toHaveBeenCalled();
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
        expect(appBridge.fetchCurrentPurchases).toHaveBeenCalled();
    });
});

describe('useSubscriptionIap — 클라우드 소유를 위한 소셜 연동 가드', () => {
    it('소셜이 없다고 서버가 말했으면 스토어를 열기 전에 거절한다', async () => {
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());

        await expect(result.current.purchaseAndValidate(product)).rejects.toThrow(
            'mypage.subscription.socialLinkRequired'
        );

        // 결제가 시작조차 되지 않아야 한다 — validateMembership은 구매 뒤에 돌기 때문에,
        // 여기서 막지 않으면 돈은 나가고 구독은 붙을 곳이 없다.
        expect(appBridge.purchase).not.toHaveBeenCalled();
        expect(membershipMutate).not.toHaveBeenCalled();
    });

    it("'unknown'은 막지 않는다 — 백필 전 기존 유료 사용자를 세우면 안 된다", async () => {
        setSocial('unknown');
        const { result } = renderHook(() => useSubscriptionIap());

        // 푸시 이벤트가 오지 않으므로 resolve되지 않는다. 중요한 것은 거절되지 않고
        // 스토어 호출까지 갔다는 사실이다.
        void result.current.purchaseAndValidate(product);

        expect(appBridge.purchase).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-1' }));
    });

    it('연동이 확인되면 정상적으로 스토어를 연다', async () => {
        setSocial('linked');
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate(product);

        expect(appBridge.purchase).toHaveBeenCalled();
    });

    it('복구(restore)는 막지 않는다 — 이미 존재하는 결제는 누군가의 것이다', async () => {
        setSocial('absent');
        const { result } = renderHook(() => useSubscriptionIap());

        const restored = await result.current.restorePurchases();

        // 가드에 걸려 throw하지 않고, 서버 판정에 맡긴 뒤 0건으로 끝난다.
        expect(restored).toBe(0);
        expect(appBridge.fetchCurrentPurchases).toHaveBeenCalled();
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

describe('useSubscriptionIap — 등급 교체 페이로드', () => {
    const tierChange = { id: 'dou_pro_subscription', newPlanId: 'pro-tier-02', offerToken: 'base-02' };

    beforeEach(() => setSocial('linked'));
    // Cleared here rather than at the end of the iOS case: a failing assertion would skip an
    // inline delete and leak the platform into every suite that runs after this one.
    afterEach(() => delete window.CHATIC_APP_PLATFORM);

    it('Android 등급 변경은 oldPlanId를 스토어까지 실어 보낸다', () => {
        // 이 값이 없으면 네이티브가 교체가 아닌 신규 구매로 판정한다.
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate({ ...tierChange, oldPlanId: 'pro-tier-01' });

        expect(appBridge.purchase).toHaveBeenCalledWith({
            id: 'dou_pro_subscription',
            offerToken: 'base-02',
            newPlanId: 'pro-tier-02',
            oldPlanId: 'pro-tier-01',
        });
    });

    it('신규 구독에는 oldPlanId 키 자체가 붙지 않는다', () => {
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate(tierChange);

        expect(appBridge.purchase).toHaveBeenCalledWith(expect.not.objectContaining({ oldPlanId: expect.anything() }));
    });

    it('iOS는 Android 전용 필드를 하나도 보내지 않는다', () => {
        window.CHATIC_APP_PLATFORM = 'ios';
        const { result } = renderHook(() => useSubscriptionIap());

        void result.current.purchaseAndValidate({ ...tierChange, oldPlanId: 'pro_tier_01' });

        expect(appBridge.purchase).toHaveBeenCalledWith({ id: 'dou_pro_subscription' });
    });
});
