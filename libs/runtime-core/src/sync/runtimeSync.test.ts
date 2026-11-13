import type * as RuntimeSyncModule from './runtimeSync';

const mockManager = {
    register: jest.fn(() => jest.fn()),
    updateLocalSnapshot: jest.fn(),
    listTargets: jest.fn(() => [{ type: 'chat', id: 'ch-1', cid: 'c-1' }]),
};
jest.mock('@chatic/sync', () => ({ getSyncManager: () => mockManager }));

// Required after the mock: its factory reads `mockManager` above.
const { createCoreRuntimeSync } = require('./runtimeSync') as typeof RuntimeSyncModule;

describe('the core runtime sync', () => {
    beforeEach(() => jest.clearAllMocks());

    it("registers a target for its cloud and hands back the manager's drop", () => {
        const drop = jest.fn();
        mockManager.register.mockReturnValueOnce(drop);

        const stop = createCoreRuntimeSync().registerTarget({ type: 'join', id: 'j-1' } as never, { cid: 'c-1' });

        expect(mockManager.register).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, { cid: 'c-1' });
        expect(stop).toBe(drop);
    });

    it("passes the cache's baseline on, and lists the targets", async () => {
        const sync = createCoreRuntimeSync();

        sync.updateLocalSnapshot({ type: 'chat', id: 'ch-1' } as never, { lastNo: 9 }, { cid: 'c-1' });

        expect(mockManager.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { lastNo: 9 },
            {
                cid: 'c-1',
            }
        );
        await expect(sync.listTargets()).resolves.toEqual([{ type: 'chat', id: 'ch-1', cid: 'c-1' }]);
    });

    it('takes options that crossed the bridge as null for none', () => {
        createCoreRuntimeSync().registerTarget({ type: 'join', id: 'j-1' } as never, null as never);

        expect(mockManager.register).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, undefined);
    });
});
