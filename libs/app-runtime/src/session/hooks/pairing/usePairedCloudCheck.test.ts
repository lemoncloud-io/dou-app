import { act, renderHook } from '@testing-library/react';

import { coreEngine } from '@chatic/runtime-core/engine';
import { fakeSessionCommands } from '@chatic/runtime-core/testing/sessionCommands';
import { emptySessionSnapshot, fakeSessionView } from '@chatic/runtime-core/testing/sessionView';

import { initAppRuntime, resetRuntimeEngine } from '../../../init';
import { usePairedCloudCheck } from './usePairedCloudCheck';

// The round itself — the guest rule, re-issuing each cloud — is the engine's `checkPairedClouds`;
// what is left here is when the hook runs it.
const checkPairedClouds = jest.fn();
const session = fakeSessionView();
const paired = (cloudIds: string[]) => session.set({ pairing: { ...emptySessionSnapshot().pairing, cloudIds } });

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
    paired(['1000002']);
    initialized = true;
    checkPairedClouds.mockResolvedValue([]);
    initAppRuntime({ ...coreEngine, session, commands: fakeSessionCommands({ checkPairedClouds }) });
});
afterEach(() => {
    jest.useRealTimers();
    resetRuntimeEngine();
});

describe('usePairedCloudCheck', () => {
    it('checks on mount and then every ten minutes', async () => {
        renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        expect(checkPairedClouds).toHaveBeenCalledTimes(1);

        await act(async () => {
            jest.advanceTimersByTime(600_000);
        });
        await flush();
        expect(checkPairedClouds).toHaveBeenCalledTimes(2);
    });

    it('waits for the session to initialise before the first check — the relay is not up before that', async () => {
        initialized = false;
        const { rerender, result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        await act(async () => {
            await result.current.check();
        });
        expect(checkPairedClouds).not.toHaveBeenCalled();

        initialized = true;
        rerender();
        await flush();
        expect(checkPairedClouds).toHaveBeenCalledTimes(1);
    });

    it('tells the app about each cloud that ended', async () => {
        checkPairedClouds.mockResolvedValueOnce(['1000002']);
        const onEnded = jest.fn();
        renderHook(() => usePairedCloudCheck(onEnded));
        await flush();

        expect(onEnded).toHaveBeenCalledWith('1000002');
    });

    it('does nothing without a paired cloud', async () => {
        paired([]);
        const { result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();
        await act(async () => {
            await result.current.check();
        });

        expect(checkPairedClouds).not.toHaveBeenCalled();
    });

    it('never runs two rounds at once', async () => {
        let release: () => void = () => undefined;
        checkPairedClouds.mockImplementationOnce(() => new Promise(resolve => (release = () => resolve([]))));
        const { result } = renderHook(() => usePairedCloudCheck(jest.fn()));
        await flush();

        await act(async () => {
            await result.current.check();
        });
        expect(checkPairedClouds).toHaveBeenCalledTimes(1);
        release();
        await flush();
    });
});
