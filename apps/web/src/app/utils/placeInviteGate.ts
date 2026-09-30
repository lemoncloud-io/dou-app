/**
 * Whether a place invite can be issued right now, shared by the home menu entry that opens the form
 * and the form that sends it — the two must never disagree about the same place.
 *
 * - `hidden`: this user cannot invite into this place at all. The relay's single place has no owner,
 *   an invited member is never the owner, and a guest cannot issue. The server's `isOwner` is the
 *   one authority on ownership, so a place whose row has not loaded is hidden too, not guessed at.
 * - `disabled`: the owner could, but not this instant. `user.invite` carries no site: the server
 *   files the invite under whichever site the session is sitting on. So while a switch is in flight,
 *   or once the session has moved off this place, sending would land the invite in another place.
 * - `ready`: the session is on this place and the user owns it.
 */
export type PlaceInviteGate = 'hidden' | 'disabled' | 'ready';

export interface PlaceInviteGateInput {
    isDefaultCloud: boolean;
    isGuest: boolean;
    /** The place the invite is meant for; `null`/`undefined` while its row is not loaded. */
    place: { id: string; isOwner?: boolean } | null | undefined;
    /** The site the session is currently on — what the server will stamp on the invite. */
    sessionSiteId: string | null | undefined;
    isSwitching?: boolean;
}

export const resolvePlaceInviteGate = ({
    isDefaultCloud,
    isGuest,
    place,
    sessionSiteId,
    isSwitching = false,
}: PlaceInviteGateInput): PlaceInviteGate => {
    if (isDefaultCloud || isGuest || place?.isOwner !== true) return 'hidden';
    if (isSwitching || place.id !== sessionSiteId) return 'disabled';
    return 'ready';
};
