import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../init';
import { registerSessionLogoutCallback } from './logoutCallbacks';

describe('registerSessionLogoutCallback', () => {
    afterEach(() => resetRuntimeEngine());

    it("runs a callback registered before the engine was handed over, on the engine's sign-out", () => {
        const callback = jest.fn();
        const stop = registerSessionLogoutCallback(callback);
        const session = fakeSessionView();

        initAppRuntime({ ...coreEngine, session });
        session.logout();

        expect(callback).toHaveBeenCalledTimes(1);
        stop();
        session.logout();
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('follows the engine it was last handed, and leaves the one before', () => {
        const callback = jest.fn();
        const stop = registerSessionLogoutCallback(callback);
        const first = fakeSessionView();
        const second = fakeSessionView();

        initAppRuntime({ ...coreEngine, session: first });
        initAppRuntime({ ...coreEngine, session: second });
        first.logout();
        second.logout();

        expect(callback).toHaveBeenCalledTimes(1);
        stop();
    });

    it('runs every callback though one throws', () => {
        const after = jest.fn();
        const stopThrowing = registerSessionLogoutCallback(() => {
            throw new Error('draft store write failed');
        });
        const stopAfter = registerSessionLogoutCallback(after);
        const session = fakeSessionView();

        initAppRuntime({ ...coreEngine, session });
        session.logout();

        expect(after).toHaveBeenCalledTimes(1);
        stopThrowing();
        stopAfter();
    });
});
