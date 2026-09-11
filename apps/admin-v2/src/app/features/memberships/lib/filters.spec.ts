/**
 * `lib/memberships/filters.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { activeFilters, asListParams, clearAllPatch, countByStatus, toChips } from './filters';

describe('activeFilters', () => {
    it('값이 있는 것만 센다', () => {
        expect(activeFilters({ status: 'expired', productId: '' })).toEqual(['status']);
    });

    // 빈 문자열은 "필터 없음"이지 ""로 거르라는 뜻이 아니다.
    it('공백만 있는 값은 필터가 아니다', () => {
        expect(activeFilters({ userId: '   ' })).toEqual([]);
    });

    it('아무것도 없으면 빈 목록이다', () => {
        expect(activeFilters({})).toEqual([]);
    });
});

describe('toChips', () => {
    it('칩에 무슨 조건인지와 값을 함께 적는다', () => {
        expect(toChips({ status: 'expired' })).toEqual([{ key: 'status', label: '상태 · expired' }]);
    });

    // 플래그라 값을 보여줘도 읽는 사람에게 보태는 게 없다.
    it('isSuper 는 값 없이 플래그로만 적는다', () => {
        expect(toChips({ isSuper: '1' })).toEqual([{ key: 'isSuper', label: 'isSuper=1' }]);
    });

    it('여러 개면 정해진 순서로 낸다', () => {
        expect(toChips({ userId: '1000904', status: 'active' }).map(c => c.key)).toEqual(['status', 'userId']);
    });
});

describe('clearAllPatch', () => {
    it('토글이 쥔 필터를 전부 빈 값으로 만든다', () => {
        expect(clearAllPatch()).toEqual({ status: '', productId: '', platform: '', userId: '', isSuper: '' });
    });
});

describe('countByStatus', () => {
    it('상태별로 세어 많은 것부터 낸다', () => {
        const rows = [{ status: 'active' }, { status: 'expired' }, { status: 'active' }];
        expect(countByStatus(rows)).toEqual([
            ['active', 2],
            ['expired', 1],
        ]);
    });

    it('상태가 없으면 unknown 으로 묶는다', () => {
        expect(countByStatus([{}, { status: '' }])).toEqual([['unknown', 2]]);
    });

    it('빈 목록이면 빈 결과다', () => {
        expect(countByStatus([])).toEqual([]);
    });
});

describe('asListParams', () => {
    it('페이지·한도와 필터를 함께 싣는다', () => {
        expect(asListParams({ status: 'active' }, 2, 20)).toEqual({
            page: 2,
            limit: 20,
            status: 'active',
            productId: undefined,
            platform: undefined,
            userId: undefined,
            isSuper: undefined,
        });
    });
});
