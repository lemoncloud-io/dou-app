import { describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

/**
 * There used to be TWO hooks called `useSiteSwitch` — app-runtime's moved the SOCKET session
 * (SDK `auth.switch`), web-core's only re-issued the HTTP token. Importing the wrong one made every
 * switch show the previous place's channels, filtered out by sid, hence an empty sidebar until a
 * reload.
 *
 * ADR-0070 step 3 merged the pair — the socket-notifying version won and the other is gone, so the
 * "which one is wired" hazard no longer exists. What still needs pinning is the behavior that made
 * it matter: the switch must reach `switchSite`, and a click on the current place must not.
 */
const switchSite = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSiteSwitch: () => ({ switchSite, isSwitching: false }),
            useSessionSelection: () => ({ selectedSiteId: 'site-1' }),
        },
    },
}));

import { useSelectPlace } from './useSelectPlace';

describe('useSelectPlace', () => {
    it('선택한 place로 소켓 세션을 옮긴다', () => {
        switchSite.mockClear();
        const { result } = renderHook(() => useSelectPlace());

        let started = false;
        act(() => {
            started = result.current.switchPlace('site-2');
        });

        expect(switchSite).toHaveBeenCalledWith('site-2');
        expect(started).toBe(true);
    });

    it('이미 선택된 place 클릭은 무시한다', () => {
        switchSite.mockClear();
        const { result } = renderHook(() => useSelectPlace());

        let started = true;
        act(() => {
            started = result.current.switchPlace('site-1');
        });

        expect(switchSite).not.toHaveBeenCalled();
        expect(started).toBe(false);
    });

    it('reports a switch that failed to the caller that asked for it', async () => {
        switchSite.mockReset();
        switchSite.mockRejectedValueOnce(new Error('switch failed'));
        const onFailed = vi.fn();
        const { result } = renderHook(() => useSelectPlace());

        await act(async () => {
            result.current.switchPlace('site-2', onFailed);
        });

        expect(onFailed).toHaveBeenCalledTimes(1);
    });

    it('lets a caller wait for the switch into a place', async () => {
        switchSite.mockReset();
        switchSite.mockResolvedValueOnce(undefined);
        const { result } = renderHook(() => useSelectPlace());

        await act(async () => {
            await result.current.enterPlace('site-2');
        });

        expect(switchSite).toHaveBeenCalledWith('site-2');
    });

    it('hands a failed awaited switch back to the caller', async () => {
        switchSite.mockReset();
        switchSite.mockRejectedValueOnce(new Error('switch failed'));
        const { result } = renderHook(() => useSelectPlace());

        await expect(result.current.enterPlace('site-2')).rejects.toThrow('switch failed');
    });

    // A cloud's first place is auto-selected the moment it shows up, which is before its creator
    // asks to enter it: two switches for one place went out.
    it('joins a switch into the same place that is already running', async () => {
        switchSite.mockReset();
        let land!: () => void;
        switchSite.mockReturnValueOnce(new Promise<void>(resolve => (land = resolve)));
        const { result } = renderHook(() => useSelectPlace());

        act(() => {
            result.current.switchPlace('site-2');
        });
        let entered = false;
        const entering = result.current.enterPlace('site-2').then(() => (entered = true));
        await Promise.resolve();
        expect(entered).toBe(false);

        await act(async () => {
            land();
            await entering;
        });

        expect(entered).toBe(true);
        expect(switchSite).toHaveBeenCalledTimes(1);
    });

    it('does not switch into the place the session is already in', async () => {
        switchSite.mockReset();
        const { result } = renderHook(() => useSelectPlace());

        await result.current.enterPlace('site-1');

        expect(switchSite).not.toHaveBeenCalled();
    });

    it('does not report a switch that succeeded', async () => {
        switchSite.mockReset();
        switchSite.mockResolvedValueOnce(undefined);
        const onFailed = vi.fn();
        const { result } = renderHook(() => useSelectPlace());

        await act(async () => {
            result.current.switchPlace('site-2', onFailed);
        });

        expect(onFailed).not.toHaveBeenCalled();
    });
});
