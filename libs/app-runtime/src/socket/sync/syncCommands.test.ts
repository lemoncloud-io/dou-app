import { coreEngine } from '@chatic/runtime-core/engine';

import { initAppRuntime, resetRuntimeEngine } from '../../init';
import { listSyncTargets, registerSyncTarget, updateSyncSnapshot } from './syncCommands';

const sync = {
    registerTarget: jest.fn(() => jest.fn()),
    updateLocalSnapshot: jest.fn(),
    listTargets: jest.fn(async () => []),
};

beforeEach(() => {
    jest.clearAllMocks();
    initAppRuntime({ ...coreEngine, sync });
});

afterEach(() => resetRuntimeEngine());

describe("the sync the app drives outside React, through the engine's sync", () => {
    it("registers a target for its cloud and hands back the engine's drop", () => {
        const drop = jest.fn();
        sync.registerTarget.mockReturnValueOnce(drop);

        expect(registerSyncTarget({ type: 'join', id: 'j-1' } as never, { cid: 'c-1' })).toBe(drop);
        expect(sync.registerTarget).toHaveBeenCalledWith({ type: 'join', id: 'j-1' }, { cid: 'c-1' });
    });

    it("passes the cache's baseline on, and lists the targets", async () => {
        updateSyncSnapshot({ type: 'chat', id: 'ch-1' } as never, { lastNo: 9 }, { cid: 'c-1' });
        await listSyncTargets();

        expect(sync.updateLocalSnapshot).toHaveBeenCalledWith(
            { type: 'chat', id: 'ch-1' },
            { lastNo: 9 },
            { cid: 'c-1' }
        );
        expect(sync.listTargets).toHaveBeenCalledTimes(1);
    });
});
