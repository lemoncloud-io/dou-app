import type { PairingListItem } from '@chatic/http';

type DeviceKind = 'mobile' | 'desktop' | 'web' | 'cli' | '';

/** The label key for a device's kind. A device saved before kinds existed has `''`. */
export const deviceKindKey = (kind: DeviceKind | string | undefined): string => {
    switch (kind) {
        case 'mobile':
        case 'desktop':
        case 'web':
        case 'cli':
            return `pairing.devices.kind.${kind}`;
        default:
            return 'pairing.devices.kind.unknown';
    }
};

/**
 * The rows the "approved sign-ins" section lists: approvals that still stand, newest first.
 *
 * A relay approval nobody ever claimed is a session the requester lost (the claim answer did not
 * arrive), so it is flagged for removal. A cloud approval never hands out a session, so it never has
 * a `claimedAt` and is never flagged.
 */
export const approvedPairingRows = (list: readonly PairingListItem[]) =>
    list
        .filter(item => item.status === 'approved')
        .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
        .map(item => ({
            ...item,
            unclaimed: item.target.type === 'relay' && !item.claimedAt,
        }));
