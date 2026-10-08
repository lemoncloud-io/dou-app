import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const fetchCloudCatalog = vi.hoisted(() => vi.fn());
const relayVerified = vi.hoisted(() => ({ current: false }));
const authenticated = vi.hoisted(() => ({ current: true }));
const useSlotVerified = vi.hoisted(() => vi.fn((_slot: string) => relayVerified.current));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { useSessionAuth: () => ({ isAuthenticated: authenticated.current }) },
        connection: { useSlotVerified, RELAY_SLOT: 'relay' },
        data: {
            useRuntimeRepositories: () => ({ cloud: { fetchCloudCatalog } }),
            cloudsKeys: { list: (params: unknown) => ['clouds', params] },
        },
    },
}));

import { useCloudSessionCatalog } from './useCloudCatalog';

const renderWith = <T,>(hook: () => T) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return { ...renderHook(hook, { wrapper }), client };
};

const render = () => renderWith(() => useCloudSessionCatalog());

/** Two consumers of the hook on one client, as the rail and the runtime are in the app. */
const renderTwice = () =>
    renderWith(() => {
        useCloudSessionCatalog();
        return useCloudSessionCatalog();
    });

/**
 * Waits until no read is in flight and the effects that answer its result have run. A re-read starts
 * inside those effects, so a read this did not wait for is a read that was never sent — which is what
 * lets a case assert "no further read" without sleeping.
 */
const settle = async (client: QueryClient) => {
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await act(async () => undefined);
};

beforeEach(() => {
    vi.clearAllMocks();
    relayVerified.current = false;
    authenticated.current = true;
});

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

    // The read goes out as soon as there is a stored session, which can be before the relay socket has
    // verified. A signing credential that lapsed while the app was closed can only be renewed through
    // that socket, so the read fails on a session that is healthy a moment later.
    it('reads again once the relay socket verifies, when the read before it failed', async () => {
        fetchCloudCatalog.mockRejectedValueOnce(new Error('Network Error'));
        const { result, rerender } = render();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        fetchCloudCatalog.mockResolvedValueOnce({ list: [{ id: 'c1' }] });
        relayVerified.current = true;
        rerender();

        await waitFor(() => expect(result.current.isCloudsError).toBe(false));
        expect(result.current.clouds).toEqual([{ id: 'c1' }]);
        // The relay slot by name: a cloud slot verifying says nothing about the relay credential.
        expect(useSlotVerified).toHaveBeenCalledWith('relay');
    });

    // `refetch` ignores the query's `enabled`, so without its own check the re-read would send a
    // signed request for a session that has ended.
    it('does not read again for a session that has ended, though the relay socket verifies', async () => {
        fetchCloudCatalog.mockRejectedValue(new Error('Network Error'));
        const { result, rerender, client } = render();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        authenticated.current = false;
        relayVerified.current = true;
        rerender();
        await settle(client);

        expect(fetchCloudCatalog).toHaveBeenCalledTimes(1);
    });

    it('reads once more and then leaves the failure standing, when the relay socket is already verified', async () => {
        relayVerified.current = true;
        fetchCloudCatalog.mockRejectedValue(new Error('Network Error'));
        const { result, client } = render();

        await waitFor(() => expect(fetchCloudCatalog).toHaveBeenCalledTimes(2));
        // A re-read that re-armed itself would have sent a third by the time this returns.
        await settle(client);

        expect(fetchCloudCatalog).toHaveBeenCalledTimes(2);
        expect(result.current.isCloudsError).toBe(true);
    });

    it('does not read again when the relay socket verifies after a read that succeeded', async () => {
        fetchCloudCatalog.mockResolvedValue({ list: [] });
        const { rerender, client } = render();
        await settle(client);

        relayVerified.current = true;
        rerender();
        await settle(client);

        expect(fetchCloudCatalog).toHaveBeenCalledTimes(1);
    });

    // With a list already cached, a second `refetch` would cancel the first and send its own request.
    it('sends one re-read for every mounted consumer together, when a refresh of a loaded list failed', async () => {
        fetchCloudCatalog.mockResolvedValueOnce({ list: [{ id: 'c1' }] });
        const { result, rerender, client } = renderTwice();
        await waitFor(() => expect(result.current.clouds).toEqual([{ id: 'c1' }]));

        fetchCloudCatalog.mockRejectedValueOnce(new Error('Network Error'));
        act(() => void result.current.refetchClouds());
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        fetchCloudCatalog.mockResolvedValue({ list: [{ id: 'c1' }] });
        relayVerified.current = true;
        rerender();

        await waitFor(() => expect(result.current.isCloudsError).toBe(false));
        await settle(client);
        expect(fetchCloudCatalog).toHaveBeenCalledTimes(3);
    });
});
