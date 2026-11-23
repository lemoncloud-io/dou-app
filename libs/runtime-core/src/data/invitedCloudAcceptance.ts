import type { DomainCloud } from '@chatic/data';

import { getIdentityContext, getRelaySessionUser } from '@chatic/session';

export const getAcceptorId = (): string | null => {
    const user = getRelaySessionUser() as { uid?: unknown; id?: unknown } | null;
    const uid = user?.uid ?? user?.id;
    if (typeof uid === 'string' && uid) return uid;
    return getIdentityContext().delegatorId ?? null;
};

export const withAcceptor = (
    acceptedBy: readonly string[] | undefined,
    acceptorId: string | null | undefined
): string[] | undefined => {
    if (!acceptorId) return acceptedBy ? [...acceptedBy] : undefined;
    const current = acceptedBy ?? [];
    return current.includes(acceptorId) ? [...current] : [...current, acceptorId];
};

export const isAcceptedBy = (cloud: Pick<DomainCloud, 'acceptedBy'>, acceptorId: string | null | undefined): boolean =>
    !!acceptorId && !!cloud.acceptedBy?.includes(acceptorId);
