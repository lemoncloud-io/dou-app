import { useCallback } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useDesktopChannelMutations } from '../../../shared';
import type { InviteCandidate } from './useInviteCandidates';

/**
 * Adds already-registered users to a channel: the `channel.invite` write plus the local
 * user-cache write that makes them show up in the member list.
 *
 * The member list reads the user cache (`channelIds`), which the channel-side invite
 * response never touches, so the picked records are written straight in rather than
 * refetched — the project's mutation rule. `cacheWriteMany` unions `channelIds` per user.
 */
export const useAddMembers = (channelId: string) => {
    const { user: userRepository } = useRuntimeRepositories();
    const { inviteChannel, isMutating } = useDesktopChannelMutations();

    const addMembers = useCallback(
        async (members: InviteCandidate[]): Promise<void> => {
            const userIds = members.map(m => m.id ?? '').filter(Boolean);
            if (!userIds.length) return;
            await inviteChannel({ channelId, userIds });

            // The server already has them. A local cache write that fails must not surface as a
            // failed invite — the member list reconciles on the next roster refresh either way.
            try {
                await userRepository.cacheWriteMany(
                    members.map(candidate => {
                        // Records written before `toDomainUser` stopped carrying `$join` can still
                        // hold one — a per-channel read cursor from wherever we found them, which
                        // says nothing about this channel. Drop it through a narrow cast; the
                        // field is not on UserView, so it has no declared type to name.
                        const {
                            viaChannels: _via,
                            $join: _join,
                            ...user
                        } = candidate as InviteCandidate & {
                            $join?: unknown;
                        };
                        return { ...user, channelIds: [channelId] };
                    })
                );
            } catch {
                // Best-effort local write; the invite itself stands.
            }
        },
        [userRepository, inviteChannel, channelId]
    );

    return { addMembers, isAdding: isMutating };
};
