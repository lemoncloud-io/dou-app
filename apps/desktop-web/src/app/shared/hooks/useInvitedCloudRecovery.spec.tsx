import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

const recoverInvitedCloudIfMissing = vi.fn(() => Promise.resolve());
const syncInvitedCloudName = vi.fn(() => Promise.resolve());
const cloudRepository = { id: 'cloud-repo' };

let isVerified = true;
let isRelayVerified = true;
let selectedCloudId: string | null = '1000001';
let ownedClouds: Array<{ id: string }> = [];

vi.mock('@chatic/runtime', async () =>
    (await import('@chatic/runtime/testing')).fakeRuntimeModule({
        data: {
            recoverInvitedCloudIfMissing: (...args: unknown[]) => recoverInvitedCloudIfMissing(...(args as [])),
            syncInvitedCloudName: (...args: unknown[]) => syncInvitedCloudName(...(args as [])),
            useRuntimeRepositories: () => ({ cloud: cloudRepository }),
        },
        connection: {
            useRuntimeSocketState: () => ({ isVerified }),
            useSlotVerified: (slot: string) => (slot === 'relay-slot' ? isRelayVerified : false),
            RELAY_SLOT: 'relay-slot',
        },
        session: {
            useSessionSelection: () => ({ selectedCloudId }),
        },
    })
);

vi.mock('./useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: ownedClouds }),
}));

import { useInvitedCloudRecovery } from './useInvitedCloudRecovery';

describe('useInvitedCloudRecovery', () => {
    beforeEach(() => {
        recoverInvitedCloudIfMissing.mockClear();
        syncInvitedCloudName.mockClear();
        isVerified = true;
        isRelayVerified = true;
        selectedCloudId = '1000001';
        ownedClouds = [];
    });

    it('rebuilds the record of the invited cloud the session is inside, name included', async () => {
        renderHook(() => useInvitedCloudRecovery());
        await Promise.resolve();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith('1000001');
        expect(syncInvitedCloudName).toHaveBeenCalledWith('1000001');
    });

    it('leaves an owned cloud alone — the relay catalog is its record', () => {
        ownedClouds = [{ id: '1000001' }];

        renderHook(() => useInvitedCloudRecovery());

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('waits for the socket — both helpers need a live session', () => {
        isVerified = false;

        renderHook(() => useInvitedCloudRecovery());

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('waits for the relay socket too — the name is read from the relay', () => {
        isRelayVerified = false;

        renderHook(() => useInvitedCloudRecovery());

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
        expect(syncInvitedCloudName).not.toHaveBeenCalled();
    });

    it('does nothing on the Default Cloud', () => {
        selectedCloudId = 'default';

        renderHook(() => useInvitedCloudRecovery());

        expect(recoverInvitedCloudIfMissing).not.toHaveBeenCalled();
    });

    it('runs once per cloud across re-renders', async () => {
        const { rerender } = renderHook(() => useInvitedCloudRecovery());
        await Promise.resolve();
        rerender();
        rerender();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledTimes(1);
    });
});
