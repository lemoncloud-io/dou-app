import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const recoverInvitedCloudIfMissing = vi.fn(() => Promise.resolve());
const cloudRepository = { id: 'cloud-repo' };

let isNativeShell = true;
let ownedClouds: Array<{ id: string }> = [];

type PushListener = (payload: {
    notification: { title?: string; body?: string; data?: Record<string, string> };
}) => void;

const listeners = new Set<PushListener>();
const notifications = {
    onReceive: vi.fn((listener: PushListener) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }),
};

vi.mock('@chatic/runtime-react', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        data: {
            recoverInvitedCloudIfMissing: (...args: unknown[]) => recoverInvitedCloudIfMissing(...(args as [])),
            useRuntimeRepositories: () => ({ cloud: cloudRepository }),
        },
        get push() {
            return { ...browserPush(), notifications: isNativeShell ? notifications : null };
        },
    });
});

vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: ownedClouds }),
    useOwnedCloudIds: () => new Set(ownedClouds.map((c: { id: string }) => c.id)),
}));

import { usePushInvitedCloudRecovery } from './usePushInvitedCloudRecovery';

const emitPushData = (data: Record<string, string>) => {
    for (const listener of listeners) {
        listener({ notification: { title: 'DoU', body: 'hello', data } });
    }
};

const emitSilentPushData = (data: Record<string, string>) => {
    for (const listener of listeners) {
        listener({ notification: { data } });
    }
};

const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

describe('usePushInvitedCloudRecovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listeners.clear();
        isNativeShell = true;
        ownedClouds = [];
    });

    it('recovers the invited cloud a push names', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: 'cloud-9', channelId: 'ch-1' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith('cloud-9');
    });

    it('recovers on silent pushes too — there is no banner path to piggyback on', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitSilentPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith('cloud-9');
    });

    it('ignores relay-origin and empty cids', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: '#' });
        emitPushData({ cid: '' });
        emitPushData({ channelId: 'ch-1' });
        await flush();

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('leaves an owned cloud alone — the relay catalog is its record', async () => {
        ownedClouds = [{ id: 'cloud-9' }];

        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('dedupes a burst naming the same cloud into one call', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: 'cloud-9' });
        emitPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledTimes(1);

        emitPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledTimes(2);
    });

    it('stays quiet in a plain browser — nothing hands the page a notification there', async () => {
        isNativeShell = false;

        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('swallows a rejected recovery — a push must never break the renderer', async () => {
        recoverInvitedCloudIfMissing.mockRejectedValueOnce(new Error('gone'));
        renderHook(() => usePushInvitedCloudRecovery());

        await expect(
            (async () => {
                emitPushData({ cid: 'cloud-9' });
                await flush();
            })()
        ).resolves.toBeUndefined();
        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledTimes(1);

        emitPushData({ cid: 'cloud-9' });
        await flush();
        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledTimes(2);
    });
});
