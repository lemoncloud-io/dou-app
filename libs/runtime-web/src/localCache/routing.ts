import type { CacheType } from '@chatic/bridge-messages';
import type { BridgeChannel } from '@chatic/bridges';

import { isCacheTypeUsableBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';

export const isPhoneAppBridge = (bridge: BridgeChannel | null): boolean => bridge === 'react-native-webview';

export interface CacheRoutingHost {
    bridge: BridgeChannel | null;
    support: NativeCacheSupport | null;
}

export type CacheBackend = 'web' | 'native' | 'session';

const WEB_PINNED_CACHE_TYPES: ReadonlySet<CacheType> = new Set<CacheType>();

export const resolveCacheBackendFor = (type: CacheType, host: CacheRoutingHost): CacheBackend => {
    if (type === 'invitecloud' && host.bridge === null) return 'session';
    if (!isPhoneAppBridge(host.bridge)) return 'web';
    if (WEB_PINNED_CACHE_TYPES.has(type)) return 'web';
    if (!isCacheTypeUsableBy(host.support, type)) return 'web';
    return 'native';
};
