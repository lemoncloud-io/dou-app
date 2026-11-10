import type { DomainCloud } from '@chatic/data';

import { getIdentityContext, getRelaySessionUser } from '../session';

/**
 * Who an invited cloud belongs to on this device.
 *
 * Invite acceptance is bound to one device user and the server grants the cloud to that user only.
 * The invited-cloud cache is one partition shared by every account that signs in on the device, and
 * it survives a sign-out on purpose (the device's guest still holds the grants), so each row names
 * the users it belongs to in `acceptedBy`. A row one user left behind must not reach the next one's
 * cloud list, name lookups or background sockets: delegating into a cloud the user was never granted
 * makes the server refuse (403) or mint an empty user there.
 */

/**
 * The id the current session is recorded under: the uid of the relay session (a signed-in account,
 * or the device's guest, whose uid is also its `delegatorId`), falling back to the `delegatorId`.
 * Null while nobody is signed in.
 */
export const getAcceptorId = (): string | null => {
    const user = getRelaySessionUser() as { uid?: unknown; id?: unknown } | null;
    const uid = user?.uid ?? user?.id;
    if (typeof uid === 'string' && uid) return uid;
    return getIdentityContext().delegatorId ?? null;
};

/**
 * The acceptor list after `acceptorId` accepts: appended once, existing acceptors kept. Without an
 * id there is nothing to record and the list is returned unchanged.
 */
export const withAcceptor = (
    acceptedBy: readonly string[] | undefined,
    acceptorId: string | null | undefined
): string[] | undefined => {
    if (!acceptorId) return acceptedBy ? [...acceptedBy] : undefined;
    const current = acceptedBy ?? [];
    return current.includes(acceptorId) ? [...current] : [...current, acceptorId];
};

/**
 * Whether `acceptorId` may treat this invited cloud as its own: only when the row records it. A row
 * nobody is recorded for (written before attribution existed) is offered to nobody — "kept for
 * everyone" would keep every leaked row. apps/web reads more leniently (its own
 * `utils/invitedCloudAcceptance`) because a plain tab's rows end with the tab.
 */
export const isAcceptedBy = (cloud: Pick<DomainCloud, 'acceptedBy'>, acceptorId: string | null | undefined): boolean =>
    !!acceptorId && !!cloud.acceptedBy?.includes(acceptorId);
