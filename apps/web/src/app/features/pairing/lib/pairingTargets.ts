import type { PairingTarget } from '@chatic/http';

/** `owned` comes from the relay catalog, `invited` from this device's cloud cache. */
export type PairingCloudKind = 'owned' | 'invited';

type PairingCloud = { id?: string; name?: string; kind?: PairingCloudKind };

/**
 * Every cloud the account can switch to: the relay catalog's (owned) first, then the invited ones.
 *
 * The catalog holds owned clouds only; an invited cloud lives in this device's cloud cache alone, so
 * a screen reading the catalog by itself leaves out every cloud the account was invited to. The relay
 * delegates an approval into an invited cloud the same way it delegates the approver's own switch,
 * so both lists are offered. A cloud in both is kept once, as owned — `useInvitedClouds` already
 * hides those, so this only guards against a duplicate option should that ever change. Each cloud
 * keeps which list it came from, because a relay approval carries the owned ones and not the invited.
 */
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
    /** `relay`, or the cloud id. */
    key: string;
    target: PairingTarget;
    /** The cloud's name, for a cloud option. */
    cloudName?: string;
    /** Where a cloud option came from, when known. */
    cloudKind?: PairingCloudKind;
}

/**
 * What the approving account can let the requester into, and which one starts selected.
 *
 * "My account" (the relay) only when the account is not a guest — the relay refuses a guest approving
 * its own relay session — then one option per cloud the account can switch to. The default is where
 * the account is working now: the active cloud, or the account on the relay.
 */
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
