/**
 * `lib/memberships/cloudAggregation.spec.ts`
 */
import { describe, expect, it } from 'vitest';

import { readAggrBuckets } from './cloudAggregation';

describe('readAggrBuckets', () => {
    it('없으면 빈 목록이다', () => {
        expect(readAggrBuckets(undefined)).toEqual([]);
    });

    it('status 집계를 버킷으로 편다', () => {
        expect(readAggrBuckets({ status: { active: 3, expired: 1 } })).toEqual([
            ['active', 3],
            ['expired', 1],
        ]);
    });

    // ListResult.aggr 은 `R | R[]` 이라 서버가 어느 쪽으로 보내도 받아야 한다.
    it('배열로 와도 합쳐서 편다', () => {
        expect(readAggrBuckets([{ status: { active: 2 } }, { status: { active: 1, hold: 4 } }])).toEqual([
            ['active', 3],
            ['hold', 4],
        ]);
    });

    it('집계 키 이름이 달라도 버킷을 읽는다', () => {
        expect(readAggrBuckets({ state: { active: 1 } })).toEqual([['active', 1]]);
    });

    it('빈 객체는 빈 목록이다', () => {
        expect(readAggrBuckets({})).toEqual([]);
    });
});
