import { logger } from '@chatic/logger';

import { readCapabilityDeclaration, type CapabilityDeclaration } from './capabilities';
import { readShellGlobals, type ShellGlobals } from './shellGlobals';

export type BridgeChannel = 'react-native-webview' | 'message-handler' | 'webkit-message-handler';

export interface HostProfile {
    readonly bridge: BridgeChannel | null;
    readonly globals: ShellGlobals;
    readonly storageMedia: readonly string[];
    readonly runtimeOffer: unknown;
    readonly capabilities: CapabilityDeclaration;
}

type HostSource = Readonly<Record<string, unknown>>;

const bridgeChannelOf = (source: HostSource | undefined): BridgeChannel | null => {
    if (!source) return null;
    const w = source as Partial<Window>;
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

const frozenCopyOf = <T>(value: T): T => {
    if (typeof value !== 'object' || value === null) return value;
    try {
        return deepFreeze(JSON.parse(JSON.stringify(value)) as T);
    } catch {
        return value;
    }
};

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

export const resetHostProfileForTests = (): void => {
    current = null;
};
