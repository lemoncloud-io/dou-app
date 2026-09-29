import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type { DomainChannel } from '@chatic/data';

const session = vi.hoisted(() => ({ uids: {} as Record<string, string | null>, verifiedSlots: new Set<string>() }));
const registerJoin = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ join: { observeList: () => () => undefined } }) },
        connection: {
            useCloudVerified: (cid: string) => session.verifiedSlots.has(cid),
        },
        session: {
            useSessionSelection: () => ({ selectedSiteId: 'S1' }),
            useUidInCloud: (cid: string) => session.uids[cid] ?? null,
        },
        sync: { getSyncManager: () => ({ registerJoin }) },
    },
}));

import { useChannelReadCursors } from './useChannelReadCursors';

const CHANNELS = [
    { id: 'C1', cid: 'cloud-a' },
    { id: 'C2', cid: 'cloud-a' },
] as DomainChannel[];

// Every registration made, and whether it has been disposed since.
let registrations: { id: string; cid?: string; disposed: boolean }[] = [];
const liveJoins = () => registrations.filter(entry => !entry.disposed).map(entry => [entry.id, entry.cid]);

describe('useChannelReadCursors', () => {
    beforeEach(() => {
        session.uids = { 'cloud-a': 'uid-a', default: 'relay-uid' };
        session.verifiedSlots = new Set(['cloud-a']);
        registrations = [];
        registerJoin.mockReset().mockImplementation((id: string, _intervalMs?: number, options?: { cid?: string }) => {
            const entry = { id, cid: options?.cid, disposed: false };
            registrations.push(entry);
            return () => {
                entry.disposed = true;
            };
        });
    });

    it('registers my join per channel in the channels cloud, with my uid in that cloud', () => {
        renderHook(() => useChannelReadCursors(CHANNELS));

        expect(liveJoins()).toEqual([
            ['C1@uid-a', 'cloud-a'],
            ['C2@uid-a', 'cloud-a'],
        ]);
    });

    it('re-registers under the new uid when the account in that cloud changes', () => {
        const { rerender } = renderHook(() => useChannelReadCursors(CHANNELS));

        session.uids = { ...session.uids, 'cloud-a': 'uid-a2' };
        rerender();

        expect(liveJoins()).toEqual([
            ['C1@uid-a2', 'cloud-a'],
            ['C2@uid-a2', 'cloud-a'],
        ]);
    });

    it("waits for the channels cloud's slot, whichever slot is active", () => {
        session.verifiedSlots = new Set(['default']);
        renderHook(() => useChannelReadCursors(CHANNELS));

        expect(registerJoin).not.toHaveBeenCalled();
    });

    it('addresses relay channels (no cloud id) to the relay with the relay uid', () => {
        session.verifiedSlots = new Set(['default']);
        renderHook(() => useChannelReadCursors([{ id: 'C9' } as DomainChannel]));

        expect(liveJoins()).toEqual([['C9@relay-uid', 'default']]);
    });
});
