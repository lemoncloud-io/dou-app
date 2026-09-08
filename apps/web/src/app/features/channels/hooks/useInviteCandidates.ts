import { useMemo } from 'react';

import { useSessionIdentity } from '@chatic/app-runtime';
import type { DomainChannel } from '@chatic/data';

import { useHomeChannels } from '../../../hooks';

export interface UseInviteCandidatesResult {
    /** User ids that may be added to the target channel. */
    candidateIds: string[];
    isLoading: boolean;
}

/**
 * People the owner can add to `channelId`: every member of my OTHER channels in the same place,
 * minus the target's current members and myself.
 *
 * The server has no user directory — the only listing actions (`channel.list-user`,
 * `channel.sync-users`) are scoped to a single channel — so the pool is assembled on the client
 * (ADR-0075). Unlike the desktop equivalent this issues NO requests: `useHomeChannels` is a slice
 * of the app's single cloud-wide channel observation, and each row already carries `memberIds`,
 * so the union is a pure derivation over data the screen holds anyway.
 *
 * Two independent exclusions keep an existing member out of the pool: the target channel is skipped
 * while unioning, AND the target's own `memberIds` are subtracted afterwards. Either one alone
 * would do it in the happy path; both together mean a channel row that arrived without `memberIds`
 * cannot leak its members back in as candidates.
 *
 * Returns ids only. Names and avatars are the caller's job — they come from the place profile
 * cache, not from the channel rows (ADR-0075 결정 3).
 */
export const useInviteCandidates = (channelId: string | null, sid: string | null): UseInviteCandidatesResult => {
    const { userId } = useSessionIdentity();
    const { channels, isLoading } = useHomeChannels(sid);

    const candidateIds = useMemo(() => {
        if (!channelId || !sid) return [];

        const target = channels.find(channel => channel.id === channelId);
        const excluded = new Set<string>(target?.memberIds ?? []);
        if (userId) excluded.add(userId);

        const pool = new Set<string>();
        channels.forEach((channel: DomainChannel) => {
            if (channel.id === channelId) return;
            // A row that came in without the roster (the field is optional and only the
            // `detail: true` paths fill it) contributes nothing rather than guessing.
            channel.memberIds?.forEach(memberId => {
                if (memberId && !excluded.has(memberId)) pool.add(memberId);
            });
        });

        return Array.from(pool);
    }, [channels, channelId, sid, userId]);

    return { candidateIds, isLoading };
};
