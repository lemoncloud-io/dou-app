import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useUpdateCloud } from './useUpdateCloud';

jest.mock('@chatic/app-runtime', () => ({ useRuntimeRepositories: jest.fn() }));

const updateCloudMock = jest.fn();
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
    jest.clearAllMocks();
    (useRuntimeRepositories as jest.Mock).mockReturnValue({ cloud: { updateCloud: updateCloudMock } });
});

describe('useUpdateCloud', () => {
    it('flattens { id, body } into the Cloud domain updateCloud payload', async () => {
        updateCloudMock.mockResolvedValue({ id: 'cloud-1', name: 'New' });

        const { result } = renderHook(() => useUpdateCloud(), { wrapper });
        await result.current.mutateAsync({ id: 'cloud-1', body: { name: 'New' } });

        // The cloud entity is edited via the Cloud domain, not the user profile action.
        expect(updateCloudMock).toHaveBeenCalledWith({ id: 'cloud-1', name: 'New' });
    });
});
