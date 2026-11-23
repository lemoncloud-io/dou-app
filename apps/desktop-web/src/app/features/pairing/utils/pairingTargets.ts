import type { PairingTarget } from './types';

export interface PairingTargetOption {
    key: string;
    target: PairingTarget;
    cloudName?: string;
}

export const RELAY_TARGET_KEY = 'relay';

export const pairingTargetOptions = (input: {
    isRelayGuest: boolean;
    clouds: ReadonlyArray<{ id?: string; name?: string }>;
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
