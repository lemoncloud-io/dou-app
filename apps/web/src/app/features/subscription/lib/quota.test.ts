import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { countOwnedClouds, evaluateCloudQuota, findExcessClouds } from './quota';

const cloud = (cloudNo: number, overrides: Partial<CloudView> = {}): CloudView =>
    ({ id: `CL${cloudNo}`, cloudNo, status: 'active', createdAt: cloudNo * 1000, ...overrides }) as CloudView;

describe('countOwnedClouds', () => {
    it('해제된(expired) 클라우드는 세지 않는다', () => {
        const clouds = [cloud(1), cloud(2, { status: 'expired' }), cloud(3, { status: 'suspended' })];

        expect(countOwnedClouds(clouds)).toBe(2);
    });
});

describe('evaluateCloudQuota', () => {
    it('미구독·만료는 한도와 무관하게 거절하고 사유를 남긴다', () => {
        expect(evaluateCloudQuota({ used: 0, limit: 3, state: 'none' })).toEqual({
            canAdd: false,
            reason: 'notEntitled',
        });
        expect(evaluateCloudQuota({ used: 0, limit: 3, state: 'expired' })).toEqual({
            canAdd: false,
            reason: 'notEntitled',
        });
    });

    it('해지 예약은 한도가 남아도 새 클라우드를 만들 수 없다 — 서버 guardQuota가 isValid로 막는다', () => {
        expect(evaluateCloudQuota({ used: 0, limit: 3, state: 'cancelScheduled' })).toEqual({
            canAdd: false,
            reason: 'cancelScheduled',
        });
    });

    it('한도 미달이면 허용한다', () => {
        expect(evaluateCloudQuota({ used: 1, limit: 3, state: 'active' })).toEqual({ canAdd: true });
    });

    it('한도에 닿으면 사유와 함께 거절한다', () => {
        expect(evaluateCloudQuota({ used: 3, limit: 3, state: 'active' })).toEqual({
            canAdd: false,
            reason: 'limitReached',
        });
    });

    it('한도를 모르면(null) 막지 않는다 — 0으로 읽어 유료 사용자를 세우면 안 된다', () => {
        // 슈퍼 멤버십이거나 상품 목록이 아직 안 왔을 때.
        expect(evaluateCloudQuota({ used: 9, limit: null, state: 'active' })).toEqual({ canAdd: true });
    });
});

describe('findExcessClouds', () => {
    it('한도 이내면 초과가 없다', () => {
        expect(findExcessClouds([cloud(1), cloud(2)], 2)).toEqual([]);
    });

    it('나중에 만든 클라우드가 초과 대상이 된다', () => {
        const clouds = [cloud(3), cloud(1), cloud(2)];

        expect(findExcessClouds(clouds, 1).map(c => c.cloudNo)).toEqual([2, 3]);
    });

    it('cloudNo가 없으면 생성 시각으로 순서를 정한다', () => {
        const clouds = [
            { id: 'CL-b', status: 'active', createdAt: 200 },
            { id: 'CL-a', status: 'active', createdAt: 100 },
        ] as CloudView[];

        expect(findExcessClouds(clouds, 1).map(c => c.id)).toEqual(['CL-b']);
    });

    it('해제된 클라우드는 초과 계산에서 빠진다', () => {
        const clouds = [cloud(1), cloud(2, { status: 'expired' }), cloud(3)];

        expect(findExcessClouds(clouds, 2)).toEqual([]);
    });

    it('한도를 모르면 초과를 단정하지 않는다', () => {
        expect(findExcessClouds([cloud(1), cloud(2)], null)).toEqual([]);
    });
});
