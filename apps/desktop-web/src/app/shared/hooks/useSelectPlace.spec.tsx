import { describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

// Two different hooks are called `useSiteSwitch`. The one in @chatic/app-runtime moves the
// SOCKET session to the new site (SDK `auth.switch`); the one in @chatic/web-core only
// re-issues the HTTP token and leaves the socket where it was. Channels arrive over the
// socket, so importing the web-core one made every switch show the previous place's channels
// — filtered out by sid, hence an empty sidebar until a reload
// (.claude/20260804/DEBUG-14-20-13.md). This asserts which one is wired.
const socketSwitchSite = vi.fn();
const legacySwitchSite = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    useSiteSwitch: () => ({ switchSite: socketSwitchSite, isSwitching: false }),
}));
vi.mock('@chatic/web-core', () => ({
    useSiteSwitch: () => ({ switchSite: legacySwitchSite, isSwitching: false }),
    useSessionSelection: () => ({ selectedSiteId: 'site-1' }),
}));

import { useSelectPlace } from './useSelectPlace';

describe('useSelectPlace', () => {
    it('switches the socket session, not just the HTTP token', () => {
        const { result } = renderHook(() => useSelectPlace());

        act(() => result.current.switchPlace('site-2'));

        expect(socketSwitchSite).toHaveBeenCalledWith('site-2');
        expect(legacySwitchSite).not.toHaveBeenCalled();
    });

    it('ignores a click on the place already selected', () => {
        socketSwitchSite.mockClear();
        const { result } = renderHook(() => useSelectPlace());

        act(() => result.current.switchPlace('site-1'));

        expect(socketSwitchSite).not.toHaveBeenCalled();
    });
});
