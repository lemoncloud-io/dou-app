/**
 * `api/memberships/membershipsQuery.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { buildMembershipListParams, patchMembershipRow } from './membershipsQuery';

import type { ListResult } from '@lemoncloud/chatic-backend-api/dist/cores/types';
import type { MembershipView } from '@lemoncloud/chatic-backend-api';

describe('buildMembershipListParams', () => {
    it('기본은 첫 페이지에 20건이고 필터가 없다', () => {
        expect(buildMembershipListParams()).toEqual({ page: 0, limit: 20 });
    });

    it('설정된 필터를 그대로 넘긴다', () => {
        expect(
            buildMembershipListParams({
                page: 2,
                limit: 50,
                status: 'expired',
                productId: 'pro_tier_01',
                platform: 'apple-inapp',
                userId: '1000904',
            })
        ).toEqual({
            page: 2,
            limit: 50,
            status: 'expired',
            productId: 'pro_tier_01',
            platform: 'apple-inapp',
            userId: '1000904',
        });
    });

    // 키가 없으면 필터 없음이지만, 빈 문자열은 그대로 매칭된다.
    it('빈 문자열 필터는 아예 보내지 않는다', () => {
        expect(buildMembershipListParams({ status: '', productId: '', platform: '', userId: '' })).toEqual({
            page: 0,
            limit: 20,
        });
    });

    it('isSuper 필터를 실을 수 있다 — 이관 잔여 확인용이다', () => {
        expect(buildMembershipListParams({ isSuper: '1' })).toEqual({ page: 0, limit: 20, isSuper: '1' });
    });
});

describe('patchMembershipRow', () => {
    const page = (): ListResult<MembershipView> => ({
        total: 2,
        list: [
            { userId: '1000904', status: 'expired' },
            { userId: '1000905', status: 'active' },
        ] as MembershipView[],
    });

    it('캐시가 없으면 그대로 둔다', () => {
        expect(patchMembershipRow(undefined, '1000904', {} as MembershipView)).toBeUndefined();
    });

    it('해당 유저의 행만 응답 값으로 덮는다', () => {
        const next = patchMembershipRow(page(), '1000904', {
            userId: '1000904',
            status: 'active',
            adminStatus: 'active',
        } as MembershipView);

        expect(next?.list[0]).toMatchObject({ status: 'active', adminStatus: 'active' });
        expect(next?.list[1]).toEqual({ userId: '1000905', status: 'active' });
    });

    // 필터가 안 걸린 페이지에는 그 유저가 없다 — 아무것도 바꾸지 않고 total 도 건드리지 않는다.
    it('없는 유저면 목록을 그대로 둔다', () => {
        const next = patchMembershipRow(page(), '9999', { userId: '9999' } as MembershipView);

        expect(next?.list).toEqual(page().list);
        expect(next?.total).toBe(2);
    });
});
