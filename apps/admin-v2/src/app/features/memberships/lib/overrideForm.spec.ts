/**
 * `lib/memberships/overrideForm.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import {
    buildOverrideBody,
    describeOverride,
    emptyOverrideForm,
    shouldSendAuto,
    toEpochEndOfDay,
    validateOverrideForm,
    type OverrideFormState,
} from './overrideForm';

import type { MembershipView } from '@lemoncloud/chatic-backend-api';

const form = (over: Partial<OverrideFormState> = {}): OverrideFormState => ({
    ...emptyOverrideForm(),
    reason: '고객 보상',
    ...over,
});

const NOW = new Date(2026, 8, 10, 12, 0, 0).getTime(); // 2026-09-10 12:00 로컬

describe('toEpochEndOfDay', () => {
    it('빈 값이면 undefined다 — 무기한의 인코딩이다', () => {
        expect(toEpochEndOfDay('')).toBeUndefined();
    });

    // "12-31까지 유효"가 그 날 하루를 포함해야 말이 맞는다.
    it('고른 날의 마지막 밀리초를 준다', () => {
        expect(toEpochEndOfDay('2026-12-31')).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
    });

    it('형식이 깨지면 undefined다', () => {
        expect(toEpochEndOfDay('2026-13')).toBeUndefined();
        expect(toEpochEndOfDay('nope')).toBeUndefined();
    });

    // Date 생성자는 범위를 넘긴 값을 다음 달·다음 해로 조용히 굴린다.
    it('달력에 없는 날짜를 굴리지 않고 거절한다', () => {
        expect(toEpochEndOfDay('2026-13-40')).toBeUndefined();
        expect(toEpochEndOfDay('2026-02-30')).toBeUndefined();
    });
});

describe('validateOverrideForm', () => {
    it('사유가 비면 막는다', () => {
        expect(validateOverrideForm(form({ reason: '' }), NOW)).toContain('사유를 입력해 주세요.');
    });

    it('공백만 있는 사유도 막는다', () => {
        expect(validateOverrideForm(form({ reason: '   ' }), NOW)).toContain('사유를 입력해 주세요.');
    });

    it('사유가 있고 만료일이 없으면 통과한다 — 무기한이다', () => {
        expect(validateOverrideForm(form(), NOW)).toEqual([]);
    });

    it('지난 만료일은 막는다', () => {
        expect(validateOverrideForm(form({ until: '2026-09-09' }), NOW)).toContain('만료일은 오늘 이후여야 합니다.');
    });

    // 하루의 끝으로 환산하므로 오늘을 골라도 미래다 — 서버의 "과거 거부" 규칙에 안 걸린다.
    it('오늘을 고르면 통과한다', () => {
        expect(validateOverrideForm(form({ until: '2026-09-10' }), NOW)).toEqual([]);
    });

    it('해제는 만료일을 보지 않는다', () => {
        expect(validateOverrideForm(form({ mode: 'release', until: '2020-01-01' }), NOW)).toEqual([]);
    });
});

describe('buildOverrideBody', () => {
    it('해제는 빈 상태 하나만 보낸다', () => {
        const body = buildOverrideBody(form({ mode: 'release', until: '2026-12-31', productId: 'pro_tier_02' }));
        expect(body).toEqual({ adminStatus: '', adminReason: '고객 보상' });
    });

    it('무기한 부여는 adminUntil을 아예 안 보낸다', () => {
        const body = buildOverrideBody(form());
        expect(body).toEqual({ adminStatus: 'active', adminReason: '고객 보상' });
        expect('adminUntil' in body).toBe(false);
    });

    it('기간 부여는 하루의 끝을 보낸다', () => {
        const body = buildOverrideBody(form({ until: '2026-12-31' }));
        expect(body.adminStatus).toBe('active');
        expect(body.adminUntil).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).getTime());
    });

    it('등급까지 부여하면 adminProductId가 실린다', () => {
        expect(buildOverrideBody(form({ productId: 'pro_tier_03' })).adminProductId).toBe('pro_tier_03');
    });

    it('차단은 고른 상태를 그대로 보낸다', () => {
        expect(buildOverrideBody(form({ mode: 'block', blockStatus: 'canceled' })).adminStatus).toBe('canceled');
    });

    // 차단은 자격을 뺏는 조작이라 등급이 의미가 없다.
    it('차단에는 등급을 싣지 않는다', () => {
        const body = buildOverrideBody(form({ mode: 'block', productId: 'pro_tier_03' }));
        expect('adminProductId' in body).toBe(false);
    });

    it('사유의 앞뒤 공백은 떼고 보낸다', () => {
        expect(buildOverrideBody(form({ reason: '  분쟁 처리  ' })).adminReason).toBe('분쟁 처리');
    });
});

describe('shouldSendAuto', () => {
    it('부여일 때만 auto가 의미를 가진다', () => {
        expect(shouldSendAuto(form({ auto: true }))).toBe(true);
        expect(shouldSendAuto(form({ mode: 'block', auto: true }))).toBe(false);
        expect(shouldSendAuto(form({ mode: 'release', auto: true }))).toBe(false);
    });

    it('기본값은 꺼짐이다', () => {
        expect(shouldSendAuto(form())).toBe(false);
        expect(emptyOverrideForm().auto).toBe(false);
    });
});

describe('describeOverride', () => {
    const membership = { userId: '1000904' } as MembershipView;

    it('차단 문구는 결제가 계속 나간다는 사실을 담는다', () => {
        const { lines } = describeOverride(form({ mode: 'block' }), membership);
        expect(lines.join(' ')).toContain('스토어 결제는 계속 나갑니다');
    });

    it('차단 문구는 Cloud가 실제로 멈춘다고 말한다', () => {
        const { lines } = describeOverride(form({ mode: 'block' }), membership);
        expect(lines.join(' ')).toContain('보류·회수 대상');
    });

    it('auto가 켜지면 Cloud가 만들어진다고 말한다', () => {
        const { lines } = describeOverride(form({ auto: true }), membership);
        expect(lines.join(' ')).toContain('생성 요청이 바로 큐에 들어갑니다');
    });

    it('auto가 꺼지면 한도만 는다고 말한다', () => {
        const { lines } = describeOverride(form(), membership);
        expect(lines.join(' ')).toContain('한도만 늘고');
    });

    it('무기한 부여는 해제 전까지 유지된다고 말한다', () => {
        const { lines } = describeOverride(form(), membership);
        expect(lines.join(' ')).toContain('기한 없이');
    });

    it('대상 유저를 문구에 넣는다', () => {
        expect(describeOverride(form(), membership).lines.join(' ')).toContain('1000904');
    });
});
