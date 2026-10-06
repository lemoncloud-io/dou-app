import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { subscriptionKeys } from './queryKeys';
import { useMarkDrops } from './useMembership';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
            cloudsKeys: { all: ['clouds'] },
        },
    },
}));

const markDropsMock = jest.fn();
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        subscription: { markDrops: markDropsMock },
    });
});

describe('useMarkDrops', () => {
    it('sends the picked clouds and invalidates the cloud list and the membership on success', async () => {
        markDropsMock.mockResolvedValue({ cloudIds: ['c1'], owned: 3, maxClouds: 2, excess: 0 });
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useMarkDrops(), { wrapper });
        await expect(result.current.mutateAsync({ cloudIds: ['c1'] })).resolves.toEqual({
            cloudIds: ['c1'],
            owned: 3,
            maxClouds: 2,
            excess: 0,
        });

        expect(markDropsMock).toHaveBeenCalledWith({ cloudIds: ['c1'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: runtime.data.cloudsKeys.all });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: subscriptionKeys.all });
    });

    it('propagates a rejection and leaves the caches alone', async () => {
        markDropsMock.mockRejectedValue(new Error('403'));
        const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

        const { result } = renderHook(() => useMarkDrops(), { wrapper });
        await expect(result.current.mutateAsync({ cloudIds: ['not-mine'] })).rejects.toThrow('403');

        expect(invalidate).not.toHaveBeenCalled();
    });
});
