import { act, renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { getRelaySessionUser, useGlobalSession, useSessionIdentity } from '@chatic/web-core';

import { patchMyRelayUser, resetHeldRelayUserForTest, useMyUser } from './useMyUser';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useSessionIdentity: jest.fn(),
    useGlobalSession: jest.fn(),
    getRelaySessionUser: jest.fn(),
}));

const observeItemMock = jest.fn();
const getMyProfileMock = jest.fn();

// Wire observeItem to immediately emit the given user and return a disposer.
const emit = (user: unknown) => {
    observeItemMock.mockImplementation((_id: string, cb: (u: unknown) => void) => {
        if (user !== undefined) cb(user);
        return jest.fn();
    });
};

const setActiveCloud = (cloudId: string | null) => {
    (useGlobalSession as jest.Mock).mockReturnValue({ cloud: { cloudId } });
};

beforeEach(() => {
    jest.clearAllMocks();
    resetHeldRelayUserForTest();
    getMyProfileMock.mockResolvedValue(undefined);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { observeItem: observeItemMock, getMyProfile: getMyProfileMock },
    });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (getRelaySessionUser as jest.Mock).mockReturnValue(null);
    setActiveCloud('default');
});

describe('useMyUser', () => {
    it('observes the current user by id, triggers a one-shot fetch, and reflects the cached user', () => {
        emit({ id: 'me', name: 'FromCache', photo: 'cache.png', email: 'me@x.io' });

        const { result } = renderHook(() => useMyUser());

        expect(observeItemMock).toHaveBeenCalledWith('me', expect.any(Function));
        expect(getMyProfileMock).toHaveBeenCalledTimes(1);
        expect(result.current).toMatchObject({ name: 'FromCache', photo: 'cache.png', email: 'me@x.io' });
    });

    it('is null before the cache emits — no activeProfile seed (profile data comes from observeItem)', () => {
        emit(undefined); // observeItem never emits

        const { result } = renderHook(() => useMyUser());

        expect(result.current).toBeNull();
    });

    it('returns null when there is no userId', () => {
        (useSessionIdentity as jest.Mock).mockReturnValue({ userId: null });
        emit(undefined);

        const { result } = renderHook(() => useMyUser());

        expect(result.current).toBeNull();
    });

    it('클라우드 활성 중에는 관찰·fetch를 하지 않고 relay에서 유지한 값을 보여준다 (ADR-0045)', () => {
        // First render on the relay: observe + retain.
        emit({ id: 'me', name: 'RelayName', photo: 'relay.png' });
        const { result, rerender } = renderHook(() => useMyUser());
        expect(result.current).toMatchObject({ name: 'RelayName' });

        // Switch to a cloud: the active partition now holds the CLOUD profile, which must not leak in.
        setActiveCloud('cloud-a');
        observeItemMock.mockClear();
        getMyProfileMock.mockClear();
        rerender();

        expect(observeItemMock).not.toHaveBeenCalled();
        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ name: 'RelayName', photo: 'relay.png' });
    });

    it('클라우드 콜드 스타트(유지값 없음)에는 relay 세션 시드로 폴백한다', () => {
        setActiveCloud('cloud-a');
        (getRelaySessionUser as jest.Mock).mockReturnValue({ name: 'SeedName', photo: 'seed.png' });
        emit(undefined);

        const { result } = renderHook(() => useMyUser());

        expect(observeItemMock).not.toHaveBeenCalled();
        expect(getMyProfileMock).not.toHaveBeenCalled();
        expect(result.current).toMatchObject({ id: 'me', name: 'SeedName', photo: 'seed.png' });
    });

    it('클라우드 활성 중 계정 프로필을 저장하면 유지값 구독으로 즉시 반영된다', () => {
        // Retain a relay value first, then move onto a cloud — the relay partition is now unreadable.
        emit({ id: 'me', name: 'RelayName', photo: 'relay.png', email: 'me@x.io' });
        const { result, rerender } = renderHook(() => useMyUser());
        setActiveCloud('cloud-a');
        rerender();

        act(() => patchMyRelayUser('me', { name: 'Saved', photo: undefined }));

        // Merged onto the retained value: the untouched photo/email survive an undefined field.
        expect(result.current).toMatchObject({ id: 'me', name: 'Saved', photo: 'relay.png', email: 'me@x.io' });
    });

    it('다른 계정으로 바뀌면 이전 계정의 유지값을 재사용하지 않는다', () => {
        emit({ id: 'me', name: 'RelayName' });
        const { unmount } = renderHook(() => useMyUser());
        unmount();

        // Same SPA session, different uid (logout → login as someone else), cloud active.
        (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'someone-else' });
        setActiveCloud('cloud-a');
        const { result } = renderHook(() => useMyUser());

        expect(result.current).toBeNull();
    });
});
