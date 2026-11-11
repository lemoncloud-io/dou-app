import { act, renderHook } from '@testing-library/react';

import { usePairedCloudCheck } from './usePairedCloudCheck';

const checkAll = jest.fn();
let paired: string[] = [];

jest.mock('@chatic/auth/pairing/pairedCloudSessions', () => ({
    PAIRED_CLOUD_CHECK_INTERVAL_MS: 600_000,
    pairedCloudSessions: { checkAll: () => checkAll() },
}));
const clear = jest.fn();
let relayGuest = true;
jest.mock('@chatic/auth/pairing/pairedClouds', () => ({ pairedClouds: { list: () => paired, clear: () => clear() } }));
jest.mock('@chatic/auth/pairing/pairedSession', () => ({ isRelayGuest: () => relayGuest }));
let initialized = true;
jest.mock('../session/readers/useSessionAuth', () => ({ useSessionAuth: () => ({ isInitialized: initialized }) }));

const flush = async () => {
    await act(async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve();
    });
};

beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    paired = ['1000002'];
    relayGuest = true;
    initialized = true;
    checkAll.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe('usePairedCloudCheck', () => {
    it('checks on mount and then every ten minutes', async () => {
        renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        expect(checkAll).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(600_000);
        });
        await flush();
        expect(checkAll).toHaveBeenCalledTimes(2);
    });

    it('waits for the session to initialise before the first check — the relay is not up before that', async () => {
        initialized = false;
        const { rerender, result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        await act(async () => {
            await result.current.check();
        });
        expect(checkAll).not.toHaveBeenCalled();

        initialized = true;
        rerender();
        await flush();
        expect(checkAll).toHaveBeenCalledTimes(1);
    });

    it('tells the app about each cloud that ended', async () => {
        checkAll.mockResolvedValueOnce(['1000002']);
        const onEnded = jest.fn();
        renderHook(() => usePairedCloudCheck(onEnded));
        await flush();

        expect(onEnded).toHaveBeenCalledWith('1000002');
    });

    it('does nothing without a paired cloud', async () => {
        paired = [];
        const { result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        await act(async () => {
            await result.current.check();
        });

        expect(checkAll).not.toHaveBeenCalled();
    });

    it('never runs two rounds at once', async () => {
        let release: () => void = () => undefined;
        checkAll.mockImplementationOnce(() => new Promise(resolve => (release = () => resolve([]))));
        const { result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();

        await act(async () => {
            await result.current.check();
        });
        expect(checkAll).toHaveBeenCalledTimes(1);
        release();
        await flush();
    });

    it('drops a guest-era list once the device signed in to an account of its own', async () => {
        relayGuest = false;
        renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();

        expect(clear).toHaveBeenCalled();
        expect(checkAll).not.toHaveBeenCalled();
    });
});
