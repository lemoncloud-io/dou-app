import { logger } from '@chatic/logger';

import { readCapabilityDeclaration, type CapabilityDeclaration } from './capabilities';
import { readShellGlobals, type ShellGlobals } from './shellGlobals';

/**
 * The message channel a shell put on `window`, by kind. The phone app's WebView exposes
 * `ReactNativeWebView`; the other two are the Android and WebKit message handler interfaces.
 */
export type BridgeChannel = 'react-native-webview' | 'message-handler' | 'webkit-message-handler';

/**
 * What this page knows about the host it runs in, fixed at boot.
 *
 * Built once, from what the host stated before the page's scripts ran, and frozen. Nothing the page
 * learns later — the handshake, a version the shell announces — changes it: a profile that moved
 * after the first paint would be a screen switching between two hosts.
 */
export interface HostProfile {
    /** The bridge channel present at boot, or `null` outside a shell. */
    readonly bridge: BridgeChannel | null;
    /** The boot globals, as injected. Each reader keeps its own fallback for a missing one. */
    readonly globals: ShellGlobals;
    /** The storage media the shell said it keeps (`CHATIC_APP_STORAGE_MEDIA`); empty when it said nothing usable. */
    readonly storageMedia: readonly string[];
    /** The shell's offer to own the session (`CHATIC_APP_RUNTIME`), untouched; its reader validates it. */
    readonly runtimeOffer: unknown;
    /** The capability declaration (`CHATIC_APP_CAPABILITIES`). */
    readonly capabilities: CapabilityDeclaration;
}

type HostSource = Readonly<Record<string, unknown>>;

const bridgeChannelOf = (source: HostSource | undefined): BridgeChannel | null => {
    if (!source) return null;
    const w = source as Partial<Window>;
    // The same three checks, in the same order, as `isNative()`.
    if (w.ReactNativeWebView?.postMessage) return 'react-native-webview';
    if (w.ChaticMessageHandler?.postMessage) return 'message-handler';
    if (w.webkit?.messageHandlers?.ChaticMessageHandler?.postMessage) return 'webkit-message-handler';
    return null;
};

const deepFreeze = <T>(value: T): T => {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const inner of Object.values(value)) deepFreeze(inner);
    }
    return value;
};

/**
 * A copy of a shell's JSON value, frozen, so the profile never shares (or freezes) an object the shell
 * still holds. A JSON round trip rather than `structuredClone`, which Hermes lacks. A value that cannot
 * be copied — a cycle, a `BigInt` — is kept as it is and left unfrozen; its readers treat it as
 * untrusted input either way.
 */
const frozenCopyOf = <T>(value: T): T => {
    if (typeof value !== 'object' || value === null) return value;
    try {
        return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
    } catch {
        return value;
    }
};

/**
 * Builds a profile from a host's globals — `window` in a page, a plain object in a test. Pure: it
 * reads `source` and nothing else, and copies what it keeps, so a later write to `source` does not
 * reach the profile.
 */
export const buildHostProfile = (source: HostSource | undefined): HostProfile => {
    const media = source?.['CHATIC_APP_STORAGE_MEDIA'];
    const capabilities = readCapabilityDeclaration(source?.['CHATIC_APP_CAPABILITIES']);
    return Object.freeze({
        bridge: bridgeChannelOf(source),
        globals: Object.freeze(readShellGlobals(source)),
        storageMedia: Object.freeze(
            Array.isArray(media) ? media.filter((m): m is string => typeof m === 'string') : []
        ),
        runtimeOffer: frozenCopyOf(source?.['CHATIC_APP_RUNTIME']),
        capabilities: Object.freeze(
            capabilities.kind === 'declared'
                ? { ...capabilities, values: frozenCopyOf(capabilities.values) }
                : capabilities
        ),
    });
};

let current: HostProfile | null = null;

/**
 * This page's profile. The first call builds it from `window`; every later call returns the same
 * frozen object. The first call happens at boot, in each app's entry point, before the first render —
 * by then every shell has set its globals and its channel, which is what the storage choice made at
 * the same moment already relies on.
 */
export const hostProfile = (): HostProfile => {
    if (!current) {
        current = buildHostProfile(typeof window === 'undefined' ? undefined : (window as unknown as HostSource));
        if (current.capabilities.kind === 'malformed') {
            logger.warn(
                'BRIDGE',
                '[HostProfile] unreadable CHATIC_APP_CAPABILITIES; every declared capability is unavailable'
            );
        }
    }
    return current;
};

/** Tests only: forget the built profile, so the next `hostProfile()` reads `window` again. */
export const resetHostProfileForTests = (): void => {
    current = null;
};
