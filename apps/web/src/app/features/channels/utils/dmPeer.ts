import { isServerSeededNick } from './nick';

/**
 * Pick the 1:1 peer out of a channel roster: the member that isn't me.
 *
 * Shared by `useDmPeer` (room) and `useDmPeers` (lists) so the two can't drift — the whole point of
 * the DM title chain is that every surface names a room identically, which starts with agreeing on
 * WHO the peer is.
 *
 * Returns `undefined` when my own id is unknown. Without that guard a null `userId` makes the
 * `id !== userId` test vacuously true and the first roster entry — usually me, since the inviter
 * owns the channel — is picked as the "peer", so a room would render my own name and avatar as the
 * person I am talking to.
 */
export const pickDmPeerId = (memberIds: readonly (string | undefined)[], userId: string | null | undefined) => {
    if (!userId) return undefined;
    return memberIds.find((id): id is string => !!id && id !== userId);
};

/**
 * The name a peer's cloud profile — their user record in the cloud's user cache — gives them, or
 * `undefined` when it gives none worth showing.
 *
 * `nick` before `name`, the order `resolveUserName` reads a member row in, so a 1:1's title and the
 * room's own message rows reach the same name for a person with a real one.
 *
 * The values the server makes up for an account are not names: its own id, `User_0101`, or a masked
 * `***0101` built from a phone number. They fall through to the next step of the title chain rather
 * than win — they are why this source was once kept out of the chain altogether. This screen is
 * stricter than the message rows', which drop only the raw id: a title that read `***0101` would be
 * no better than the unnamed label, while a message still has to be attributed to somebody.
 */
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
