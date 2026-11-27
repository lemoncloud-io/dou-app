import type { CacheType } from '@chatic/bridge-messages';
import type { BridgeChannel } from '@chatic/bridges';

import { chooseCandidate, type Candidate, type CandidateChoice } from '../candidates';
import { isCacheTypeUsableBy } from './nativeCacheSupport';
import type { NativeCacheSupport } from './nativeCacheSupport';

export const isPhoneAppBridge = (bridge: BridgeChannel | null): boolean => bridge === 'react-native-webview';

interface CacheRoutingHost {
    bridge: BridgeChannel | null;
    support: NativeCacheSupport | null;
}

export type CacheBackend = 'web' | 'native' | 'session';

const WEB_PINNED_CACHE_TYPES: ReadonlySet<CacheType> = new Set<CacheType>();

export interface CacheDomainContext {
    readonly type: CacheType;
    readonly host: CacheRoutingHost;
}

export type CacheBackendCandidate = Candidate<CacheDomainContext> & { readonly id: CacheBackend };

const sessionBackend: CacheBackendCandidate = {
    id: 'session',
    supports: ({ host }) => host.bridge === null,
    because: 'a browser tab keeps it in the tab',
    refused: 'inside a shell',
};

const nativeBackend: CacheBackendCandidate = {
    id: 'native',
    supports: ({ type, host }) =>
        isPhoneAppBridge(host.bridge) && !WEB_PINNED_CACHE_TYPES.has(type) && isCacheTypeUsableBy(host.support, type),
    because: "the phone app's SQLite holds it",
    refused: 'not the phone app, or its SQLite does not hold this domain',
};

const webBackend: CacheBackendCandidate = { id: 'web', because: 'IndexedDB' };

export const CACHE_DOMAIN_CANDIDATES: {
    readonly default: readonly CacheBackendCandidate[];
    readonly domains: Partial<Record<CacheType, readonly CacheBackendCandidate[]>>;
} = {
    default: [nativeBackend, webBackend],
    domains: { invitecloud: [sessionBackend, nativeBackend, webBackend] },
};

export const chooseCacheBackendFor = (
    type: CacheType,
    host: CacheRoutingHost
): CandidateChoice<CacheBackendCandidate> =>
    chooseCandidate(CACHE_DOMAIN_CANDIDATES.domains[type] ?? CACHE_DOMAIN_CANDIDATES.default, { type, host });

export const resolveCacheBackendFor = (type: CacheType, host: CacheRoutingHost): CacheBackend =>
    chooseCacheBackendFor(type, host).chosen.id;
