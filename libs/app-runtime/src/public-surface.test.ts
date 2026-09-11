// The session hub is part of THIS package's surface now (ADR-0070 3단계), so nothing here may be
// stubbed — stubbing it is exactly what this gate exists to catch. `@chatic/config` (ADR-0079,
// replacing `@chatic/web-config`) has zero `import.meta` and needs no such stub — this is the win
// ADR-0079 §맥락 3-2 predicted.
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
    // 앱 엔트리가 한 번 만지는 것 — 부팅 호출, 환경 상수, 플랫폼 프로브, transport.
    // `ENV`/`LANGUAGE_KEY`/`PROJECT`/`SOCIAL_OAUTH_ENDPOINT` retired with `@chatic/web-config`
    // (ADR-0079) — their two consumers read `import.meta.env` directly now, and neither value was a
    // setting.
    boot: ['initAppRuntime', 'isNativeApp', 'setNativeCacheSupport', 'startWebTransportInit', 'webTransport'],
    // 세션 상태·인증. `applySessionToken`/`logoutSession`은 socket/auth에 산다 —
    // 소비자에게는 셋 다 세션이다.
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
    // 호스트 + 소켓 상태 읽기 + 깨어남 복구.
    connection: [
        'RuntimeAuthHost',
        'RuntimeConnectionHost',
        'getSocketManager',
        'recoverUnverifiedSockets',
        'useConnectivity',
        'useKindVerified',
        'useRuntimeSocketState',
    ],
    // repository·캐시 티어·아웃박스.
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
    sync: ['getSyncManager', 'useChannelSync', 'useChatSync', 'usePlaceSync'],
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
        // 같은 심볼을 두 이름으로 파는 순간 소비자마다 다른 관례가 생기고, 둘 중 하나는 반드시
        // 낡는다. 마이그레이션이 끝났으므로 평탄 레인은 없고, 이 검사가 그것이 돌아오는 것을 막는다.
        expect(Object.keys(api)).toEqual(['runtime']);
    });
});
