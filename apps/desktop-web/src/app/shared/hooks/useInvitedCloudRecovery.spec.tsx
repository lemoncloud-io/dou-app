import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

// An invited cloud's only durable record is its local cache row. Without one it stays on the rail
// just while the session is inside it and disappears on the next switch or reload, so the row has
// to be rebuilt from the live session (.claude/20260804/DEBUG-14-50-00.md).
const recoverInvitedCloudIfMissing = vi.fn(() => Promise.resolve());
const syncInvitedCloudName = vi.fn(() => Promise.resolve());
const cloudRepository = { id: 'cloud-repo' };

let isVerified = true;
let selectedCloudId: string | null = '1000001';
let ownedClouds: Array<{ id: string }> = [];

vi.mock('@chatic/app-runtime', () => ({
    recoverInvitedCloudIfMissing: (...args: unknown[]) => recoverInvitedCloudIfMissing(...(args as [])),
    syncInvitedCloudName: (...args: unknown[]) => syncInvitedCloudName(...(args as [])),
    useRuntimeRepositories: () => ({ cloud: cloudRepository }),
    useRuntimeSocketState: () => ({ isVerified }),
    useCloudSessionCatalog: () => ({ clouds: ownedClouds }),
    useSessionSelection: () => ({ selectedCloudId }),
}));

import { useInvitedCloudRecovery } from './useInvitedCloudRecovery';

describe('useInvitedCloudRecovery', () => {
    beforeEach(() => {
        recoverInvitedCloudIfMissing.mockClear();
        syncInvitedCloudName.mockClear();
        isVerified = true;
        selectedCloudId = '1000001';
        ownedClouds = [];
    });

    it('rebuilds the record of the invited cloud the session is inside, name included', async () => {
        renderHook(() => useInvitedCloudRecovery());
        await Promise.resolve();

        expect(recoverInvitedCloudIfMissing).toHaveBeenCalledWith(cloudRepository, '1000001');
        expect(syncInvitedCloudName).toHaveBeenCalledWith(cloudRepository, '1000001');
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
