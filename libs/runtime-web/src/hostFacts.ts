import { hostProfile } from '@chatic/bridges';
import type { BridgeChannel, CapabilityDeclaration, HostProfile } from '@chatic/bridges';

export interface WebHostFacts {
    readonly bridge: BridgeChannel | null;
    readonly platform: string | undefined;
    readonly storageMedia: readonly string[];
    readonly runtimeOffer: unknown;
    readonly capabilities: CapabilityDeclaration;
}

export interface WebHostFactsSources {
    profile?: HostProfile;
}

export const readWebHostFacts = ({ profile = hostProfile() }: WebHostFactsSources = {}): WebHostFacts =>
    Object.freeze({
        bridge: profile.bridge,
        platform: profile.globals.CHATIC_APP_PLATFORM,
        storageMedia: profile.storageMedia,
        runtimeOffer: profile.runtimeOffer,
        capabilities: profile.capabilities,
    });
