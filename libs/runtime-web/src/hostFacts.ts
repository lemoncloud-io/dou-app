import { hostProfile } from '@chatic/bridges';
import type { BridgeChannel, CapabilityDeclaration, HostProfile } from '@chatic/bridges';

/**
 * What a web page knows about its host, as one plain frozen value: the inputs a runtime's choice of
 * adapters is made from, so that choice can be a function of a value rather than of globals.
 *
 * All of it is the host profile's, fixed before the page's scripts ran. The shell's cache report is not
 * a fact: it arrives later, with the bridge handshake, so a cache reads it at each decision instead.
 */
export interface WebHostFacts {
    /** The bridge channel present at boot, or `null` outside a shell. */
    readonly bridge: BridgeChannel | null;
    /** The shell-injected platform (`CHATIC_APP_PLATFORM`); `undefined` in a plain browser. */
    readonly platform: string | undefined;
    /** The storage media the shell said it keeps (`CHATIC_APP_STORAGE_MEDIA`). */
    readonly storageMedia: readonly string[];
    /** The shell's offer to own the session (`CHATIC_APP_RUNTIME`), untouched; `readRuntimeOffer` validates it. */
    readonly runtimeOffer: unknown;
    /** The shell's capability declaration (`CHATIC_APP_CAPABILITIES`). */
    readonly capabilities: CapabilityDeclaration;
}

export interface WebHostFactsSources {
    /** The host profile to read; this page's own (`hostProfile()`) by default. */
    profile?: HostProfile;
}

/**
 * Reads this page's host facts. Pure over its sources: a test, or a caller holding its own profile,
 * hands them in. The profile's parts are frozen already and are carried as they are.
 */
export const readWebHostFacts = ({ profile = hostProfile() }: WebHostFactsSources = {}): WebHostFacts =>
    Object.freeze({
        bridge: profile.bridge,
        platform: profile.globals.CHATIC_APP_PLATFORM,
        storageMedia: profile.storageMedia,
        runtimeOffer: profile.runtimeOffer,
        capabilities: profile.capabilities,
    });
