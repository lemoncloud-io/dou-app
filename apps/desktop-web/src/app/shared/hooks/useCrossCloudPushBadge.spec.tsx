import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type * as UtilsModule from '../utils';

let pushHandler: ((payload: unknown) => void) | null = null;
let activeServer: { kind: 'relay' } | { kind: 'cloud'; cloudId: string } = { kind: 'relay' };
let isVerified = false;

vi.mock('@chatic/runtime-react', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        session: {
            useGlobalSession: () => ({ activeServer }),
            getGlobalSessionContext: () => ({ activeServer }),
        },
        connection: { useRuntimeSocketState: () => ({ isVerified }) },
        push: {
            ...browserPush(),
            kind: 'shell',
            notifications: {
                onReceive: (listener: (payload: unknown) => void) => {
                    pushHandler = listener;
                    return () => undefined;
                },
            },
        },
    });
});

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    resolvePushCloudId: async () => null,
}));

import { useCloudPushBadgeStore } from '../stores';
import { useCrossCloudPushBadge } from './useCrossCloudPushBadge';

const receive = (data: Record<string, string>) =>
    act(() => pushHandler?.({ notification: { data: { channelId: 'ch-1', ...data } } }));

const badged = () => useCloudPushBadgeStore.getState().badged;

beforeEach(() => {
    pushHandler = null;
    activeServer = { kind: 'relay' };
    isVerified = false;
    useCloudPushBadgeStore.setState({ badged: {} });
});

describe('useCrossCloudPushBadge', () => {
    it('dots the cloud a push names when another one is open', () => {
        activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
        renderHook(() => useCrossCloudPushBadge());
        receive({ cid: 'cloud-2' });
        expect(badged()).toEqual({ 'cloud-2': true });
    });

    it("dots the Home tile for a relay push's '#' while a cloud is open", () => {
        activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
        renderHook(() => useCrossCloudPushBadge());
        receive({ cid: '#' });
        expect(badged()).toEqual({ default: true });
    });

    it('leaves a relay push to the live socket while the relay is open', () => {
        renderHook(() => useCrossCloudPushBadge());
        receive({ cid: '#' });
        expect(badged()).toEqual({});
    });

    it('clears the Home dot once the relay is open and verified', () => {
        useCloudPushBadgeStore.setState({ badged: { default: true, 'cloud-2': true } });
        isVerified = true;
        renderHook(() => useCrossCloudPushBadge());
        expect(badged()).toEqual({ 'cloud-2': true });
    });
});
