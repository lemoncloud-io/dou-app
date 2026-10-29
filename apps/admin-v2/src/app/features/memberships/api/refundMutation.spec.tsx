/**
 * `api/memberships/refundMutation.spec.tsx`
 *
 * The refund hook's own decisions: the reason travels trimmed, the endpoint travels exactly as the
 * panel gated on it, and a success refreshes both the list and the cloud panel. A refusal has no
 * branch here — the invalidation lives in `onSuccess`, which react-query only runs on success.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refundSubscriptionByAdmin = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: { data: { useRuntimeRepositories: () => ({ subscription: { refundSubscriptionByAdmin } }) } },
}));

import { adminCloudsKeys, membershipsKeys, useRefundSubscriptionByAdmin } from './membershipsQuery';

import type { ReactNode } from 'react';

const DEV = 'https://api.example.com/dou-d1';

const setup = () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useRefundSubscriptionByAdmin(), { wrapper });
    return { result, invalidate };
};

beforeEach(() => refundSubscriptionByAdmin.mockReset());

describe('useRefundSubscriptionByAdmin', () => {
    it('sends the trimmed reason to the given endpoint and returns the relay view', async () => {
        refundSubscriptionByAdmin.mockResolvedValue({ status: 'expired' });
        const { result } = setup();

        let view: unknown;
        await act(async () => {
            view = await result.current.mutateAsync({ userId: '1000904', reason: '  test refund  ', endpoint: DEV });
        });

        expect(view).toEqual({ status: 'expired' });
        expect(refundSubscriptionByAdmin).toHaveBeenCalledWith('1000904', { reason: 'test refund' }, { endpoint: DEV });
    });

    it('invalidates the membership list and the cloud panel on success', async () => {
        refundSubscriptionByAdmin.mockResolvedValue({ status: 'expired' });
        const { result, invalidate } = setup();

        await act(async () => {
            await result.current.mutateAsync({ userId: '1000904', reason: 'r', endpoint: DEV });
        });

        expect(invalidate).toHaveBeenCalledWith({ queryKey: membershipsKeys.lists() });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: adminCloudsKeys.all });
    });

    // The gateway falls back to the client's own relay on an empty endpoint; the hook must not let
    // a Production or unnamed relay through even if a caller skipped the panel's gate.
    it.each(['https://api.example.com/dou-v1', '', 'https://relay.example.com'])(
        'refuses before calling the relay when the endpoint is not Development (%s)',
        async endpoint => {
            const { result, invalidate } = setup();

            let failure: unknown;
            await act(async () => {
                failure = await result.current.mutateAsync({ userId: '1000904', reason: 'r', endpoint }).then(
                    () => null,
                    (error: unknown) => error
                );
            });

            expect((failure as Error | null)?.message).toMatch(/Development only/);
            expect(refundSubscriptionByAdmin).not.toHaveBeenCalled();
            expect(invalidate).not.toHaveBeenCalled();
        }
    );
});
