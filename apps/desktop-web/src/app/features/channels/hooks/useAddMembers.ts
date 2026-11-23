import { useCallback } from 'react';

import { runtime } from '@chatic/runtime';

import { useDesktopChannelMutations } from '../../../shared';
import type { InviteCandidate } from './useInviteCandidates';

export const useAddMembers = (channelId: string) => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { inviteChannel, isMutating } = useDesktopChannelMutations();

    const addMembers = useCallback(
        async (members: InviteCandidate[]): Promise<void> => {
            const userIds = members.map(m => m.id ?? '').filter(Boolean);
            if (!userIds.length) return;
            await inviteChannel({ channelId, userIds });

            try {
                await userRepository.cacheWriteMany(
                    members.map(candidate => {
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
