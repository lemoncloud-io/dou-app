import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useUpdateCloudProfile } from './useUpdateCloudProfile';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const updateCloudMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ cloud: { updateCloud: updateCloudMock } });
});

describe('useUpdateCloudProfile', () => {
    it('updates the cloud entity name via the Cloud domain action', async () => {
        updateCloudMock.mockResolvedValue({ id: 'cloud-a', name: 'My Cloud' });

        const { result } = renderHook(() => useUpdateCloudProfile(), { wrapper });
        await result.current.mutateAsync({ id: 'cloud-a', name: 'My Cloud' });

        // Edits the cloud itself (cloud.update), not the connected user's profile.
        expect(updateCloudMock).toHaveBeenCalledWith({ id: 'cloud-a', name: 'My Cloud' });
    });

    it('propagates a failed cloud update', async () => {
        updateCloudMock.mockRejectedValue(new Error('boom'));

        const { result } = renderHook(() => useUpdateCloudProfile(), { wrapper });
        await expect(result.current.mutateAsync({ id: 'cloud-a', name: 'x' })).rejects.toThrow('boom');
    });
});
