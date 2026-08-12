// web-core's transport uses `import.meta.env`, which this jest config cannot parse. We only need
// app-runtime's OWN export keys, not web-core's runtime values, so stub the whole module (any named
// import resolves to a jest.fn()). Mirrors how the other app-runtime suites isolate web-core.
import * as api from './index';

jest.mock('@chatic/web-core', () => new Proxy({}, { get: () => jest.fn() }));

/**
 * Locks the package's PUBLIC runtime surface. Type-only exports (SessionProfile, ISocketManager,
 * DeviceTokenDelegate) are erased at runtime and do not appear here — this asserts the value exports
 * only. Adding/removing a public value export must be a deliberate change to this list, so internal
 * wiring (socket auth bootstrap/reauth, connection binders, raw session actions, useSyncTarget)
 * can never leak back into the barrel unnoticed.
 */
describe('@chatic/app-runtime public surface', () => {
    it('exports exactly the intended value symbols', () => {
        const EXPECTED = [
            // value-deriving hooks
            'useRuntimeBinding',
            'useRuntimeRepositories',
            'useRuntimeSocketState',
            'useRuntimeProfile',
            // cross-cloud cache reads (search + result-row context) — the only path that reads
            // outside the active cloud, since repositories are scoped to it
            'useGlobalCacheSearch',
            // key helper for the context maps that hook returns
            'globalCacheRefKey',
            // per-kind (relay/cloud) verified state, for gating a getScopedClient-pinned request
            'useKindVerified',
            // back-compat aliases (desktop-web) — useRuntimeSocketState / useRuntimeProfile
            'useSocketState',
            'useSessionProfile',
            // session action hooks
            'useSiteSwitch',
            'useSessionLogout',
            'useLogoutCloudSession',
            // session actions (non-hook) — verify-hash-alias $token → relay session/socket switch
            'applySessionToken',
            // foreground/wake kick for wedged sockets (2026-08 session audit §7 Phase 1)
            'recoverUnverifiedSockets',
            // single credentials-refresh entry point (socket-owned first, HTTP fallback; §7 Phase 2-3)
            'requestSessionRefresh',
            // apps/web boot-time DataRepositoriesV2 option injection (e.g. persistEmbeddedSite gating,
            // ADR-0045) — pre-existing export this list had drifted out of sync with.
            'configureDataRuntime',
            // cache tier helpers (cold-db activation + invited-cloud durability)
            'isNativeApp',
            'setChatCacheLimit',
            // web↔app deploy skew: what the installed app says it can store locally
            'setNativeCacheSupport',
            'getNativeCacheSupport',
            'useInvitedCloudMigration',
            'useInvitedCloudNameSync',
            'recoverInvitedCloudIfMissing',
            // desktop-web repairs the active invited cloud itself: the hook above is native-gated,
            // but the name fetch underneath it is not platform-specific.
            'syncInvitedCloudName',
            // sync registration hooks
            'useChatSync',
            'useChannelSync',
            'usePlaceSync',
            // lifecycle
            'RuntimeConnectionHost',
            'RuntimeAuthHost',
            'useConnectivity',
            'useDeviceTokenRegistration',
            // offline outbox (engine machine; the app opts in — apps/web keeps manual resend)
            'createChatOutbox',
            // manager entry points
            'getSocketManager',
            'getSyncManager',
        ].sort();

        expect(Object.keys(api).sort()).toEqual(EXPECTED);
    });
});
