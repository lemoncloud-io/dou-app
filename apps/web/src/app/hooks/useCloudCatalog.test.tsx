import { createElement } from 'react';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The resync's contract: with the relay socket verified, a catalog whose last settled read failed is
 * read once more — whether the failure was there before the socket verified or arrived after. A read
 * that answered is left alone, and a re-read that fails again does not start another.
 * A real QueryClient carries the query state, so only the relay flag and the catalog read are faked.
 */
let relayVerified = false;
const mockFetchCloudCatalog = jest.fn();

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { useSessionAuth: () => ({ isAuthenticated: true }) },
        connection: {
            RELAY_SLOT: 'default',
            useSlotVerified: () => relayVerified,
        },
        data: {
            cloudsKeys: {
                all: ['clouds'],
                list: (params: unknown) => ['clouds', 'list', params],
            },
            useRuntimeRepositories: () => ({ cloud: { fetchCloudCatalog: mockFetchCloudCatalog } }),
        },
    },
}));

import { useCloudCatalogRelayResync, useCloudSessionCatalog } from './useCloudCatalog';

const setup = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
    // The catalog consumer keeps the query active, the way home's header does.
    const hook = renderHook(
        () => {
            useCloudCatalogRelayResync();
            return useCloudSessionCatalog();
        },
        { wrapper }
    );
    return { queryClient, ...hook };
};

beforeEach(() => {
    relayVerified = false;
    mockFetchCloudCatalog.mockReset();
});

describe('useCloudCatalogRelayResync', () => {
    it('re-fetches a failed catalog when the relay socket verifies', async () => {
        mockFetchCloudCatalog
            .mockRejectedValueOnce(new Error('Network Error'))
            .mockResolvedValueOnce({ list: [{ id: 'c1', name: 'Cloud' }] });
        const { result, rerender } = setup();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        relayVerified = true;
        rerender();

        await waitFor(() => expect(result.current.clouds).toEqual([{ id: 'c1', name: 'Cloud' }]));
        expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(2);
    });

    it('re-fetches a read that was still in flight at the edge and failed afterwards', async () => {
        let failInFlightRead!: (error: Error) => void;
        mockFetchCloudCatalog
            .mockImplementationOnce(() => new Promise((_, reject) => (failInFlightRead = reject)))
            .mockResolvedValueOnce({ list: [{ id: 'c1' }] });
        const { result, rerender } = setup();
        await waitFor(() => expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(1));

        relayVerified = true;
        rerender();
        await act(async () => failInFlightRead(new Error('Network Error')));

        await waitFor(() => expect(result.current.clouds).toEqual([{ id: 'c1' }]));
        expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(2);
    });

    it('re-fetches once per verification, not again when the re-read fails too', async () => {
        mockFetchCloudCatalog.mockRejectedValue(new Error('Network Error'));
        const { result, rerender } = setup();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));

        relayVerified = true;
        rerender();
        await waitFor(() => expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));
        await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
        expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(2);

        // A later verification (a reconnect) is a new chance.
        relayVerified = false;
        rerender();
        relayVerified = true;
        rerender();
        await waitFor(() => expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(3));
    });

    it('leaves a catalog that already answered alone on the edge', async () => {
        mockFetchCloudCatalog.mockResolvedValue({ list: [{ id: 'c1' }] });
        const { result, rerender } = setup();
        await waitFor(() => expect(result.current.hasCloudCatalog).toBe(true));

        relayVerified = true;
        rerender();
        await act(async () => undefined);

        expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch while the relay socket stays unverified', async () => {
        mockFetchCloudCatalog.mockRejectedValue(new Error('Network Error'));
        const { result, rerender } = setup();
        await waitFor(() => expect(result.current.isCloudsError).toBe(true));
        rerender();
        await act(async () => undefined);
        expect(mockFetchCloudCatalog).toHaveBeenCalledTimes(1);
    });
});
