import type { IapProductSubscription } from '@chatic/app-messages';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { buildPurchaseProduct, matchNativeProduct } from './nativeProducts';

/** The parent SKU every google tier shares — `ProductView.planId` holds this, not a tier. */
const GOOGLE_PARENT_SKU = 'dou_pro_subscription';

const googlePlan = (tier: number): ProductView =>
    ({ id: `#pro-tier-0${tier}`, platform: 'google', planId: GOOGLE_PARENT_SKU, sort: tier }) as ProductView;

const applePlan = (tier: number): ProductView =>
    ({ id: `#pro_tier_0${tier}`, platform: 'apple', sort: tier }) as ProductView;

const googleNative = (tier: number, tokens?: { freeTrial?: string | null; base?: string | null }) =>
    ({
        id: GOOGLE_PARENT_SKU,
        basePlanId: `pro-tier-0${tier}`,
        androidOfferToken: {
            freeTrial: tokens?.freeTrial ?? null,
            // `null` must survive: the no-usable-token case is a real store state.
            base: tokens && 'base' in tokens ? tokens.base : `base-0${tier}`,
        },
    }) as unknown as IapProductSubscription;

const appleNative = (tier: number) => ({ id: `pro_tier_0${tier}` }) as unknown as IapProductSubscription;

describe('matchNativeProduct', () => {
    it('iOS는 상품 id로 매칭한다', () => {
        const natives = [appleNative(1), appleNative(2)];

        expect(matchNativeProduct(natives, applePlan(2), true)?.id).toBe('pro_tier_02');
    });

    it('Android는 basePlanId로 매칭한다 — 부모 SKU는 tier마다 같다', () => {
        const natives = [googleNative(1), googleNative(2), googleNative(3)];

        expect(matchNativeProduct(natives, googlePlan(3), false)?.basePlanId).toBe('pro-tier-03');
    });

    it('회귀 방지: planId(부모 SKU)로는 절대 매칭되지 않는다', () => {
        // 홈 시트가 `p.basePlanId === selectedProduct.planId`로 찾아 Android 결제가 조용히 죽었던
        // 자리다. 부모 SKU를 basePlanId로 가진 네이티브 상품은 존재하지 않는다.
        const natives = [googleNative(1), googleNative(2)];
        const planIdMatch = natives.find(p => p.basePlanId === googlePlan(2).planId);

        expect(planIdMatch).toBeUndefined();
        expect(matchNativeProduct(natives, googlePlan(2), false)).toBeDefined();
    });

    it('스토어에 없는 상품이면 undefined다', () => {
        expect(matchNativeProduct([googleNative(1)], googlePlan(5), false)).toBeUndefined();
    });
});

describe('buildPurchaseProduct — 신규 구독', () => {
    it('Android 신규는 무료체험 토큰을 우선 쓴다', () => {
        const product = buildPurchaseProduct(googleNative(1, { freeTrial: 'trial-01' }), { isIOS: false });

        expect(product).toEqual({ id: GOOGLE_PARENT_SKU, newPlanId: 'pro-tier-01', offerToken: 'trial-01' });
    });

    it('체험 토큰이 없으면 base로 떨어진다 (tier2+는 trialDays=0이라 토큰 자체가 없다)', () => {
        expect(buildPurchaseProduct(googleNative(3), { isIOS: false })?.offerToken).toBe('base-03');
    });

    it('신규에는 oldPlanId를 싣지 않는다', () => {
        expect(buildPurchaseProduct(googleNative(1), { isIOS: false })).not.toHaveProperty('oldPlanId');
    });

    it('Android에 쓸 수 있는 토큰이 하나도 없으면 결제를 만들지 않는다', () => {
        const noTokens = googleNative(1, { base: null });

        expect(buildPurchaseProduct(noTokens, { isIOS: false })).toBeNull();
    });

    it('iOS는 토큰이 필요 없다', () => {
        expect(buildPurchaseProduct(appleNative(1), { isIOS: true })).toEqual({ id: 'pro_tier_01' });
    });
});

describe('buildPurchaseProduct — 등급 변경', () => {
    it('Android 등급 변경은 oldPlanId를 싣는다 — 없으면 신규 구매로 처리된다', () => {
        const product = buildPurchaseProduct(googleNative(2), {
            isIOS: false,
            isTierChange: true,
            currentProductId: '#pro-tier-01',
        });

        expect(product).toEqual({
            id: GOOGLE_PARENT_SKU,
            newPlanId: 'pro-tier-02',
            offerToken: 'base-02',
            oldPlanId: 'pro-tier-01',
        });
    });

    it('등급 변경은 체험 토큰이 있어도 base를 쓴다 — 체험은 tier1 최초 1회뿐이다', () => {
        const withTrial = googleNative(1, { freeTrial: 'trial-01', base: 'base-01' });

        const product = buildPurchaseProduct(withTrial, {
            isIOS: false,
            isTierChange: true,
            currentProductId: '#pro-tier-02',
        });

        expect(product?.offerToken).toBe('base-01');
    });

    it('iOS 등급 변경에는 oldPlanId를 싣지 않는다 — Android 전용 필드다', () => {
        const product = buildPurchaseProduct(appleNative(2), {
            isIOS: true,
            isTierChange: true,
            currentProductId: '#pro_tier_01',
        });

        expect(product).not.toHaveProperty('oldPlanId');
    });

    it('현재 상품을 모르면 oldPlanId를 빼고 만든다 — 잘못된 값을 지어내지 않는다', () => {
        const product = buildPurchaseProduct(googleNative(2), { isIOS: false, isTierChange: true });

        expect(product).not.toHaveProperty('oldPlanId');
    });
});
