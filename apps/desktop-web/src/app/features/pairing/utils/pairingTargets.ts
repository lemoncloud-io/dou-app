import type { PairingTarget } from './types';

export interface PairingTargetOption {
    /** `relay`, or the cloud id. */
    key: string;
    target: PairingTarget;
    /** The cloud's name, for a cloud option; the id when the catalog has no name for it. */
    cloudName?: string;
}

/** The key of the "my whole account" option — never a cloud id. */
export const RELAY_TARGET_KEY = 'relay';

/**
 * What the approving account can let the requester into, and which option starts selected.
 *
 * "My whole account" (the relay) only when the account is not a guest — the relay refuses a guest
 * approving its own relay session — then one option per cloud in the catalog. The default is where the
 * account is working now: the active cloud, or the whole account on the relay. An active cloud that is
 * not among the options (a cloud joined by invite) falls back the same way as the relay.
 */
export const pairingTargetOptions = (input: {
    isRelayGuest: boolean;
    clouds: ReadonlyArray<{ id?: string; name?: string }>;
    /** The active cloud id, or `null` on the relay. */
    activeCloudId: string | null;
}): { options: PairingTargetOption[]; defaultKey: string | null } => {
    const options: PairingTargetOption[] = [];
    if (!input.isRelayGuest) options.push({ key: RELAY_TARGET_KEY, target: { type: 'relay' } });
    for (const cloud of input.clouds) {
        if (!cloud.id || cloud.id === RELAY_TARGET_KEY) continue;
        options.push({
            key: cloud.id,
            target: { type: 'cloud', cloudId: cloud.id },
            cloudName: cloud.name || cloud.id,
        });
    }
    const active = input.activeCloudId ? options.find(option => option.key === input.activeCloudId) : undefined;
    const fallback = options.find(option => option.key === RELAY_TARGET_KEY) ?? options[0];
    return { options, defaultKey: (active ?? fallback)?.key ?? null };
};
