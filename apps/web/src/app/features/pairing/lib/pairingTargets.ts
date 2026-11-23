import type { PairingTarget } from '@chatic/http';

export type PairingCloudKind = 'owned' | 'invited';

type PairingCloud = { id?: string; name?: string; kind?: PairingCloudKind };

export const pairingClouds = (
    owned: ReadonlyArray<PairingCloud>,
    invited: ReadonlyArray<PairingCloud>
): PairingCloud[] => {
    const ownedIds = new Set(owned.map(cloud => cloud.id));
    return [
        ...owned.map(cloud => ({ ...cloud, kind: 'owned' as const })),
        ...invited.filter(cloud => !ownedIds.has(cloud.id)).map(cloud => ({ ...cloud, kind: 'invited' as const })),
    ];
};

export interface PairingTargetOption {
    key: string;
    target: PairingTarget;
    cloudName?: string;
    cloudKind?: PairingCloudKind;
}

export const pairingTargetOptions = (input: {
    isRelayGuest: boolean;
    clouds: ReadonlyArray<PairingCloud>;
    activeCloudId: string | null;
}): { options: PairingTargetOption[]; defaultKey: string | null } => {
    const options: PairingTargetOption[] = [];
    if (!input.isRelayGuest) options.push({ key: 'relay', target: { type: 'relay' } });
    for (const cloud of input.clouds) {
        if (!cloud.id) continue;
        options.push({
            key: cloud.id,
            target: { type: 'cloud', cloudId: cloud.id },
            cloudName: cloud.name || cloud.id,
            ...(cloud.kind && { cloudKind: cloud.kind }),
        });
    }
    const active = input.activeCloudId && options.find(option => option.key === input.activeCloudId);
    const defaultKey = active
        ? active.key
        : ((options.find(option => option.key === 'relay') ?? options[0])?.key ?? null);
    return { options, defaultKey };
};
