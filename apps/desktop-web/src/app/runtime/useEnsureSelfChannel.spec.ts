import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const state = vi.hoisted(() => ({
    server: { kind: 'cloud', cloudId: 'cloud-1' } as { kind: string; cloudId?: string },
    siteId: 'place-1' as string | null,
    verified: true,
    switching: 0,
}));
const getSelfChannel = vi.fn();
const warn = vi.fn();

vi.mock('@tanstack/react-query', () => ({ useIsMutating: () => state.switching }));
vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ channel: { getSelfChannel } }) },
        session: {
            useGlobalSession: () => ({ activeServer: state.server }),
            useSessionSelection: () => ({ selectedSiteId: state.siteId }),
            SWITCH_SITE_MUTATION_KEY: ['site'],
            SWITCH_CLOUD_MUTATION_KEY: ['cloud'],
        },
        connection: { useRuntimeSocketState: () => ({ isVerified: state.verified }) },
    },
}));
vi.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

import { useEnsureSelfChannel } from './useEnsureSelfChannel';

describe('useEnsureSelfChannel', () => {
    beforeEach(() => {
        state.server = { kind: 'cloud', cloudId: 'cloud-1' };
        state.siteId = 'place-1';
        state.verified = true;
        state.switching = 0;
        getSelfChannel.mockReset().mockResolvedValue({ id: 'U:me' });
        warn.mockReset();
    });

    it('asks get-self once for the subscription cloud I am in, tagged with the open place', () => {
        const { rerender } = renderHook(() => useEnsureSelfChannel());
        state.siteId = 'place-2';
        rerender();

        expect(getSelfChannel).toHaveBeenCalledTimes(1);
        expect(getSelfChannel).toHaveBeenCalledWith(undefined, 'place-1');
    });

    it('does not ask again on a reconnect once it has an answer', async () => {
        const { rerender } = renderHook(() => useEnsureSelfChannel());
        await Promise.resolve();
        state.verified = false;
        rerender();
        state.verified = true;
        rerender();

        expect(getSelfChannel).toHaveBeenCalledTimes(1);
    });

    it('asks again for the next cloud', () => {
        const { rerender } = renderHook(() => useEnsureSelfChannel());
        state.server = { kind: 'cloud', cloudId: 'cloud-2' };
        rerender();

        expect(getSelfChannel).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['on the relay', () => (state.server = { kind: 'relay' })],
        ['on the relay cloud id', () => (state.server = { kind: 'cloud', cloudId: 'default' })],
        ['without an open place', () => (state.siteId = null)],
        ['before the socket is verified', () => (state.verified = false)],
        ['during a switch', () => (state.switching = 1)],
    ])('asks nothing %s', (_case, arrange) => {
        arrange();
        renderHook(() => useEnsureSelfChannel());

        expect(getSelfChannel).not.toHaveBeenCalled();
    });

    it('logs a failure and asks again on the next rising edge', async () => {
        getSelfChannel.mockRejectedValueOnce(new Error('offline'));
        const { rerender } = renderHook(() => useEnsureSelfChannel());
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());

        state.verified = false;
        rerender();
        state.verified = true;
        rerender();

        expect(getSelfChannel).toHaveBeenCalledTimes(2);
    });
});
