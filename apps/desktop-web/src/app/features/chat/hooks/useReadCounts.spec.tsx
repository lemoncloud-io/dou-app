import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

const session = vi.hoisted(() => ({ uids: {} as Record<string, string | null>, verified: true }));
const registerJoin = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ join: { observeList: () => () => undefined } }) },
        connection: {
            useCloudVerified: () => session.verified,
        },
        session: { useUidInCloud: (cid: string) => session.uids[cid] ?? null },
        sync: { getSyncManager: () => ({ registerJoin }) },
    },
}));
vi.mock('../../../shared', () => ({
    isSelfChannel: () => false,
    useReadCursorStore: (select: (state: { cursors: Record<string, number> }) => unknown) => select({ cursors: {} }),
}));

import { useReadCounts } from './useReadCounts';

const CHANNEL = { id: 'C1', cid: 'cloud-a', memberIds: ['bob'] } as DomainChannel;
// No join row yet, so the viewer has no cloud uid and the hook falls back to the uid in the cloud.
const VIEWER = { uid: 'session-uid', name: 'Me', cloudUid: null };

// Every registration made, and whether it has been disposed since.
let registrations: { id: string; cid?: string; disposed: boolean }[] = [];
const liveJoins = () => registrations.filter(entry => !entry.disposed).map(entry => [entry.id, entry.cid]);

describe('useReadCounts', () => {
    beforeEach(() => {
        session.uids = { 'cloud-a': 'guest-uid' };
        session.verified = true;
        registrations = [];
        registerJoin.mockReset().mockImplementation((id: string, _intervalMs?: number, options?: { cid?: string }) => {
            const entry = { id, cid: options?.cid, disposed: false };
            registrations.push(entry);
            return () => {
                entry.disposed = true;
            };
        });
    });

    it('registers the roster in the channel cloud, with my uid in that cloud', () => {
        renderHook(() => useReadCounts(CHANNEL, VIEWER));

        expect(liveJoins()).toEqual([
            ['C1@bob', 'cloud-a'],
            ['C1@guest-uid', 'cloud-a'],
        ]);
    });

    it('re-registers after a guest→social promotion, which brings no verified edge', () => {
        // The promotion re-authenticates the same socket: the slot stays verified throughout, the
        // roster (and my channel id) is unchanged, and the manager retires every target registered
        // under the guest uid — so the uid change is the only thing left to re-run on.
        const viewer = { ...VIEWER, cloudUid: 'me-in-channel' };
        const { rerender } = renderHook(() => useReadCounts(CHANNEL, viewer));
        const before = registrations.length;

        session.uids = { 'cloud-a': 'social-uid' };
        rerender();

        expect(registrations.length).toBeGreaterThan(before);
        expect(liveJoins()).toEqual([
            ['C1@bob', 'cloud-a'],
            ['C1@me-in-channel', 'cloud-a'],
        ]);
    });

    it("waits for the channel cloud's slot", () => {
        session.verified = false;
        renderHook(() => useReadCounts(CHANNEL, VIEWER));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('addresses a channel without a cloud id to the relay', () => {
        session.uids = { default: 'relay-uid' };
        renderHook(() => useReadCounts({ ...CHANNEL, cid: undefined } as DomainChannel, VIEWER));

        expect(liveJoins()).toContainEqual(['C1@relay-uid', 'default']);
    });
});
