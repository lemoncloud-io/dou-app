// The session hub is part of THIS package's surface now (ADR-0070 Step 3), so nothing here may be
// stubbed — stubbing it is exactly what this gate exists to catch. `@chatic/config` (ADR-0079,
// replacing `@chatic/web-config`) has zero `import.meta` and needs no such stub — this is the win
// ADR-0079 §context 3-2 predicted.
import * as api from './index';

/**
 * Locks the package's PUBLIC runtime surface — now group by group.
 *
 * The facade sells seven groups (`boot` · `session` · `connection` · `data` · `sync` · `push` ·
 * `report`), and a group is a CONSUMER's job, not a folder: three of the symbols below are published
 * by a group whose module does not hold their file. Listing membership here is what makes that
 * grouping a contract instead of a comment — moving a symbol between groups is a breaking change for
 * every call site, so it has to be a deliberate edit to this file.
 *
 * Type-only exports (`SessionProfile` · `ISocketManager` · `DeviceTokenDelegate` · the option types)
 * are erased at runtime and do not appear here — this asserts the value exports only. Internal wiring
 * (socket auth bootstrap/reauth, the connection binders, raw session actions, `useSyncTarget`,
 * `useRuntimeSocketSlots`) can therefore never leak back into the barrel unnoticed.
 */
const GROUPS: Record<string, readonly string[]> = {
    // What an app entry point touches once — the boot call, env constants, platform probe, transport.
    // `ENV`/`LANGUAGE_KEY`/`PROJECT`/`SOCIAL_OAUTH_ENDPOINT` retired with `@chatic/web-config`
    // (ADR-0079) — their two consumers read `import.meta.env` directly now, and neither value was a
    // setting.
    boot: ['initAppRuntime', 'isNativeApp', 'setNativeCacheSupport', 'startWebTransportInit', 'webTransport'],
    // Session state · auth. `applySessionToken`/`logoutSession` live in socket/auth —
    // to a consumer, all three are "session".
    session: [
        'SWITCH_CLOUD_MUTATION_KEY',
        'SWITCH_SITE_MUTATION_KEY',
        'applySessionToken',
        'authFailureReaction',
        'createCredentialsByProvider',
        'fetchInviteInfoWithCode',
        'getActiveServerContext',
        'getActiveSessionUser',
        'getGlobalSessionContext',
        'getIdentityContext',
        'getRelaySessionUser',
        'logoutSession',
        'patchRelaySessionUser',
        'registerSessionLogoutCallback',
        'registerUserWithInviteCode',
        'useCloudCredentialGuard',
        'useDynamicDeviceId',
        'useFindAlias',
        'useGlobalSession',
        'useInviteFlow',
        'useInviteInfo',
        'useLogin',
        'useLoginRelayGuestByDevice',
        'useLoginRelaySocial',
        'useLogoutCloudSession',
        'useRegisterUserV2',
        'useRuntimeProfile',
        'useSessionAuth',
        'useSessionIdentity',
        'useSessionLogout',
        'useSessionSelection',
        'useSessionStalenessGuard',
        'useSiteSwitch',
        'useSwitchCloudSession',
        'useVerifyAlias',
    ],
    // Hosts + socket state reads + wake recovery.
    connection: [
        'RuntimeAuthHost',
        'RuntimeConnectionHost',
        'getSocketManager',
        'recoverUnverifiedSockets',
        'useConnectivity',
        'useKindVerified',
        'useRuntimeSocketState',
    ],
    // Repository · cache tier · outbox.
    data: [
        'cloudsKeys',
        'createChatOutbox',
        'getCacheMetricsSource',
        'globalCacheRefKey',
        'recoverInvitedCloudIfMissing',
        'syncInvitedCloudName',
        'useGlobalCacheSearch',
        'useInvitedCloudNameSync',
        'useRuntimeRepositories',
    ],
    sync: [
        'getSyncManager',
        'isChannelRefused',
        'subscribeRefusedChannels',
        'useChannelSync',
        'useChatSync',
        'usePlaceSync',
    ],
    push: ['useDeviceTokenRegistration', 'useRegisterDeviceTokenMutation'],
    report: ['reportIssue', 'uploadLogBatch'],
};

describe('@chatic/app-runtime public surface', () => {
    it.each(Object.keys(GROUPS))('runtime.%s는 정확히 이 심볼들을 판다', group => {
        const members = api.runtime[group as keyof typeof api.runtime] as Record<string, unknown>;

        expect(Object.keys(members).sort()).toEqual([...GROUPS[group]].sort());
    });

    it('runtime은 이 일곱 그룹만 가진다', () => {
        expect(Object.keys(api.runtime).sort()).toEqual(Object.keys(GROUPS).sort());
    });

    it('최상위는 runtime 하나뿐이다 — 평탄 별칭은 없다', () => {
        // The moment the same symbol is sold under two names, each consumer picks up a different
        // convention and one of the two is bound to go stale. The migration is done, so there's no
        // flat lane, and this check keeps one from coming back.
        expect(Object.keys(api)).toEqual(['runtime']);
    });
});
