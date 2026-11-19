import type { DataCalls, DataPermission, DataStreams } from '@chatic/chatic-apps-sdk';

/** A permission a page's manifest can ask for, as the app reads it. */
export type ManifestPermission = 'clipboard' | 'share' | 'openUrl' | 'userKey' | DataPermission;

export const MANIFEST_PERMISSIONS: readonly ManifestPermission[] = [
    'clipboard',
    'share',
    'openUrl',
    'userKey',
    'session',
    'cloud',
    'place',
    'channel',
    'chat',
    'user',
    'chatSend',
];

export const DISPLAYS = ['clean', 'titled', 'immersive'] as const;
export const ORIENTATIONS = ['any', 'portrait', 'landscape'] as const;
export const MANIFEST_FIELDS = ['manifestVersion', 'name', 'permissions', 'display', 'orientation'] as const;
export const NAME_LIMIT = 100;

/**
 * Each cloud data method the library types, with the permission that opens it. Keyed by exactly the
 * library's methods — a method the library adds or drops fails to compile here — so the checker knows
 * what the library knows.
 */
export const DATA_METHODS = {
    'channel.cacheRead': 'channel',
    'channel.cacheReadList': 'channel',
    'channel.fetchList': 'channel',
    'join.cacheReadList': 'channel',
    'chat.cacheRead': 'chat',
    'chat.cacheReadList': 'chat',
    'chat.listPendingImageChats': 'chat',
    'chat.sendChat': 'chatSend',
    'cloud.cacheRead': 'cloud',
    'cloud.getCloud': 'cloud',
    'place.cacheReadList': 'place',
    'place.isPlaceDeleted': 'place',
    'user.cacheReadList': 'user',
    'user.listPlaceMembers': 'user',
    'profile.cacheRead': 'user',
    'profile.cacheReadList': 'user',
    'channel.observeList': 'channel',
    'channel.observeItem': 'channel',
    'join.observeList': 'channel',
    'chat.observeList': 'chat',
    'chat.observeLastList': 'chat',
    'chat.observeFeedCoverage': 'chat',
    'cloud.observeItem': 'cloud',
    'place.observeList': 'place',
    'place.observeItem': 'place',
    'user.observeList': 'user',
    'profile.observeList': 'user',
    'profile.observeItem': 'user',
} as const satisfies { [N in keyof DataCalls]: DataCalls[N]['permission'] } & {
    [N in keyof DataStreams]: DataStreams[N]['permission'];
};

/**
 * The calls that need a permission, as they read in a page's code, and what each needs. Looked for only
 * in a file that names the SDK (an import of it, or of its types), so a `vector.copy(…)` elsewhere is
 * not taken for the clipboard. A typed data method is found by its name in quotes, in any file.
 */
export const CALL_PATTERNS: ReadonlyArray<{ pattern: RegExp; permissions: ManifestPermission[]; call: string }> = [
    { pattern: /\.copy\s*\(/, permissions: ['clipboard'], call: 'copy()' },
    { pattern: /(?<!navigator)\.share\s*\(/, permissions: ['share'], call: 'share()' },
    { pattern: /\.openUrl\s*\(/, permissions: ['openUrl'], call: 'openUrl()' },
    { pattern: /\.getUserKey\s*\(/, permissions: ['userKey'], call: 'getUserKey()' },
    { pattern: /\.sendMessage\s*\(/, permissions: ['chatSend'], call: 'data.sendMessage()' },
    { pattern: /\.session\s*\(\s*\)|\.onSessionChange\s*\(/, permissions: ['session'], call: 'data.session()' },
    {
        pattern: /\.(placeProfiles?|observePlaceProfile|myProfile|observeMyProfile)\s*\(/,
        permissions: ['session', 'user'],
        call: 'a place profile helper',
    },
];

/** A quoted `<repository>.<method>` name of the kind the app's data methods have. */
export const DATA_METHOD_NAME =
    /['"`]((?:channel|join|chat|cloud|place|user|profile)\.(?:cache|fetch|observe|get|list|send|is)[A-Za-z]*)['"`]/g;
