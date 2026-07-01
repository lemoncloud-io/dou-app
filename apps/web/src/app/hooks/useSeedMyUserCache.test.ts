import { renderHook, waitFor } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { getActiveSessionUser, useSessionIdentity } from '@chatic/web-core';

import { useSeedMyUserCache } from './useSeedMyUserCache';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useSessionIdentity: jest.fn(), getActiveSessionUser: jest.fn() }));

const cacheReadMock = jest.fn();
const cacheWriteMock = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    cacheReadMock.mockResolvedValue(null);
    cacheWriteMock.mockResolvedValue(undefined);
    (useRuntimeRepositories as jest.Mock).mockReturnValue({
        user: { cacheRead: cacheReadMock, cacheWrite: cacheWriteMock },
    });
    (useSessionIdentity as jest.Mock).mockReturnValue({ userId: 'me' });
    (getActiveSessionUser as jest.Mock).mockReturnValue({ name: 'Seed', photo: 'seed.png' });
});

describe('useSeedMyUserCache', () => {
    it('seeds the user cache from the active session token user when the cache is empty', async () => {
        renderHook(() => useSeedMyUserCache());

        await waitFor(() => expect(cacheWriteMock).toHaveBeenCalledTimes(1));
        expect(cacheWriteMock).toHaveBeenCalledWith({ id: 'me', name: 'Seed', photo: 'seed.png' });
    });

    it('does not clobber an existing cached user (seed only when empty)', async () => {
        cacheReadMock.mockResolvedValue({ id: 'me', name: 'FromCache' });

        renderHook(() => useSeedMyUserCache());

        await waitFor(() => expect(cacheReadMock).toHaveBeenCalled());
        expect(cacheWriteMock).not.toHaveBeenCalled();
    });

    it('does nothing when there is no session user', async () => {
        (getActiveSessionUser as jest.Mock).mockReturnValue(null);

        renderHook(() => useSeedMyUserCache());

        await Promise.resolve();
        expect(cacheReadMock).not.toHaveBeenCalled();
        expect(cacheWriteMock).not.toHaveBeenCalled();
    });

    it('does nothing without a userId', async () => {
        (useSessionIdentity as jest.Mock).mockReturnValue({ userId: null });

        renderHook(() => useSeedMyUserCache());

        await Promise.resolve();
        expect(cacheReadMock).not.toHaveBeenCalled();
        expect(cacheWriteMock).not.toHaveBeenCalled();
    });
});
