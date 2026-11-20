// The session hub is part of THIS package's surface now (ADR-0070 Step 3), so nothing here may be
// stubbed — stubbing it is exactly what this gate exists to catch. `@chatic/config` (ADR-0079,
// replacing `@chatic/web-config`) has zero `import.meta` and needs no such stub — this is the win
// ADR-0079 §context 3-2 predicted.
import { host } from '@chatic/runtime-client';

import * as api from './index';
import {
    browserAppShell,
    browserDiagnostics,
    browserFiles,
    browserLinks,
    browserMedia,
    browserPush,
    browserSignIn,
} from './testing';

/**
 * Locks the package's PUBLIC runtime surface — now group by group.
 *
 * The facade sells eight namespace groups (`boot` · `session` · `connection` · `data` · `sync` · `push` ·
 * `report` · `settings`) and seven host ports, and a group is a CONSUMER's job, not a folder: three of the symbols below are published
 * by a group whose module does not hold their file. Listing membership here is what makes that
 * grouping a contract instead of a comment — moving a symbol between groups is a breaking change for
 * every call site, so it has to be a deliberate edit to this file.
 *
 * Type-only exports (`SessionProfile` · `SlotStatus` · `DeviceTokenDelegate` · the option types)
 * are erased at runtime and do not appear in `GROUPS` — those lists hold the value exports only, and a
 * type a call site cannot do without is checked by the compiler instead (the last test). Internal wiring
 * (socket auth bootstrap/reauth, the connection controller, raw session actions, `useSyncTarget`,
 * `useHostControllers`) can therefore never leak back into the barrel unnoticed.
 */
