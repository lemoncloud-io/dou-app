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
