import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

import type { InviteCandidate } from './useInviteCandidates';

const cacheWriteMany = vi.fn(() => Promise.resolve());
const inviteChannel = vi.fn(() => Promise.resolve({}));

// The runtime returns a singleton repository bundle — keep the mock identity-stable.
const repositories = { user: { cacheWriteMany } };

vi.mock('@chatic/app-runtime', () => ({
    useRuntimeRepositories: () => repositories,
}));
vi.mock('../../../shared', () => ({
    useDesktopChannelMutations: () => ({ inviteChannel, isMutating: false }),
}));

import { useAddMembers } from './useAddMembers';

const candidate = (id: string): InviteCandidate =>
    ({ id, name: id, $join: { channelId: 'ch-other', chatNo: 42 }, viaChannels: ['design'] }) as InviteCandidate;

describe('useAddMembers', () => {
    beforeEach(() => {
        cacheWriteMany.mockClear().mockResolvedValue(undefined);
        inviteChannel.mockClear().mockResolvedValue({});
    });

    it('writes the added members into the user cache without the source channel read-state', async () => {
        const { result } = renderHook(() => useAddMembers('ch-target'));

        await act(() => result.current.addMembers([candidate('u-1'), candidate('u-2')]));

        expect(inviteChannel).toHaveBeenCalledWith({ channelId: 'ch-target', userIds: ['u-1', 'u-2'] });
        const [written] = cacheWriteMany.mock.calls[0] as unknown as [Array<Record<string, unknown>>];
        expect(written.map(u => u.id)).toEqual(['u-1', 'u-2']);
        // `$join` is the cursor from the channel we found them in; it says nothing about this one.
        expect(written.every(u => !('$join' in u) && !('viaChannels' in u))).toBe(true);
        expect(written[0].channelIds).toEqual(['ch-target']);
    });

    it('does not report a failure when only the local cache write fails', async () => {
        // The server already accepted the invite — surfacing this as an error made the caller
        // toast a failure and retry, inviting the same people twice.
        cacheWriteMany.mockRejectedValue(new Error('quota exceeded'));
        const { result } = renderHook(() => useAddMembers('ch-target'));

        await expect(result.current.addMembers([candidate('u-1')])).resolves.toBeUndefined();
    });

    it('propagates an invite failure', async () => {
        inviteChannel.mockRejectedValue(new Error('denied'));
        const { result } = renderHook(() => useAddMembers('ch-target'));

        await expect(result.current.addMembers([candidate('u-1')])).rejects.toThrow('denied');
        expect(cacheWriteMany).not.toHaveBeenCalled();
    });
});
