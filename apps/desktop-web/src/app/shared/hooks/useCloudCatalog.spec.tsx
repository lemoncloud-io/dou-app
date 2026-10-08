import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const fetchCloudCatalog = vi.hoisted(() => vi.fn());

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { useSessionAuth: () => ({ isAuthenticated: true }) },
        data: {
            useRuntimeRepositories: () => ({ cloud: { fetchCloudCatalog } }),
            cloudsKeys: { list: (params: unknown) => ['clouds', params] },
        },
    },
}));

import { useCloudSessionCatalog } from './useCloudCatalog';

const render = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useCloudSessionCatalog(), { wrapper });
};

beforeEach(() => vi.clearAllMocks());

describe('useCloudSessionCatalog', () => {
    it('reports a failed read once it has settled', async () => {
        fetchCloudCatalog.mockRejectedValue(new Error('Network Error'));
        const { result } = render();

        await waitFor(() => expect(result.current.isCloudsError).toBe(true));
    });

    // The rail's reload tile shows this; it used to drop out the moment a retry started, so it could
    // never show that the retry was running.
    it('keeps reporting the failure while a retry runs, and clears it when the retry lands', async () => {
        fetchCloudCatalog.mockRejectedValueOnce(new Error('Network Error'));
        const { result } = render();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        let resolveRetry: (value: { list: unknown[] }) => void = () => undefined;
        fetchCloudCatalog.mockReturnValueOnce(new Promise(resolve => (resolveRetry = resolve)));
        act(() => void result.current.refetchClouds());
        await waitFor(() => expect(result.current.isFetchingClouds).toBe(true));
        expect(result.current.isCloudsError).toBe(true);

        await act(async () => resolveRetry({ list: [] }));
        await waitFor(() => expect(result.current.isCloudsError).toBe(false));
    });
});
