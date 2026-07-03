import { renderHook } from '@testing-library/react';

import { useSessionProfile } from '@chatic/app-runtime';

import { useUserPermissions } from './useUserPermissions';

jest.mock('@chatic/app-runtime', () => ({ useSessionProfile: jest.fn() }));

const setFacts = (opts: { isGuest: boolean; isCloudActive: boolean }) => {
    (useSessionProfile as jest.Mock).mockReturnValue({
        userRole: opts.isGuest ? 'guest' : 'user',
        isGuest: opts.isGuest,
        isCloudActive: opts.isCloudActive,
        userName: 'x',
    });
};

describe('useUserPermissions', () => {
    it('guest: capped channels, no place/cloud-profile, but can create channels + select cloud', () => {
        setFacts({ isGuest: true, isCloudActive: false });

        const { result } = renderHook(() => useUserPermissions());

        expect(result.current).toEqual({
            canCreateChannel: true,
            canCreatePlace: false,
            useCloudProfile: false,
            canSelectCloud: true,
            maxChannels: 3,
        });
    });

    it('signed-in user without an active cloud: no place/cloud-profile, uncapped channels', () => {
        setFacts({ isGuest: false, isCloudActive: false });

        const { result } = renderHook(() => useUserPermissions());

        expect(result.current.canCreatePlace).toBe(false);
        expect(result.current.useCloudProfile).toBe(false);
        expect(result.current.maxChannels).toBe(100);
    });

    it('signed-in user with an active cloud: can create place + edit cloud profile', () => {
        setFacts({ isGuest: false, isCloudActive: true });

        const { result } = renderHook(() => useUserPermissions());

        expect(result.current.canCreatePlace).toBe(true);
        expect(result.current.useCloudProfile).toBe(true);
        expect(result.current.maxChannels).toBe(100);
    });
});