const GROUPS: Record<string, readonly string[]> = {
    // What an app entry point touches once — the boot call, env constants, platform probe, transport.
    // `ENV`/`LANGUAGE_KEY`/`PROJECT`/`SOCIAL_OAUTH_ENDPOINT` retired with `@chatic/web-config`
    // (ADR-0079) — their two consumers read `import.meta.env` directly now, and neither value was a
    // setting.
    // The stores an app keeps state in are chosen in `@chatic/runtime-web` (`resolveStorageStores`), which
    // also builds the runtime; this group hands the React surface the engine it built.
    boot: [
        'discardWebSessionCopy',
        'hasWebSessionCopy',
        'initAppRuntime',
        'isNativeApp',
        'prepareSecretStorage',
        'webTransport',
    ],
    // Session state · auth. `confirmPhoneLogin`/`logoutSession` live in `@chatic/auth`'s socket/ —
    // to a consumer, all of them are "session".
    session: [
        'INVITE_LOGIN_UNKNOWN',
        'PHONE_LOGIN_NOTHING_PENDING',
        'PHONE_LOGIN_NO_TOKEN',
        'PHONE_LOGIN_SWITCH_FAILED',
        'SWITCH_CLOUD_MUTATION_KEY',
        'SWITCH_SITE_MUTATION_KEY',
        'authFailureReaction',
        'cancelPhoneLogin',
        'classifyPairingError',
        'clearSiteSelection',
        'confirmPhoneLogin',
        'createCredentialsByProvider',
        'fetchAccountProfile',
        'deviceDisplayName',
        'fetchInviteInfoWithCode',
        'forgetInviteLogin',
        'forgetRefusedPairedCloud',
        'getActiveServerContext',
        'getActiveSessionUser',
        'getCommittedSessionSiteId',
        'getGlobalSessionContext',
        'getIdentityContext',
        'getRelaySessionUser',
        'getUidInCloud',
        'isInOwnCloudSession',
        'isPairedSession',
        'isRefusedForEndedPairing',
        'isSessionKey',
        'logoutSession',
        'pairingClientOf',
        'patchRelaySessionUser',
        'registerSessionLogoutCallback',
        'registerUserWithInviteCode',
        'retryPhoneLogin',
        'updateAccountProfile',
        'useCloudCredentialGuard',
        'useDynamicDeviceId',
        'useFindAlias',
        'useGlobalSession',
        'useInviteFlow',
        'useInviteInfo',
        'useIsPairedSession',
        'useLogin',
        'useLoginRelayGuestByDevice',
        'useLoginRelaySocial',
        'useLogoutCloudSession',
        'usePairedCloudCheck',
        'usePairedCloudIds',
        'usePairedCloudNames',
        'usePairingAwareLogout',
        'usePairingRequest',
        'useRegisterUserV2',
        'useRuntimeProfile',
        'useSessionAuth',
        'useSessionIdentity',
        'useSessionLogout',
        'useSessionSelection',
        'useSessionStalenessGuard',
        'useSiteSwitch',
        'useSwitchCloudSession',
        'useUidInCloud',
        'useVerifyAlias',
    ],
    // Hosts + socket state reads + waits, slot requests and pushes + wake recovery + the background-cloud
    // and owned-cloud lists — all through the engine; the socket manager itself is not sold.
    connection: [
        'RELAY_SLOT',
        'RuntimeAuthHost',
        'RuntimeConnectionHost',
        'getRuntimeSocketState',
        'getSlotStatuses',
        'observeSocketRequests',
        'onServerEvent',
        'onServerMessage',
        'reconnectSocket',
        'recoverSocketsOnResume',
        'recoverUnverifiedSockets',
        'useBackgroundClouds',
        'useCloudVerified',
        'useConnectivity',
        'useReclaimOwnedClouds',
        'useRuntimeSocketState',
        'useSlotVerified',
        'useVerifiedClouds',
        'waitUntilVerified',
    ],
    // Repository · cache tier · outbox.
    data: [
        'clearLocalCaches',
        'cloudsKeys',
        'createChatOutbox',
        'getAcceptorId',
        'getCacheMetricsSource',
        'getCloudRepositories',
        'globalCacheRefKey',
        'isAcceptedBy',
        'recoverInvitedCloudIfMissing',
        'requestSyncCursorReset',
        'sendChatInCloud',
        'setStateOutboxObserver',
        'syncInvitedCloudName',
        'syncPairedCloudName',
        'useGlobalCacheSearch',
        'useImageSendProgress',
        'useInvitedCloudNameSync',
        'usePairedCloudNameSync',
        'useRuntimeRepositories',
        'useSendImages',
        'waitForCloudSocket',
        'withAcceptor',
    ],
    sync: [
        'fetchRoomFeed',
        'isChannelRefused',
        'listSyncTargets',
        'prefetchRoomFeed',
        'refreshBackgroundClouds',
        'registerSyncTarget',
        'subscribeBackgroundDeltas',
        'subscribeRefusedChannels',
        'updateSyncSnapshot',
        'useChannelSync',
        'useChatSync',
        'usePlaceSync',
    ],
    // The push port's fields join the push hooks one by one: each is the published port's answer.
    push: [
        'deviceToken',
        'kind',
        'localBanner',
        'notifications',
        'tokenRenewal',
        'useDeviceTokenRegistration',
        'useRegisterDeviceTokenMutation',
    ],
    report: ['reportIssue', 'uploadLogBatch'],
    // The config facade's reads and writes under its own method names, its hook, and the helpers the
    // screens use beside them.
    settings: [
        'CONFIG_UNLOCK_KEY',
        'clear',
        'encodeValue',
        'get',
        'isInitialized',
        'overriddenSnapshots',
        'set',
        'snapshot',
        'snapshotAll',
        'storageKeyFor',
        'subscribe',
        'useConfigValue',
    ],
};

/** The host ports, each the very object the entry point published. */
const PORTS = ['appShell', 'checkout', 'diagnostics', 'files', 'links', 'media', 'signIn'] as const;

/**
 * The domain's values beside `runtime`, flat, as `@chatic/data` sold them to apps. Types are erased
 * and checked by the compiler where they are used.
 */
