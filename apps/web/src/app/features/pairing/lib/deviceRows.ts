import type { PairingListItem } from '@chatic/http';

type DeviceKind = 'mobile' | 'desktop' | 'web' | 'cli' | '';

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

export const approvedPairingRows = (list: readonly PairingListItem[]) =>
    list
        .filter(item => item.status === 'approved')
        .sort((a, b) => (b.approvedAt ?? 0) - (a.approvedAt ?? 0))
        .map(item => ({
            ...item,
            unclaimed: item.target.type === 'relay' && !item.claimedAt,
        }));
