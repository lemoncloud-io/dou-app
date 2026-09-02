// The session hub is part of THIS package's surface now (ADR-0070 3단계), so nothing here may be
// stubbed — stubbing it is exactly what this gate exists to catch. `@chatic/web-config` (the sole
// `import.meta` holder) is stubbed globally by jest.config.js instead.
import * as api from './index';
// `@chatic/web-config` is the sole `import.meta` holder (ADR-0070 결정 6); ts-jest's CommonJS
// transform cannot parse it, and HttpManager pulls it in transitively.
jest.mock('@chatic/web-config', () => new Proxy({}, { get: () => jest.fn() }));

/**
 * Locks the package's PUBLIC runtime surface. Type-only exports (SessionProfile, ISocketManager,
 * DeviceTokenDelegate) are erased at runtime and do not appear here — this asserts the value exports
 * only. Adding/removing a public value export must be a deliberate change to this list, so internal
 * wiring (socket auth bootstrap/reauth, connection binders, raw session actions, useSyncTarget)
 * can never leak back into the barrel unnoticed.
 */
describe('@chatic/app-runtime public surface', () => {
    it('exports exactly the intended value symbols', () => {
        // 3단계에서 세션 허브(store 리더 · auth 유스케이스 · 훅 25종)가 이 패키지로 들어왔다.
        // 그 뒤 REST 데이터 훅 13종(clouds·subscription·users·profile + 그 쿼리 키)은 앱 레이어로
        // 내려갔다 — 소비자가 화면뿐이고 react-query가 캐시 전부였다 (ADR-0070 결정 5, ②안 방향).
        // 남은 것은 런타임 자신이 부르는 `useRegisterDeviceTokenMutation`과, 로그인 직후
        // 무효화에 쓰는 `cloudsKeys`뿐이다.
        const EXPECTED = [
            'ENV',
            'LANGUAGE_KEY',
            'PROJECT',
            'RuntimeAuthHost',
            'RuntimeConnectionHost',
            'SOCIAL_OAUTH_ENDPOINT',
            'SWITCH_CLOUD_MUTATION_KEY',
            'SWITCH_SITE_MUTATION_KEY',
            'applySelectedSite',
            'applySessionToken',
            'clearRelaySession',
            'cloudsKeys',
            'commitServerRefreshedToken',
            'createChatOutbox',
            'createCredentialsByProvider',
            'fetchInviteInfoWithCode',
            'getActiveServerContext',
            'getActiveSessionUser',
            'getCacheMetricsSource',
            'getCloudSessionContext',
            'getCloudSessionSnapshot',
            'getCommittedCloudId',
            'getGlobalSessionContext',
            'getIdentityContext',
            'getNativeCacheSupport',
            'getRelaySessionUser',
            'getSelectedCloudId',
            'getSelectedSiteId',
            'getServerAuthRegistration',
            'getServiceUnavailable',
            'getSessionAuthSnapshot',
            'getSocketManager',
            'getSyncManager',
            'globalCacheRefKey',
            'initAppRuntime',
            'hasStoredRelaySession',
            'initializeRelaySession',
            'isNativeApp',
            'isStoredSessionExpired',
            'loginRelayByToken',
            'loginRelayGuestByDevice',
            'loginRelaySocial',
            'loginRelayUser',
            'logoutCloudSession',
            'logoutRelaySession',
            'markSessionInitialized',
            'notifySessionStateChanged',
            'patchRelaySessionUser',
            'persistDeviceId',
            'rebuildSessionIdentity',
            'recoverInvitedCloudIfMissing',
            'recoverUnverifiedSockets',
            'redactQueryString',
            'registerSessionCacheInvalidator',
            'registerSessionLogoutCallback',
            'registerUserWithInviteCode',
            'reportIssue',
            'requestRelaySessionRefresh',
            'sanitizeReportUrl',
            'sessionContextStore',
            'setNativeCacheSupport',
            'setSelectedCloudId',
            'setSelectedSiteId',
            'setServiceUnavailable',
            'setSessionAuthenticated',
            'setSessionIdentityState',
            'signServerAuth',
            'startWebTransportInit',
            'subscribeSessionSignal',
            'switchCloudSession',
            'syncInvitedCloudName',
            'toError',
            'uploadLogBatch',
            'useChannelSync',
            'useChatSync',
            'useCloudCredentialGuard',
            'useConnectivity',
            'useDeviceTokenRegistration',
            'useDynamicDeviceId',
            'useFindAlias',
            'useGlobalCacheSearch',
            'useGlobalSession',
            'useRelaySessionInit',
            'useInviteFlow',
            'useInviteInfo',
            'useInvitedCloudNameSync',
            'useKindVerified',
            'useLogin',
            'useLoginRelayGuestByDevice',
            'useLoginRelaySocial',
            'useLogoutCloudSession',
            'usePlaceSync',
            'useRegisterDeviceToken',
            'useRegisterDeviceTokenMutation',
            'useRegisterUser',
            'useRegisterUserV2',
            'useRelaySessionKeepAlive',
            'useRuntimeBinding',
            'useRuntimeProfile',
            'useRuntimeRepositories',
            'useRuntimeSocketState',
            'useServiceUnavailable',
            'useSessionAuth',
            'useSessionIdentity',
            'useSessionLogout',
            'useSessionSelection',
            'useSessionStalenessGuard',
            'useSiteSwitch',
            'useSwitchCloudSession',
            'useVerifyAlias',
            'webTransport',
        ].sort();

        expect(Object.keys(api).sort()).toEqual(EXPECTED);
    });
});