const DOMAIN_VALUES = [
    'ACCOUNT_CHANNEL_SID',
    'CHAT_ATTACHMENT_ACCEPT',
    'CHAT_ATTACHMENT_MAX_BYTES',
    'CHAT_IMAGE_TYPES',
    'IMAGE_MESSAGE_SLOT_MAX',
    'RELAY_CLOUD_ID',
    'RELAY_ORIGIN_CID',
    'canModifyMessage',
    'channelIdOfChatId',
    'chatAttachmentAccept',
    'chatAttachmentExtension',
    'chatAttachmentFormat',
    'chatAttachmentStoredKind',
    'chatAttachmentSummary',
    'chatMediaEntries',
    'chatMediaItems',
    'chatNotificationEntries',
    'compareByChatNo',
    'dmPlaceOf',
    'extractFirstUrl',
    'isChatAttachmentNameTooLong',
    'isCloudDm',
    'isEventChat',
    'isFeedVisible',
    'isInJoinWindow',
    'isInPlaceList',
    'isMentioningViewer',
    'isMessageEdited',
    'isNotifiableChat',
    'isNotifiableMessage',
    'isOwnSystemChat',
    'isPendingUploadSlot',
    'isPreviewableChat',
    'isRelayDm',
    'isShellFileRef',
    'isWebhookChat',
    'isWebhookExpired',
    'judgeChatAttachments',
    'judgeChatImages',
    'miniAppSaveProblemOf',
    'pickPreviewChat',
    'placeOfDmId',
    'pushCloudIdOf',
    'toMentionBody',
    'toPlainPreview',
    'toPlainText',
    'tokenizeMessage',
    'uncoveredIn',
    'uploadSlotKind',
];

describe('@chatic/runtime public surface', () => {
    afterEach(() => host.resetForTests());

    it.each(Object.keys(GROUPS))('runtime.%s는 정확히 이 심볼들을 판다', group => {
        const members = api.runtime[group as keyof typeof api.runtime] as Record<string, unknown>;

        expect(Object.keys(members).sort()).toEqual([...GROUPS[group]].sort());
    });

    it('runtime holds these groups and ports and nothing else', () => {
        expect(Object.keys(api.runtime).sort()).toEqual([...Object.keys(GROUPS), ...PORTS].sort());
    });

    it('publishes runtime and the domain values at the top, and nothing else', () => {
        // The moment the same symbol is sold under two names, each consumer picks up a different
        // convention and one of the two is bound to go stale. So no runtime member is flat — the
        // domain's names are the only thing beside `runtime`, and this list is theirs.
        expect(Object.keys(api).sort()).toEqual(['runtime', ...DOMAIN_VALUES].sort());
    });

    it.each(PORTS)('runtime.%s is the very port the entry point published', port => {
        const notifications = { onReceive: () => () => undefined };
        host.publish({
            checkout: { kind: 'none' },
            media: browserMedia(),
            files: { ...browserFiles(), kind: 'shell' },
            links: browserLinks(),
            appShell: { ...browserAppShell(), kind: 'shell', os: 'ios' },
            signIn: { ...browserSignIn(), kind: 'shell', os: 'android' },
            diagnostics: browserDiagnostics(),
            push: { ...browserPush(), kind: 'shell', notifications },
        });

        expect(api.runtime[port]).toBe(host.ports[port]);
        expect(api.runtime.push.kind).toBe('shell');
        expect(api.runtime.push.notifications).toBe(notifications);
        expect(api.runtime.push.deviceToken).toBeNull();
    });

    it('runtime.data publishes the image send options, and sendImages takes them second', () => {
        // Erased at runtime, so the check is that this compiles: it stops compiling if the type leaves
        // the group or `sendImages` stops taking it.
        type SendImages = ReturnType<typeof api.runtime.data.useSendImages>['sendImages'];
        const options: api.runtime.data.SendImagesOptions = { separately: true, content: 'caption' };
        const taken: Parameters<SendImages>[1] = options;

        expect(taken).toEqual({ separately: true, content: 'caption' });
    });
});
