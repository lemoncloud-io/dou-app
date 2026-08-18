// Web counterpart of the mobile debug menu model (apps/mobile .../debug/debugMenu.ts).
// Pure data so navigation and rendering can be unit-tested without React.

export type DebugScreenKey =
    | 'EmailLogin'
    | 'LogBuffer'
    | 'CacheTest'
    | 'CacheMetrics'
    | 'UploadTest'
    | 'Push'
    | 'InviteRedirect'
    | 'DBBrowser'
    | 'ProfileEditor'
    | 'DeviceInfo'
    | 'Subscription';

export interface DebugMenuItem {
    key: DebugScreenKey;
    title: string;
}

export interface DebugMenuSection {
    title: string;
    items: DebugMenuItem[];
}

export const DEBUG_MENU_SECTIONS: DebugMenuSection[] = [
    {
        title: 'Tools',
        items: [
            { key: 'EmailLogin', title: 'Email Login' },
            { key: 'LogBuffer', title: 'Log Buffer' },
            { key: 'CacheTest', title: 'Cache DB Test' },
            { key: 'CacheMetrics', title: 'Cache Metrics' },
            { key: 'UploadTest', title: 'Chunk Upload Test' },
            { key: 'Push', title: 'Push (Token & Receive)' },
            { key: 'InviteRedirect', title: 'Invite Link Converter' },
            { key: 'Subscription', title: 'Subscription (State & Quota)' },
        ],
    },
    {
        title: 'Data',
        items: [
            { key: 'DBBrowser', title: 'DB Browser' },
            { key: 'ProfileEditor', title: 'My Profile Editor' },
        ],
    },
    {
        title: 'Info',
        items: [{ key: 'DeviceInfo', title: 'Device Info' }],
    },
];

export const DEBUG_SCREEN_TITLES = DEBUG_MENU_SECTIONS.flatMap(section => section.items).reduce(
    (acc, item) => {
        acc[item.key] = item.title;
        return acc;
    },
    {} as Record<DebugScreenKey, string>
);
