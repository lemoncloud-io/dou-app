import { refreshBackgroundClouds, startBackgroundReceive } from './runtime';

const mockInstances: Array<{ destroy: jest.Mock; receiveNow: jest.Mock }> = [];

jest.mock('./BackgroundReceiver', () => ({
    BackgroundReceiver: jest.fn().mockImplementation(() => {
        const instance = { destroy: jest.fn(), receiveNow: jest.fn() };
        mockInstances.push(instance);
        return instance;
    }),
}));
jest.mock('../runtime', () => ({ getSocketManager: jest.fn(() => ({})) }));
jest.mock('./SyncManager', () => ({ SyncManager: jest.fn() }));

describe('startBackgroundReceive / refreshBackgroundClouds', () => {
    beforeEach(() => {
        mockInstances.length = 0;
    });

    it('is a no-op to refresh while nothing is receiving', () => {
        expect(() => refreshBackgroundClouds()).not.toThrow();
    });

    it('refreshes the running receiver, and nothing once it is stopped', () => {
        const stop = startBackgroundReceive();
        refreshBackgroundClouds();
        expect(mockInstances[0].receiveNow).toHaveBeenCalledTimes(1);

        stop();
        expect(mockInstances[0].destroy).toHaveBeenCalledTimes(1);
        refreshBackgroundClouds();
        expect(mockInstances[0].receiveNow).toHaveBeenCalledTimes(1);
    });

    it('a second start replaces the first, and the first stop does not take the second down', () => {
        // StrictMode runs an effect, its cleanup and the effect again; a remount can interleave the same way.
        const stopFirst = startBackgroundReceive();
        const stopSecond = startBackgroundReceive();
        expect(mockInstances[0].destroy).toHaveBeenCalledTimes(1);

        stopFirst();
        refreshBackgroundClouds();
        expect(mockInstances[1].receiveNow).toHaveBeenCalledTimes(1);
        expect(mockInstances[1].destroy).not.toHaveBeenCalled();

        stopSecond();
        expect(mockInstances[1].destroy).toHaveBeenCalledTimes(1);
    });
});
