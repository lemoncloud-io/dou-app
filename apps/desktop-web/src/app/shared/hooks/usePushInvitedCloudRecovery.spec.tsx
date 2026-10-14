import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

// A push is the only signal that names a missing invited cloud — its endpoints
// live nowhere else once the cache DB is gone — so every push carrying a cid
// re-derives that cloud, presentation gates aside.
const recoverInvitedCloudIfMissing = vi.fn(() => Promise.resolve());
const cloudRepository = { id: 'cloud-repo' };

let isNativeShell = true;
let ownedClouds: Array<{ id: string }> = [];

vi.mock('@chatic/bridges', () => ({
    webClient: { onEvent: vi.fn(() => () => undefined) },
    isNative: () => isNativeShell,
    logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            recoverInvitedCloudIfMissing: (...args: unknown[]) => recoverInvitedCloudIfMissing(...(args as [])),
            useRuntimeRepositories: () => ({ cloud: cloudRepository }),
        },
    },
}));

vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: ownedClouds }),
    useOwnedCloudIds: () => new Set(ownedClouds.map((c: { id: string }) => c.id)),
}));

import { webClient } from '@chatic/bridges';

import { usePushInvitedCloudRecovery } from './usePushInvitedCloudRecovery';

type PushHandler = (message: any) => void;

const pushHandlers = (): PushHandler[] =>
    (webClient.onEvent as ReturnType<typeof vi.fn>).mock.calls
        .filter(([event]) => event === 'OnReceiveNotification')
        .map(([, handler]) => handler);

const emitPushData = (data: Record<string, string>) => {
    for (const handler of pushHandlers()) {
        handler({ data: { notification: { title: 'DoU', body: 'hello', data } } });
    }
};

const emitSilentPushData = (data: Record<string, string>) => {
    for (const handler of pushHandlers()) {
        handler({ data: { notification: { data } } });
    }
};

const flush = () =>
    act(async () => {
        await Promise.resolve();
    });

describe('usePushInvitedCloudRecovery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isNativeShell = true;
        ownedClouds = [];
    });

    it('recovers the invited cloud a push names', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitPushData({ cid: 'cloud-9', channelId: 'ch-1' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith(cloudRepository, 'cloud-9');
    });

    it('recovers on silent pushes too — there is no banner path to piggyback on', async () => {
        renderHook(() => usePushInvitedCloudRecovery());
        emitSilentPushData({ cid: 'cloud-9' });
        await flush();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith(cloudRepository, 'cloud-9');
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

    it('stays quiet in a plain browser — the shell never emits there', async () => {
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
    });
});
