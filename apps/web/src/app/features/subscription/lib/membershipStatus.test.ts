import type { MembershipView, ProductView } from '@lemoncloud/chatic-backend-api';

import { summarizeMembership } from './membershipStatus';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_760_000_000_000;

const tier1 = { id: '#pro-tier-01', sort: 1, maxClouds: 1, trialDays: 7 } as ProductView;

const membership = (overrides: Partial<MembershipView> = {}): MembershipView =>
    ({
        productId: '#pro-tier-01',
        status: 'active',
        validFrom: NOW - 3 * DAY,
        validUntil: NOW + 27 * DAY,
        autoRenewing: true,
        ...overrides,
    }) as MembershipView;

describe('summarizeMembership — 5상태', () => {
    it('멤버십이 없으면 none이고 자격이 없다', () => {
        const summary = summarizeMembership(undefined, undefined, NOW);

        expect(summary.state).toBe('none');
        expect(summary.isEntitled).toBe(false);
    });

    it("서버가 status='none'을 주면 productId가 있어도 none이다", () => {
        expect(summarizeMembership(membership({ status: 'none' }), tier1, NOW).state).toBe('none');
    });

    it('유효기간이 남은 활성 구독은 active다', () => {
        const summary = summarizeMembership(membership(), tier1, NOW);

        expect(summary.state).toBe('active');
        expect(summary.isEntitled).toBe(true);
    });

    it('유효기간이 지나면 expired이고 자격이 사라진다', () => {
        const summary = summarizeMembership(membership({ status: 'expired', validUntil: NOW - DAY }), tier1, NOW);

        expect(summary.state).toBe('expired');
        expect(summary.isEntitled).toBe(false);
    });

    // isSuper was the old way of expressing an unlimited grant, and the server dropped it from the
    // verdict in 2026-08. Keep reading it here and the stale axis survives only in the app (ADR-0101).
    it('isSuper 는 더 이상 자격을 주지 않는다', () => {
        const summary = summarizeMembership({ isSuper: true } as MembershipView, undefined, NOW);

        expect(summary.state).toBe('none');
        expect(summary.isEntitled).toBe(false);
    });
});

