import { isServerSeededNick } from './nick';

export const pickDmPeerId = (memberIds: readonly (string | undefined)[], userId: string | null | undefined) => {
    if (!userId) return undefined;
    return memberIds.find((id): id is string => !!id && id !== userId);
};

export const peerCloudNameOf = (
    user: { nick?: string | null; name?: string | null } | null | undefined,
    peerId: string
): string | undefined => {
    for (const value of [user?.nick, user?.name]) {
        const trimmed = value?.trim();
        if (trimmed && !isServerSeededNick(trimmed, peerId)) return trimmed;
    }
    return undefined;
};
