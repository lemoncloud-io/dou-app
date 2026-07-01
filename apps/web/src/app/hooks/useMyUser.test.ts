import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

import { useMyUser } from './useMyUser';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn() }));

const observeItemMock = jest.fn();
const getMyProfileMock = jest.fn();

// Wire observeItem to immediately emit the given user and return a disposer.
const emit = (user: unknown) => {
    observeItemMock.mockImplementation((_id: string, cb: (u: unknown) => void) => {
        if (user !== undefined) cb(user);
        return jest.fn();
    });
};

beforeEach(() => {
    jest.clearAllMocks();
    getMyProfileMock.mockResolvedValue(undefined);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { observeItem: observeItemMock, getMyProfile: getMyProfileMock },
    });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
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
});
