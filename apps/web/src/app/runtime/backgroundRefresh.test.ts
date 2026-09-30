import { registerBackgroundRefresh, requestBackgroundRefresh } from './backgroundRefresh';

describe('backgroundRefresh', () => {
    it('resolves at once when nothing is registered', async () => {
        await expect(requestBackgroundRefresh()).resolves.toBeUndefined();
    });

    it('runs the registered handler and settles with it', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        const unregister = registerBackgroundRefresh(handler);

        await requestBackgroundRefresh();

        expect(handler).toHaveBeenCalledTimes(1);
        unregister();
    });

    it('stops calling a handler once it is unregistered', async () => {
        const handler = jest.fn().mockResolvedValue(undefined);
        registerBackgroundRefresh(handler)();

        await requestBackgroundRefresh();

        expect(handler).not.toHaveBeenCalled();
    });

    it("does not let an older registration's cleanup clear a newer one", async () => {
        const older = jest.fn().mockResolvedValue(undefined);
        const newer = jest.fn().mockResolvedValue(undefined);
        const unregisterOlder = registerBackgroundRefresh(older);
        const unregisterNewer = registerBackgroundRefresh(newer);

        unregisterOlder();
        await requestBackgroundRefresh();

        expect(newer).toHaveBeenCalledTimes(1);
        expect(older).not.toHaveBeenCalled();
        unregisterNewer();
    });
});
