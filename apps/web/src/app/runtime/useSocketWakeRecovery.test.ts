import { renderHook } from '@testing-library/react';

jest.mock('@chatic/app-runtime', () => ({
    recoverUnverifiedSockets: jest.fn().mockResolvedValue(undefined),
}));

// Capture the foreground handler instead of simulating the bridge/visibility sources — those merge
// rules are useAppVisibility/useAppForeground's own tested contract.
const foregroundHandlers: Array<() => void> = [];
jest.mock('../bridge', () => ({
    useAppForeground: (handler: () => void) => {
        foregroundHandlers.push(handler);
    },
}));

import { recoverUnverifiedSockets } from '@chatic/app-runtime';

import { useSocketWakeRecovery } from './useSocketWakeRecovery';

const mockRecover = recoverUnverifiedSockets as jest.Mock;

const emitForeground = () => foregroundHandlers.forEach(handler => handler());

describe('useSocketWakeRecovery — 포그라운드 웨이크 킥', () => {
    let now = 0;
    let dateNowSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        foregroundHandlers.length = 0;
        now = 100_000;
        dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
        dateNowSpy.mockRestore();
    });

    it('포그라운드 신호에서 recoverUnverifiedSockets를 호출한다', () => {
        renderHook(() => useSocketWakeRecovery());

        emitForeground();

        expect(mockRecover).toHaveBeenCalledTimes(1);
    });

    it('스로틀 창(5초) 안의 반복 신호는 한 번으로 합쳐진다', () => {
        renderHook(() => useSocketWakeRecovery());

        emitForeground();
        now += 1_000;
        emitForeground();
        now += 3_000;
        emitForeground();

        expect(mockRecover).toHaveBeenCalledTimes(1);
    });

    it('스로틀 창이 지나면 다음 신호에서 다시 킥한다', () => {
        renderHook(() => useSocketWakeRecovery());

        emitForeground();
        now += 5_001;
        emitForeground();

        expect(mockRecover).toHaveBeenCalledTimes(2);
    });
});
