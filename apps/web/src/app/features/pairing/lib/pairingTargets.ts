import type { PairingTarget } from '@chatic/http';

export interface PairingTargetOption {
    /** `relay`, or the cloud id. */
    key: string;
    target: PairingTarget;
    /** The cloud's name, for a cloud option. */
    cloudName?: string;
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
    clouds: ReadonlyArray<{ id?: string; name?: string }>;
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
        });
    }
    const active = input.activeCloudId && options.find(option => option.key === input.activeCloudId);
    const defaultKey = active
        ? active.key
        : ((options.find(option => option.key === 'relay') ?? options[0])?.key ?? null);
    return { options, defaultKey };
};
