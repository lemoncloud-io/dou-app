/**
 * `lib/memberships/membershipRow.spec.ts`
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeGrade, describeOverrideBadge, hasDerivationMismatch } from './membershipRow';
import {
    configuredStage,
    describeTargetServer,
    endpointOverrideFor,
    relayEndpointFor,
    relayStageOf,
    targetEndpointFor,
} from './targetServer';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const view = (fields: Partial<MembershipView>): MembershipView => fields as MembershipView;

describe('describeOverrideBadge', () => {
    it('오버라이드가 없으면 없음이다', () => {
        expect(describeOverrideBadge(view({ status: 'active' }), NOW)).toEqual({ kind: 'none', label: 'None' });
    });

    it('해제된 레코드도 없음이다', () => {
        expect(describeOverrideBadge(view({ adminStatus: '' }), NOW).kind).toBe('none');
    });

    it('무기한 부여를 무기한으로 표시한다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'active' }), NOW);
        expect(badge.kind).toBe('grant');
        expect(badge.label).toContain('Indefinite');
    });

    it('기한부 부여에 만료일을 붙인다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'active', adminUntil: NOW + HOUR }), NOW);
        expect(badge.kind).toBe('grant');
        expect(badge.label).toContain('Grant');
        expect(badge.label).not.toContain('Indefinite');
    });

    it('차단은 어떤 상태로 막았는지까지 보여준다', () => {
        const badge = describeOverrideBadge(view({ adminStatus: 'canceled' }), NOW);
        expect(badge.kind).toBe('block');
        expect(badge.label).toContain('canceled');
    });

    // An expired grant is no longer a grant — if the badge lingers, the operator gets misled.
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
        expect(describeGrade($m, NOW)).toBe('pro_tier_03 (receipt: pro_tier_01)');
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
            label: 'Production',
        });
    });

    it('dou-d1 은 개발이다', () => {
        expect(describeTargetServer('https://api.example.com/dou-d1').label).toBe('Development');
    });

    it('끝의 슬래시는 무시한다', () => {
        expect(describeTargetServer('https://api.example.com/dou-v1/').isProd).toBe(true);
    });

    // Insisting a production URL is dev is the expensive mistake. A backend endpoint (/v1) isn't a relay either.
    it('규칙에 안 맞으면 개발이라고 단정하지 않고 모른다고 한다', () => {
        expect(describeTargetServer('https://api.example.com/x9').label).toBe('Unknown');
        expect(describeTargetServer('https://api.example.com/v1').label).toBe('Unknown');
    });

    it('비어 있으면 미설정으로 표시한다', () => {
        expect(describeTargetServer(undefined).endpoint).toBe('(not configured)');
        expect(describeTargetServer('  ').label).toBe('Unknown');
    });
});

describe('relayStageOf', () => {
    it('reads the stage off a trailing dou segment, slash or not', () => {
        expect(relayStageOf('https://api.example.com/dou-d1')).toBe('d1');
        expect(relayStageOf('https://api.example.com/dou-v1/')).toBe('v1');
    });

    it('is undefined for anything else, including an empty value', () => {
        expect(relayStageOf('https://api.example.com/v1')).toBeUndefined();
        expect(relayStageOf('https://api.example.com/dou-x9')).toBeUndefined();
        expect(relayStageOf(undefined)).toBeUndefined();
        expect(relayStageOf('')).toBeUndefined();
    });
});

// The two stages on different hosts, as they are once the dev stage moved domain.
const DEV_RELAY = 'https://dev.example.com/dou-d1';
const PROD_RELAY = 'https://prod.example.com/dou-v1';

const stubStages = (session: string) => {
    vi.stubEnv('VITE_DOU_ENDPOINT', session);
    vi.stubEnv('VITE_D1_RELAY_ENDPOINT', DEV_RELAY);
    vi.stubEnv('VITE_V1_RELAY_ENDPOINT', PROD_RELAY);
};

describe('relayEndpointFor', () => {
    afterEach(() => vi.unstubAllEnvs());

    it("reads each stage's relay from its own key", () => {
        stubStages(DEV_RELAY);

        expect(relayEndpointFor('d1')).toBe(DEV_RELAY);
        expect(relayEndpointFor('v1')).toBe(PROD_RELAY);
    });

    // The session's relay is not a template for the other stage: its host may not serve that stage.
    it('is empty when that stage is not configured, whatever the session relay is', () => {
        stubStages(DEV_RELAY);
        vi.stubEnv('VITE_V1_RELAY_ENDPOINT', '');

        expect(relayEndpointFor('v1')).toBe('');
    });
});

describe('targetEndpointFor', () => {
    afterEach(() => vi.unstubAllEnvs());

    it("is the session's own relay on its own stage, and the stage key otherwise", () => {
        stubStages('https://session.example.com/dou-d1/');

        expect(targetEndpointFor('d1')).toBe('https://session.example.com/dou-d1');
        expect(targetEndpointFor('v1')).toBe(PROD_RELAY);
    });
});

describe('endpointOverrideFor', () => {
    afterEach(() => vi.unstubAllEnvs());

    // Don't send an override when the stage is already configured. Sending one would discard the
    // relay the client resolves (deep links and the window override take precedence) and pin it to
    // the build-time value instead — that was the cause of the 404 regression.
    it('leaves the configured stage alone', () => {
        stubStages(DEV_RELAY);

        expect(configuredStage()).toBe('d1');
        expect(endpointOverrideFor('d1')).toBeUndefined();
    });

    it("points another stage at that stage's own key, on its own host", () => {
        stubStages(DEV_RELAY);

        expect(endpointOverrideFor('v1')).toBe(PROD_RELAY);
    });

    it('works the other way round when the session is on production', () => {
        stubStages(PROD_RELAY);

        expect(configuredStage()).toBe('v1');
        expect(endpointOverrideFor('v1')).toBeUndefined();
        expect(endpointOverrideFor('d1')).toBe(DEV_RELAY);
    });

    // Undefined here would quietly send the call to the session's relay — the other stage.
    it('throws, naming the key, when the other stage is not configured', () => {
        stubStages(DEV_RELAY);
        vi.stubEnv('VITE_V1_RELAY_ENDPOINT', '');

        expect(() => endpointOverrideFor('v1')).toThrow(/VITE_V1_RELAY_ENDPOINT is not set/);
    });
});
