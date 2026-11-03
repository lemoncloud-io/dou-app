import type { DomainCloud } from '@chatic/data';

/**
 * Who an invited cloud belongs to on this device.
 *
 * Invite acceptance is bound to the device (guest) user — the `delegatorId` sent with the invite
 * login — and the server grants the cloud to that user only. Inside a shell the invited-cloud cache is
 * one partition shared by everyone who uses the device, since another account can sign in. A row one
 * user left behind used to reach the next one's cloud list and background sockets, and delegating into
 * a cloud the user was never granted makes the server mint an empty user there — one the user's own
 * later acceptance never attaches to, so every room it is invited into then answers 403.
 *
 * In a plain browser tab the cache lives in the tab's sessionStorage and ends with the tab, so another
 * tab's guest never reaches it. The check is rarely load-bearing there, but it stays: logout does not
 * clear the tab's rows, so the guest a tab signs back in as is not guaranteed to be the one that
 * accepted them.
 */

/**
 * The acceptor list after `delegatorId` accepts: appended once, existing acceptors kept. Without a
 * `delegatorId` there is nothing to record and the list is returned unchanged.
 */
export const withAcceptor = (
    acceptedBy: readonly string[] | undefined,
    delegatorId: string | null | undefined
): string[] | undefined => {
    if (!delegatorId) return acceptedBy ? [...acceptedBy] : undefined;
    const current = acceptedBy ?? [];
    return current.includes(delegatorId) ? [...current] : [...current, delegatorId];
};

/**
 * Whether `delegatorId` may treat this invited cloud as its own.
 *
 * A row with no acceptors predates the field and is kept: invited clouds have no server list to
 * refill from, so hiding one would lose it for the guest it does belong to. A row with acceptors is
 * offered only to one of them — and to nobody while the session has no guest id yet.
 */
export const isAcceptedBy = (
    cloud: Pick<DomainCloud, 'acceptedBy'>,
    delegatorId: string | null | undefined
): boolean => {
    if (!cloud.acceptedBy?.length) return true;
    return !!delegatorId && cloud.acceptedBy.includes(delegatorId);
};
