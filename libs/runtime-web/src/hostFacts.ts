import type { BridgeChannel, CapabilityDeclaration } from '@chatic/bridges';

export interface WebHostFacts {
    readonly bridge: BridgeChannel | null;
    readonly platform: string | undefined;
    readonly storageMedia: readonly string[];
    readonly runtimeOffer: unknown;
    readonly capabilities: CapabilityDeclaration;
}

export const BROWSER_HOST_FACTS: WebHostFacts = Object.freeze({
    bridge: null,
    platform: undefined,
    storageMedia: Object.freeze([]),
    runtimeOffer: undefined,
    capabilities: Object.freeze({ kind: 'absent' }),
});