describe('summarizeMembership — 관리자 오버라이드', () => {
    it('영수증이 만료돼도 부여가 살아 있으면 active다', () => {
        const summary = summarizeMembership(
            membership({ status: 'expired', validUntil: NOW - DAY, adminStatus: 'active', adminUntil: NOW + DAY }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('active');
        expect(summary.isEntitled).toBe(true);
        expect(summary.isAdminOverridden).toBe(true);
    });

    it('만료일 없는 부여는 무기한이라 active다', () => {
        const summary = summarizeMembership(
            membership({ status: 'expired', validUntil: NOW - DAY, adminStatus: 'active' }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('active');
        expect(summary.isEntitled).toBe(true);
    });

    // The server derives status only once, at write time, and there's no batch job to revert it.
    // The app looks at adminUntil directly, so it reflects the expiry immediately.
    it('부여 기간이 지나면 status 가 active 로 남아 있어도 영수증 기준으로 돌아간다', () => {
        const summary = summarizeMembership(
            membership({ status: 'active', validUntil: NOW - DAY, adminStatus: 'active', adminUntil: NOW - 1 }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('expired');
        expect(summary.isEntitled).toBe(false);
        expect(summary.isAdminOverridden).toBeUndefined();
    });

    it('차단은 영수증이 멀쩡해도 blocked 다 — expired 가 아니다', () => {
        const summary = summarizeMembership(
            membership({ status: 'active', validUntil: NOW + DAY, adminStatus: 'expired' }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('blocked');
        expect(summary.isEntitled).toBe(false);
    });

    it('canceled 로 막아도 blocked 다', () => {
        const summary = summarizeMembership(
            membership({ status: 'active', validUntil: NOW + DAY, adminStatus: 'canceled' }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('blocked');
    });

    it('오버라이드 등급이 있으면 그것을 유효 등급으로 쓴다', () => {
        const summary = summarizeMembership(
            membership({
                status: 'expired',
                validUntil: NOW - DAY,
                productId: 'pro_tier_01',
                adminStatus: 'active',
                adminProductId: 'pro_tier_03',
            }),
            tier1,
            NOW
        );

        expect(summary.productId).toBe('pro_tier_03');
    });

    // Values that go out to the store (oldPlanId, the plan being replaced) must follow the receipt,
    // not entitlement.
    it('영수증이 만료된 채 부여받으면 스토어에는 교체할 구독이 없다', () => {
        const summary = summarizeMembership(
            membership({ status: 'expired', validUntil: NOW - DAY, adminStatus: 'active' }),
            tier1,
            NOW
        );

        expect(summary.isEntitled).toBe(true);
        expect(summary.hasLiveReceipt).toBe(false);
    });

    it('차단돼도 영수증이 살아 있으면 스토어 구독은 그대로다', () => {
        const summary = summarizeMembership(
            membership({ status: 'active', validUntil: NOW + DAY, adminStatus: 'expired' }),
            tier1,
            NOW
        );

        expect(summary.isEntitled).toBe(false);
        expect(summary.hasLiveReceipt).toBe(true);
    });

    // Blocking only takes away entitlement, it doesn't assign a tier. The leftover value from a past
    // grant must not be shown as the tier.
    it('차단 상태에서는 남아 있는 adminProductId를 등급으로 쓰지 않는다', () => {
        const summary = summarizeMembership(
            membership({
                status: 'active',
                validUntil: NOW + DAY,
                productId: 'pro_tier_01',
                adminStatus: 'expired',
                adminProductId: 'pro_tier_03',
            }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('blocked');
        expect(summary.productId).toBe('pro_tier_01');
    });

    it('해제된 레코드는 오버라이드가 없는 것과 같다', () => {
        const summary = summarizeMembership(
            membership({ status: 'active', validUntil: NOW + DAY, adminStatus: '' }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('active');
        expect(summary.isAdminOverridden).toBeUndefined();
    });
});

describe('summarizeMembership — 해지 예약', () => {
    it("status='canceled'이지만 유효기간이 남았으면 cancelScheduled다", () => {
        const summary = summarizeMembership(
            membership({ status: 'canceled', canceledAt: NOW - DAY, autoRenewing: false }),
            tier1,
            NOW
        );

        expect(summary.state).toBe('cancelScheduled');
    });

    it('해지 예약도 자격은 유지된다 — 서버 isValid가 false여도 아직 돈을 낸 기간이다', () => {
        // The backend's isValid returns false once canceledAt>0 (proxy.ts:717). Measuring the quota
        // against that value would flag clouds as over the limit during a month the user already paid for.
        const canceled = membership({ status: 'canceled', canceledAt: NOW - DAY });

        expect(summarizeMembership(canceled, tier1, NOW).isEntitled).toBe(true);
    });

    it('autoRenewing=false만으로도 해지 예약으로 읽는다', () => {
        expect(summarizeMembership(membership({ autoRenewing: false }), tier1, NOW).state).toBe('cancelScheduled');
    });

    it('해지 예약이 끝나면 expired로 넘어간다', () => {
        const ended = membership({ status: 'canceled', canceledAt: NOW - 30 * DAY, validUntil: NOW - DAY });

        expect(summarizeMembership(ended, tier1, NOW).state).toBe('expired');
    });
});

describe('summarizeMembership — 결제 실패 유예', () => {
    it('유효기간이 남아 있으면 active다 — 앱이 별도 컷을 두지 않는다', () => {
        // Even if the renewal payment fails, validUntil is still in the future during the store's grace period.
        const inGrace = membership({ status: 'active', validUntil: NOW + 2 * DAY });

        expect(summarizeMembership(inGrace, tier1, NOW).state).toBe('active');
    });
});

describe('summarizeMembership — 등급 변경 예약', () => {
    it('pendingProductId를 그대로 내보낸다', () => {
        const summary = summarizeMembership(membership({ pendingProductId: '#pro-tier-02' }), tier1, NOW);

        expect(summary.pendingProductId).toBe('#pro-tier-02');
    });

    it('빈 문자열은 예약 없음으로 정규화한다', () => {
        expect(summarizeMembership(membership({ pendingProductId: '' }), tier1, NOW).pendingProductId).toBeUndefined();
    });
});

describe('summarizeMembership — 체험 잔여일', () => {
    it('체험 중이면 남은 일수를 올림으로 계산한다', () => {
        const trialing = membership({ trialUsed: true, validFrom: NOW - 3 * DAY });

        expect(summarizeMembership(trialing, tier1, NOW).trialDaysLeft).toBe(4);
    });

    it('체험을 쓰지 않았으면 계산하지 않는다', () => {
        expect(summarizeMembership(membership({ trialUsed: false }), tier1, NOW).trialDaysLeft).toBeUndefined();
    });

    it('체험이 없는 상품(tier2+)은 계산하지 않는다', () => {
        const tier2 = { id: '#pro-tier-02', sort: 2, maxClouds: 2, trialDays: 0 } as ProductView;

        expect(summarizeMembership(membership({ trialUsed: true }), tier2, NOW).trialDaysLeft).toBeUndefined();
    });

    it('체험 기간이 이미 지났으면 값을 내지 않는다', () => {
        const converted = membership({ trialUsed: true, validFrom: NOW - 30 * DAY });

        expect(summarizeMembership(converted, tier1, NOW).trialDaysLeft).toBeUndefined();
    });

    it('계산값이 체험 일수를 넘으면 신뢰하지 않는다 — validFrom 의미가 스토어마다 미묘하다', () => {
        const future = membership({ trialUsed: true, validFrom: NOW + 10 * DAY });

        expect(summarizeMembership(future, tier1, NOW).trialDaysLeft).toBeUndefined();
    });
});
