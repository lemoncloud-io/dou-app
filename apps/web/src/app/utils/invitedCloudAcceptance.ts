import type { DomainCloud } from '@chatic/runtime';

export const withAcceptor = (
    acceptedBy: readonly string[] | undefined,
    delegatorId: string | null | undefined
): string[] | undefined => {
    if (!delegatorId) return acceptedBy ? [...acceptedBy] : undefined;
    const current = acceptedBy ?? [];
    return current.includes(delegatorId) ? [...current] : [...current, delegatorId];
};

export const isAcceptedBy = (
    cloud: Pick<DomainCloud, 'acceptedBy'>,
    acceptorId: string | null | undefined
): boolean => {
    if (!cloud.acceptedBy?.length) return true;
    return !!acceptorId && cloud.acceptedBy.includes(acceptorId);
};
