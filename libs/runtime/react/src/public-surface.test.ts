import * as headless from '@chatic/runtime';
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

const GROUPS: Record<string, readonly string[]> = {
    boot: [
        'discardWebSessionCopy',
        'hasWebSessionCopy',
        'initAppRuntime',
        'isNativeApp',
        'prepareSecretStorage',
        'webTransport',
    ],
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

const REACT_ADDITION =
    /^(use[A-Z]|Runtime(Auth|Connection)Host$|SWITCH_(CLOUD|SITE)_MUTATION_KEY$|cloudsKeys$|globalCacheRefKey$)/;

const PORTS = ['appShell', 'checkout', 'diagnostics', 'files', 'links', 'media', 'signIn'] as const;

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

describe('@chatic/runtime-react public surface', () => {
    afterEach(() => host.resetForTests());

    it.each(Object.keys(GROUPS))('runtime.%s는 정확히 이 심볼들을 판다', group => {
        const members = api.runtime[group as keyof typeof api.runtime] as Record<string, unknown>;

        expect(Object.keys(members).sort()).toEqual([...GROUPS[group]].sort());
    });

    it('runtime holds these groups and ports and nothing else', () => {
        expect(Object.keys(api.runtime).sort()).toEqual([...Object.keys(GROUPS), ...PORTS].sort());
    });

    it('publishes runtime and the domain values at the top, and nothing else', () => {
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
        type SendImages = ReturnType<typeof api.runtime.data.useSendImages>['sendImages'];
        const options: api.runtime.data.SendImagesOptions = { separately: true, content: 'caption' };
        const taken: Parameters<SendImages>[1] = options;

        expect(taken).toEqual({ separately: true, content: 'caption' });
    });

    it('publishes the same top-level names as @chatic/runtime, with its own runtime', () => {
        expect(Object.keys(api).sort()).toEqual(Object.keys(headless).sort());
        for (const name of DOMAIN_VALUES)
            {expect(api[name as keyof typeof api]).toBe(headless[name as keyof typeof headless]);}
        expect(api.runtime).not.toBe(headless.runtime);
    });

    it.each(Object.keys(GROUPS))('runtime.%s is the headless group with the same values, plus hooks only', group => {
        const own = api.runtime[group as keyof typeof api.runtime] as Record<string, unknown>;
        const base = headless.runtime[group as keyof typeof headless.runtime] as Record<string, unknown>;

        for (const name of Object.keys(base)) expect(own[name]).toBe(base[name]);
        const added = Object.keys(own).filter(name => !(name in base));
        expect(added.filter(name => !REACT_ADDITION.test(name))).toEqual([]);
    });

    it.each(PORTS)('runtime.%s is the headless port', port => {
        host.publish({
            checkout: { kind: 'none' },
            media: browserMedia(),
            files: browserFiles(),
            links: browserLinks(),
            appShell: browserAppShell(),
            signIn: browserSignIn(),
            diagnostics: browserDiagnostics(),
            push: browserPush(),
        });

        expect(api.runtime[port]).toBe(headless.runtime[port]);
    });
});
