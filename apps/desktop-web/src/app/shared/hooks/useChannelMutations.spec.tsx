import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook as renderBareHook } from '@testing-library/react';

let activeCloudId = 'cloud-1';
let selectedSiteId: string | null = 'site-1';
const createChannel = vi.fn();
const repositories = { channel: { createChannel }, join: {} };

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => repositories },
        session: {
            useSessionSelection: () => ({ selectedCloudId: activeCloudId, selectedSiteId }),
            getGlobalSessionContext: () => ({ cloud: { cloudId: activeCloudId, siteId: selectedSiteId } }),
            SWITCH_SITE_MUTATION_KEY: ['switch-site'],
            SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'],
        },
    },
}));

import { useDesktopChannelMutations } from './useChannelMutations';

let queryClient = new QueryClient();
const renderHook = <T,>(hook: () => T) =>
    renderBareHook(hook, {
        wrapper: ({ children }: { children: ReactNode }) =>
            createElement(QueryClientProvider, { client: queryClient }, children),
    });

/** A switch in flight, registered the way the runtime's switch mutations register one. */
const startSwitch = (mutationKey: string[]) => {
    let settle: () => void = () => undefined;
    const done = new Promise<void>(resolve => (settle = resolve));
    let inside: () => void = () => undefined;
    const mutation = queryClient.getMutationCache().build(queryClient, {
        mutationKey,
        mutationFn: async () => {
            await done;
            inside();
        },
    });
    const running = mutation.execute(undefined);
    return {
        settle: async (withinSwitch: () => void = () => undefined) => {
            inside = withinSwitch;
            settle();
            await running;
        },
    };
};

// The create names no place, so the server files the channel under the place the session is in. A
// switch shows the new place before the session has moved there: a create sent then went into the
// place being left, and the list it was made from never showed it.
describe('useDesktopChannelMutations createChannel', () => {
    beforeEach(() => {
        queryClient = new QueryClient();
        activeCloudId = 'cloud-1';
        selectedSiteId = 'site-1';
        createChannel.mockReset().mockResolvedValue({ id: 'C-new', sid: 'site-1' });
    });

    it('creates at once when no switch is running', async () => {
        const { result } = renderHook(() => useDesktopChannelMutations());

        await act(async () => {
            await result.current.createChannel({ stereo: 'public', name: 'design' });
        });

        expect(createChannel).toHaveBeenCalledWith({ stereo: 'public', name: 'design' }, 'site-1');
    });

    it('waits for a running place switch before it asks the server', async () => {
        const placeSwitch = startSwitch(['switch-site']);
        const { result } = renderHook(() => useDesktopChannelMutations());

        let created: Promise<unknown> = Promise.resolve();
        act(() => {
            created = result.current.createChannel({ stereo: 'public', name: 'design' });
        });
        await act(async () => undefined);
        expect(createChannel).not.toHaveBeenCalled();
        expect(result.current.isMutating).toBe(true);

        await act(async () => {
            await placeSwitch.settle();
            await created;
        });
        expect(createChannel).toHaveBeenCalledWith({ stereo: 'public', name: 'design' }, 'site-1');
    });

    it('creates nothing when the switch it waited for rolled the place back', async () => {
        const placeSwitch = startSwitch(['switch-site']);
        const { result } = renderHook(() => useDesktopChannelMutations());

        let refused: Promise<void> = Promise.resolve();
        act(() => {
            refused = expect(result.current.createChannel({ stereo: 'public', name: 'design' })).rejects.toThrow(
                'the place changed'
            );
        });
        await act(async () => {
            await placeSwitch.settle(() => {
                selectedSiteId = 'site-0';
            });
            await refused;
        });

        expect(createChannel).not.toHaveBeenCalled();
    });

    it('waits for a running cloud switch too', async () => {
        const cloudSwitch = startSwitch(['switch-cloud']);
        const { result } = renderHook(() => useDesktopChannelMutations());

        let created: Promise<unknown> = Promise.resolve();
        act(() => {
            created = result.current.createChannel({ stereo: 'public', name: 'design' });
        });
        await act(async () => undefined);
        expect(createChannel).not.toHaveBeenCalled();

        await act(async () => {
            await cloudSwitch.settle();
            await created;
        });
        expect(createChannel).toHaveBeenCalledTimes(1);
    });
});
