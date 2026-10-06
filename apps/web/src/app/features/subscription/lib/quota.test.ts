import type { CloudView } from '@lemoncloud/chatic-backend-api';

import { countOwnedClouds, evaluateCloudQuota } from './quota';

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

    // Adding one more state can silently fall through to the default branch (canAdd: true).
    // An admin block is rejected on the server anyway, since isValid is false there.
    it('관리자 차단도 거절한다 — 기본 갈래로 새지 않는다', () => {
        expect(evaluateCloudQuota({ used: 0, limit: 3, state: 'blocked' })).toEqual({
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
        // For a super membership, or when the product list hasn't arrived yet.
        expect(evaluateCloudQuota({ used: 9, limit: null, state: 'active' })).toEqual({ canAdd: true });
    });
});
