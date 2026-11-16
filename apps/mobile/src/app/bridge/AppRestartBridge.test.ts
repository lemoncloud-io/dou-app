import type { AppRestartBridge as Bridge } from './AppRestartBridge';

const mockReload = jest.fn();
let mockModule: { reload: (reason: string) => Promise<unknown> } | undefined;

jest.mock('react-native', () => ({
    get NativeModules() {
        return { AppRestart: mockModule };
    },
}));

const load = () => {
    let bridge!: typeof Bridge;
    jest.isolateModules(() => {
        bridge = require('./AppRestartBridge').AppRestartBridge;
    });
    return bridge;
};

describe('AppRestartBridge.reload', () => {
    beforeEach(() => {
        mockReload.mockReset();
        mockModule = { reload: (reason: string) => mockReload(reason) };
    });

    it('asks the native module to reload, with the reason', async () => {
        mockReload.mockResolvedValue(true);

        await expect(load().reload('session-ended')).resolves.toBe(true);
        expect(mockReload).toHaveBeenCalledWith('session-ended');
    });

    it('answers false when the native side has no host to reload', async () => {
        mockReload.mockResolvedValue(false);

        await expect(load().reload('session-ended')).resolves.toBe(false);
    });

    it('answers false when the module is missing or the call rejects', async () => {
        mockModule = undefined;
        await expect(load().reload('x')).resolves.toBe(false);

        mockModule = { reload: () => Promise.reject(new Error('boom')) };
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        await expect(load().reload('x')).resolves.toBe(false);
    });
});
