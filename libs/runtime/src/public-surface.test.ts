import { host } from './api';

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
        'inviteFlowMutation',
        'inviteInfoQuery',
        'isInOwnCloudSession',
        'isPairedSession',
        'isRefusedForEndedPairing',
        'isSessionKey',
        'loginMutation',
        'loginRelayGuestByDeviceMutation',
        'loginRelaySocialMutation',
        'logoutCloudSessionMutation',
        'logoutSession',
        'pairingClientOf',
        'patchRelaySessionUser',
        'registerSessionLogoutCallback',
        'registerUserWithInviteCode',
        'retryPhoneLogin',
        'siteSwitchMutation',
        'switchCloudSessionMutation',
        'traceCloudSwitch',
        'updateAccountProfile',
    ],
    connection: [
        'RELAY_SLOT',
        'getRuntimeSocketState',
        'getSlotStatuses',
        'observeSocketRequests',
        'onServerEvent',
        'onServerMessage',
        'reconnectSocket',
        'recoverSocketsOnResume',
        'recoverUnverifiedSockets',
        'waitUntilVerified',
    ],
    data: [
        'clearLocalCaches',
        'cloudsKeys',
        'createChatOutbox',
        'getAcceptorId',
        'getCacheMetricsSource',
        'getCloudRepositories',
        'isAcceptedBy',
        'recoverInvitedCloudIfMissing',
        'requestSyncCursorReset',
        'sendChatInCloud',
        'setStateOutboxObserver',
        'syncInvitedCloudName',
        'syncPairedCloudName',
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
    ],
    push: ['deviceToken', 'kind', 'localBanner', 'notifications', 'tokenRenewal'],
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
    ],
};

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

describe('@chatic/runtime public surface (headless)', () => {
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

    it('holds no hook and no component', () => {
        const reactNames = Object.keys(GROUPS)
            .flatMap(group => Object.keys(api.runtime[group as keyof typeof api.runtime] as object))
            .filter(name => /^use[A-Z]/.test(name) || /Host$/.test(name));

        expect(reactNames).toEqual([]);
    });
});
