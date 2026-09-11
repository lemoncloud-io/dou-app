import { isAdminOverrideActive, resolveEffectiveProductId } from './membershipOverride';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const NOW = 1_757_000_000_000; // 2026-09 어름
const HOUR = 60 * 60 * 1000;

const membership = (fields: Partial<MembershipView>): MembershipView => fields as MembershipView;

describe('isAdminOverrideActive', () => {
    it('멤버십이 없으면 활성이 아니다', () => {
        expect(isAdminOverrideActive(undefined, NOW)).toBe(false);
    });

    it('adminStatus가 없으면 활성이 아니다', () => {
        expect(isAdminOverrideActive(membership({ adminUntil: NOW + HOUR }), NOW)).toBe(false);
    });

    // 빈 문자열은 해제의 인코딩이다 — 오버라이드가 없다는 뜻이지 상태가 있다는 뜻이 아니다.
    it('adminStatus가 빈 문자열이면(해제) 활성이 아니다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: '' }), NOW)).toBe(false);
    });

    it('만료 시각이 없으면 무기한이라 활성이다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'active' }), NOW)).toBe(true);
    });

    // 무기한에 특수값을 두지 않기로 한 설계라, 0도 "안 정해짐"이다.
    it('만료 시각이 0이면 무기한이라 활성이다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'active', adminUntil: 0 }), NOW)).toBe(true);
    });

    it('만료 시각이 미래면 활성이다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'active', adminUntil: NOW + HOUR }), NOW)).toBe(true);
    });

    it('만료 시각이 지났으면 활성이 아니다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'active', adminUntil: NOW - HOUR }), NOW)).toBe(false);
    });

    it('만료 시각이 정확히 현재면 활성이 아니다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'active', adminUntil: NOW }), NOW)).toBe(false);
    });

    it('차단 상태도 같은 규칙으로 활성 여부를 따진다', () => {
        expect(isAdminOverrideActive(membership({ adminStatus: 'expired', adminUntil: NOW + HOUR }), NOW)).toBe(true);
        expect(isAdminOverrideActive(membership({ adminStatus: 'canceled', adminUntil: NOW - HOUR }), NOW)).toBe(false);
    });
});

describe('resolveEffectiveProductId', () => {
    it('오버라이드가 활성이고 등급이 있으면 그 등급을 쓴다', () => {
        const $m = membership({ adminStatus: 'active', adminProductId: 'pro_tier_03', productId: 'pro_tier_01' });
        expect(resolveEffectiveProductId($m, NOW)).toBe('pro_tier_03');
    });

    it('오버라이드가 활성이어도 등급이 없으면 영수증 상품을 쓴다', () => {
        const $m = membership({ adminStatus: 'active', productId: 'pro_tier_01' });
        expect(resolveEffectiveProductId($m, NOW)).toBe('pro_tier_01');
    });

    // 부여 기간이 끝나면 등급도 같이 풀린다 — 값이 남아 있어도 읽지 않는다.
    it('오버라이드가 만료됐으면 등급이 남아 있어도 영수증 상품을 쓴다', () => {
        const $m = membership({
            adminStatus: 'active',
            adminUntil: NOW - HOUR,
            adminProductId: 'pro_tier_03',
            productId: 'pro_tier_01',
        });
        expect(resolveEffectiveProductId($m, NOW)).toBe('pro_tier_01');
    });

    it('둘 다 없으면 undefined다', () => {
        expect(resolveEffectiveProductId(membership({}), NOW)).toBeUndefined();
        expect(resolveEffectiveProductId(undefined, NOW)).toBeUndefined();
    });

    it('영수증 상품이 빈 문자열이면 undefined로 준다', () => {
        expect(resolveEffectiveProductId(membership({ productId: '' }), NOW)).toBeUndefined();
    });
});
