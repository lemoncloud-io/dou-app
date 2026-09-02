import { describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

/**
 * There used to be TWO hooks called `useSiteSwitch` — app-runtime's moved the SOCKET session
 * (SDK `auth.switch`), web-core's only re-issued the HTTP token. Importing the wrong one made every
 * switch show the previous place's channels, filtered out by sid, hence an empty sidebar until a
 * reload (.claude/20260804/DEBUG-14-20-13.md).
 *
 * ADR-0070 3단계 merged the pair — the socket-notifying version won and the other is gone, so the
 * "which one is wired" hazard no longer exists. What still needs pinning is the behavior that made
 * it matter: the switch must reach `switchSite`, and a click on the current place must not.
 */
const switchSite = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    useSiteSwitch: () => ({ switchSite, isSwitching: false }),
    useSessionSelection: () => ({ selectedSiteId: 'site-1' }),
}));

import { useSelectPlace } from './useSelectPlace';

describe('useSelectPlace', () => {
    it('선택한 place로 소켓 세션을 옮긴다', () => {
        switchSite.mockClear();
        const { result } = renderHook(() => useSelectPlace());

        act(() => result.current.switchPlace('site-2'));

        expect(switchSite).toHaveBeenCalledWith('site-2');
    });

    it('이미 선택된 place 클릭은 무시한다', () => {
        switchSite.mockClear();
        const { result } = renderHook(() => useSelectPlace());

        act(() => result.current.switchPlace('site-1'));

        expect(switchSite).not.toHaveBeenCalled();
    });
});
