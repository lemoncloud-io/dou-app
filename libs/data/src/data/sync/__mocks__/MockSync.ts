import type { DomainSyncPlan, ISyncScheduler, SyncTarget } from '../sync';
import type { ISocketClient } from '../../remote/clients';

/**
 * DomainSyncPlan의 목업 구현체입니다.
 */
export class MockDomainSyncPlan implements DomainSyncPlan {
    getType = jest.fn<string, []>();
    run = jest.fn<Promise<number | undefined>, [ISocketClient, SyncTarget, number?]>();

    constructor(type = 'mock-domain') {
        this.getType.mockReturnValue(type);
        this.run.mockResolvedValue(Date.now()); // 기본적으로 현재 시간을 tick으로 반환
    }
}

/**
 * SyncScheduler의 목업 구현체입니다.
 */
export class MockSyncScheduler implements ISyncScheduler {
    register = jest.fn<void, [DomainSyncPlan]>();
    addTarget = jest.fn<void, [SyncTarget]>();
    removeTarget = jest.fn<void, [SyncTarget]>();
    start = jest.fn<void, []>();
    stop = jest.fn<void, []>();
}
