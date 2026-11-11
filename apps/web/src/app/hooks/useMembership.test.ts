import { createElement, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { subscriptionKeys } from './queryKeys';
import { useMarkDrops, useMembershipInfo } from './useMembership';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: jest.fn(),
            cloudsKeys: { all: ['clouds'] },
        },
    },
}));

let mockIsAccountGuest = false;
jest.mock('./useMyUser', () => ({ useIsAccountGuest: () => mockIsAccountGuest }));

const markDropsMock = jest.fn();
const fetchMembershipInfoMock = jest.fn();
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

beforeEach(() => {
    jest.clearAllMocks();
    mockIsAccountGuest = false;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({
        subscription: { markDrops: markDropsMock, fetchMembershipInfo: fetchMembershipInfoMock },
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

describe('useMembershipInfo', () => {
    it("reads a signed-in account's membership from the relay", async () => {
        fetchMembershipInfoMock.mockResolvedValue({ isValid: true, productId: 'pro' });

        const { result } = renderHook(() => useMembershipInfo(), { wrapper });

        await waitFor(() => expect(result.current.data).toEqual({ isValid: true, productId: 'pro' }));
        expect(fetchMembershipInfoMock).toHaveBeenCalledTimes(1);
    });

    it('answers a guest account with no membership without asking the relay', async () => {
        mockIsAccountGuest = true;

        const { result } = renderHook(() => useMembershipInfo(), { wrapper });

        // A read that succeeded, not one left pending — the website hand-off waits for `isSuccess`.
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({ isValid: false });
        await act(async () => void (await result.current.refetch()));
        expect(fetchMembershipInfoMock).not.toHaveBeenCalled();
    });

    it("reads the account's membership once the guest signs in", async () => {
        mockIsAccountGuest = true;
        fetchMembershipInfoMock.mockResolvedValue({ isValid: true });
        const { result, rerender } = renderHook(() => useMembershipInfo(), { wrapper });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        mockIsAccountGuest = false;
        rerender();

        await waitFor(() => expect(result.current.data).toEqual({ isValid: true }));
        expect(fetchMembershipInfoMock).toHaveBeenCalledTimes(1);
    });
});
