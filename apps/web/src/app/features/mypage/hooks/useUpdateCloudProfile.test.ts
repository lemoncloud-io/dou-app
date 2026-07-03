import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useRefreshCurrentCloudSession } from '@chatic/web-core';

import { useUpdateCloudProfile } from './useUpdateCloudProfile';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));
jest.mock('@chatic/web-core', () => ({ useRefreshCurrentCloudSession: jest.fn() }));

const updateProfileMock = jest.fn();
const refreshMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ user: { updateProfile: updateProfileMock } });
    (useRefreshCurrentCloudSession as jest.Mock).mockReturnValue({ refreshCurrentCloudSession: refreshMock });
});

describe('useUpdateCloudProfile', () => {
    it('updates the cloud-session profile then re-issues the cloud token', async () => {
        updateProfileMock.mockResolvedValue({ id: 'me' });
        refreshMock.mockResolvedValue(undefined);

        const { result } = renderHook(() => useUpdateCloudProfile(), { wrapper });
        await result.current.mutateAsync({ name: 'Cloud Me', photo: undefined });

        expect(updateProfileMock).toHaveBeenCalledWith({ name: 'Cloud Me', photo: undefined });
        expect(refreshMock).toHaveBeenCalledTimes(1);
        // The profile update must land before the token is re-issued so the new value is derived.
        expect(updateProfileMock.mock.invocationCallOrder[0]).toBeLessThan(refreshMock.mock.invocationCallOrder[0]);
    });

    it('does not refresh the cloud session when the profile update fails', async () => {
        updateProfileMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUpdateCloudProfile(), { wrapper });
        await expect(result.current.mutateAsync({ name: 'x' })).rejects.toThrow('boom');

        expect(refreshMock).not.toHaveBeenCalled();
    });
});
