import type { ProductView } from '@lemoncloud/chatic-backend-api';

import {
    findPlanById,
    getTierChangeKind,
    isSelectableTier,
    resolveMaxClouds,
    selectSellablePlans,
    sortPlansByTier,
    stripPlanId,
} from './plans';

/** Mirrors `data/product-config.json`: apple keys use `_`, google keys use `-`. */
const applePlan = (tier: number): ProductView =>
    ({
        id: `#pro_tier_0${tier}`,
        platform: 'apple',
        sort: tier,
        maxClouds: tier,
        trialDays: tier === 1 ? 7 : 0,
    }) as ProductView;

const googlePlan = (tier: number): ProductView =>
    ({
        id: `#pro-tier-0${tier}`,
        platform: 'google',
        // Every google tier shares one parent SKU — this field does NOT identify a tier.
        planId: 'dou_pro_subscription',
        sort: tier,
        maxClouds: tier,
        trialDays: tier === 1 ? 7 : 0,
    }) as ProductView;

/** What `GET /products/plans` returns unfiltered: both stores, current stage only. */
const catalog = [1, 2, 3, 4, 5].flatMap(t => [applePlan(t), googlePlan(t)]);

describe('stripPlanId', () => {
    it('서버 id의 # 접두를 떼어 스토어가 쓰는 형태로 만든다', () => {
        expect(stripPlanId('#pro-tier-01')).toBe('pro-tier-01');
        expect(stripPlanId('pro-tier-01')).toBe('pro-tier-01');
        expect(stripPlanId(undefined)).toBe('');
    });
});

describe('selectSellablePlans', () => {
    it('현재 플랫폼 상품만 tier 순서로 고른다', () => {
        const plans = selectSellablePlans(catalog, 'google');

        expect(plans).toHaveLength(5);
        expect(plans.every(p => p.platform === 'google')).toBe(true);
        expect(plans.map(p => p.sort)).toEqual([1, 2, 3, 4, 5]);
    });

    it('스토어가 없는 곳(웹)에서는 아무것도 팔지 않는다 — 다른 스토어 조건을 보여주면 안 된다', () => {
        expect(selectSellablePlans(catalog, undefined)).toEqual([]);
    });
});

describe('sortPlansByTier', () => {
    it('원본을 건드리지 않고 sort 오름차순 사본을 만든다', () => {
        const shuffled = [googlePlan(3), googlePlan(1), googlePlan(2)];

        expect(sortPlansByTier(shuffled).map(p => p.sort)).toEqual([1, 2, 3]);
        expect(shuffled.map(p => p.sort)).toEqual([3, 1, 2]);
    });
});

describe('findPlanById', () => {
    it('# 접두 유무와 무관하게 조인한다', () => {
        expect(findPlanById(catalog, '#pro-tier-03')?.maxClouds).toBe(3);
        expect(findPlanById(catalog, 'pro-tier-03')?.maxClouds).toBe(3);
    });

    it('애플 키와 구글 키를 혼동하지 않는다 (구분자만 다르다)', () => {
        expect(findPlanById(catalog, '#pro_tier_02')?.platform).toBe('apple');
        expect(findPlanById(catalog, '#pro-tier-02')?.platform).toBe('google');
    });

    it('없는 id와 빈 값은 undefined다', () => {
        expect(findPlanById(catalog, '#pro-tier-09')).toBeUndefined();
        expect(findPlanById(catalog, undefined)).toBeUndefined();
    });
});

describe('resolveMaxClouds', () => {
    it('상품 목록에서 한도를 얻는다', () => {
        expect(resolveMaxClouds(catalog, '#pro-tier-04')).toBe(4);
    });

    it('다른 플랫폼에서 결제한 멤버십도 해석된다 — 목록을 platform 필터 없이 받는 이유다', () => {
        // 안드로이드 기기에서 로그인한 애플 구독자.
        expect(resolveMaxClouds(catalog, '#pro_tier_05')).toBe(5);
    });

    it('해석 불가는 0이 아니라 null이다 — 슈퍼 멤버십·미로딩 목록', () => {
        expect(resolveMaxClouds(catalog, undefined)).toBeNull();
        expect(resolveMaxClouds([], '#pro-tier-01')).toBeNull();
    });

    it('멤버십의 product$(head)에는 maxClouds가 없으므로 그쪽을 보지 않는다', () => {
        // 백엔드 asHead가 남기는 필드 전부. maxClouds가 없다.
        const head = { id: '#pro-tier-02', name: 'DoU Pro 2', nameEn: 'DoU Pro 2', platform: 'google' };

        expect((head as ProductView).maxClouds).toBeUndefined();
        expect(resolveMaxClouds(catalog, head.id)).toBe(2);
    });
});

describe('getTierChangeKind', () => {
    it('현재 상품이 없으면 어떤 tier든 신규다 — 인접 제약은 등급 변경에만 건다', () => {
        expect(getTierChangeKind(undefined, googlePlan(5))).toBe('new');
    });

    it('같은 상품은 current다', () => {
        expect(getTierChangeKind(googlePlan(2), googlePlan(2))).toBe('current');
    });

    it('한 칸 위아래만 허용한다', () => {
        expect(getTierChangeKind(googlePlan(2), googlePlan(3))).toBe('upgrade');
        expect(getTierChangeKind(googlePlan(2), googlePlan(1))).toBe('downgrade');
    });

    it('tier 점프는 막는다 — 클라우드마다 이메일 인증이 하나씩 붙는다', () => {
        expect(getTierChangeKind(googlePlan(1), googlePlan(3))).toBe('blocked');
        expect(getTierChangeKind(googlePlan(5), googlePlan(1))).toBe('blocked');
    });
});

describe('isSelectableTier', () => {
    it('신규·업·다운만 고를 수 있다', () => {
        expect(isSelectableTier('new')).toBe(true);
        expect(isSelectableTier('upgrade')).toBe(true);
        expect(isSelectableTier('downgrade')).toBe(true);
        expect(isSelectableTier('current')).toBe(false);
        expect(isSelectableTier('blocked')).toBe(false);
    });
});
