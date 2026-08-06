import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useUpdateProfile } from './useUpdateProfile';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const updateProfileMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ user: { updateProfile: updateProfileMock } });
});

describe('useUpdateProfile', () => {
    it('updates the profile via the User domain action (cache write drives the reactive UI)', async () => {
        updateProfileMock.mockResolvedValue({ id: 'me', name: 'Neo' });

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        const returned = await result.current.mutateAsync({ name: 'Neo', photo: 'p' });

        expect(updateProfileMock).toHaveBeenCalledWith({ name: 'Neo', photo: 'p' });
        // No session-snapshot patch: user.updateProfile writes the user cache, which useRuntimeProfile /
        // useMyUser observe, so readers refresh reactively.
        expect(returned).toEqual({ name: 'Neo', photo: 'p' });
    });

    it('propagates the error when the remote update fails', async () => {
        updateProfileMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUpdateProfile(), { wrapper });
        await expect(result.current.mutateAsync({ name: 'Neo' })).rejects.toThrow('boom');
    });
});
