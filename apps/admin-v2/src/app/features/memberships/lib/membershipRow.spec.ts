/**
 * `lib/memberships/membershipRow.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from './membershipRow';
import { configuredStage, describeTargetServer, endpointOverrideFor, relayBaseFor, relayHost } from './targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const view = (fields: Partial<MembershipView>): MembershipView => fields as MembershipView;

describe('describeOverrideBadge', () => {
    it('오버라이드가 없으면 없음이다', () => {
        expect(describeOverrideBadge(view({ status: 'active' }), NOW)).toEqual({ kind: 'none', label: '없음' });
    });

    it('해제된 레코드도 없음이다', () => {
        expect(describeOverrideBadge(view({ adminStatus: '' }), NOW).kind).toBe('none');
    });

    it('무기한 부여를 무기한으로 표시한다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'active' }), NOW);
        expect(badge.kind).toBe('grant');
        expect(badge.label).toContain('무기한');
    });

    it('기한부 부여에 만료일을 붙인다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'active', adminUntil: NOW + HOUR }), NOW);
        expect(badge.kind).toBe('grant');
        expect(badge.label).toContain('부여');
        expect(badge.label).not.toContain('무기한');
    });

    it('차단은 어떤 상태로 막았는지까지 보여준다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'canceled' }), NOW);
        expect(badge.kind).toBe('block');
        expect(badge.label).toContain('canceled');
    });

    // 만료된 부여는 더 이상 부여가 아니다 — 배지가 남아 있으면 운영자가 오해한다.
    it('만료된 오버라이드는 없음으로 돌아간다', () => {
        expect(describeOverrideBadge(view({ adminStatus: 'active', adminUntil: NOW - HOUR }), NOW).kind).toBe('none');
    });
});

describe('hasDerivationMismatch', () => {
    it('status가 active인데 isValid가 false면 어긋난 것이다', () => {
        expect(hasDerivationMismatch(view({ status: 'active', isValid: false }))).toBe(true);
    });

    it('둘이 맞으면 어긋나지 않는다', () => {
        expect(hasDerivationMismatch(view({ status: 'active', isValid: true }))).toBe(false);
        expect(hasDerivationMismatch(view({ status: 'expired', isValid: false }))).toBe(false);
    });

    it('status가 active가 아닌데 isValid가 true면 어긋난 것이다', () => {
        expect(hasDerivationMismatch(view({ status: 'expired', isValid: true }))).toBe(true);
    });

    it('isValid가 없으면 판단하지 않는다', () => {
        expect(hasDerivationMismatch(view({ status: 'active' }))).toBe(false);
    });

    it('status가 없으면 판단하지 않는다', () => {
        expect(hasDerivationMismatch(view({ isValid: false }))).toBe(false);
    });
});

describe('describeGrade', () => {
    it('오버라이드 등급이 활성이면 영수증 상품을 괄호로 함께 보여준다', () => {
        const $m = view({ adminStatus: 'active', adminProductId: 'pro_tier_03', productId: 'pro_tier_01' });
        expect(describeGrade($m, NOW)).toBe('pro_tier_03 (영수증: pro_tier_01)');
    });

    it('오버라이드가 만료됐으면 영수증 상품만 보여준다', () => {
        const $m = view({
            adminStatus: 'active',
            adminUntil: NOW - HOUR,
            adminProductId: 'pro_tier_03',
            productId: 'pro_tier_01',
        });
        expect(describeGrade($m, NOW)).toBe('pro_tier_01');
    });

    it('상품이 없으면 -를 보여준다', () => {
        expect(describeGrade(view({}), NOW)).toBe('-');
    });
});

describe('describeTargetServer', () => {
    it('dou-v1 은 운영이다', () => {
        expect(describeTargetServer('https://api.example.com/dou-v1')).toEqual({
            endpoint: 'https://api.example.com/dou-v1',
            isProd: true,
            label: '운영',
        });
    });

    it('dou-d1 은 개발이다', () => {
        expect(describeTargetServer('https://api.example.com/dou-d1').label).toBe('개발');
    });

    it('끝의 슬래시는 무시한다', () => {
        expect(describeTargetServer('https://api.example.com/dou-v1/').isProd).toBe(true);
    });

    // 운영 URL을 개발이라고 우기는 쪽이 비싼 실수다. 백엔드 엔드포인트(/v1)도 릴레이가 아니다.
    it('규칙에 안 맞으면 개발이라고 단정하지 않고 모른다고 한다', () => {
        expect(describeTargetServer('https://api.example.com/x9').label).toBe('알 수 없음');
        expect(describeTargetServer('https://api.example.com/v1').label).toBe('알 수 없음');
    });

    it('비어 있으면 미설정으로 표시한다', () => {
        expect(describeTargetServer(undefined).endpoint).toBe('(미설정)');
        expect(describeTargetServer('  ').label).toBe('알 수 없음');
    });
});

describe('relayHost / relayBaseFor', () => {
    // 릴레이는 `dou-XX` 다. `/d1` 로 만들면 다른 서비스라 전 라우트가 404 다.
    it('설정된 엔드포인트에서 dou 스테이지 구간을 떼어낸다', () => {
        expect(relayHost('https://api.example.com/dou-d1')).toBe('https://api.example.com');
        expect(relayHost('https://api.example.com/dou-v1/')).toBe('https://api.example.com');
    });

    it('dou 구간이 없으면 그대로 둔다', () => {
        expect(relayHost('https://api.example.com')).toBe('https://api.example.com');
    });

    it('고른 스테이지로 dou- 를 붙여 다시 만든다', () => {
        expect(relayBaseFor('https://api.example.com/dou-d1', 'v1')).toBe('https://api.example.com/dou-v1');
        expect(relayBaseFor('https://api.example.com/dou-v1', 'd1')).toBe('https://api.example.com/dou-d1');
    });

    it('설정이 없으면 빈 문자열이다', () => {
        expect(relayBaseFor(undefined, 'v1')).toBe('');
        expect(relayBaseFor('   ', 'd1')).toBe('');
    });
});

describe('endpointOverrideFor', () => {
    afterEach(() => vi.unstubAllEnvs());

    // 설정된 스테이지에는 override 를 안 보낸다. 보내면 클라이언트가 해석하는 릴레이(딥링크·window
    // 오버라이드를 먼저 보는)를 버리고 빌드 시점 값으로 못박는다 — 그게 404 회귀의 원인이었다.
    it('설정된 스테이지면 override 없이 둔다', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', 'https://api.example.com/dou-d1');

        expect(configuredStage()).toBe('d1');
        expect(endpointOverrideFor('d1')).toBeUndefined();
    });

    it('다른 스테이지를 고르면 dou- 를 붙인 주소를 준다', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', 'https://api.example.com/dou-d1');

        expect(endpointOverrideFor('v1')).toBe('https://api.example.com/dou-v1');
    });

    it('운영이 기본이면 반대로 동작한다', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', 'https://api.example.com/dou-v1');

        expect(configuredStage()).toBe('v1');
        expect(endpointOverrideFor('v1')).toBeUndefined();
        expect(endpointOverrideFor('d1')).toBe('https://api.example.com/dou-d1');
    });

    it('설정이 없으면 override 를 만들지 않는다', () => {
        vi.stubEnv('VITE_DOU_ENDPOINT', '');

        expect(endpointOverrideFor('v1')).toBeUndefined();
    });
});
