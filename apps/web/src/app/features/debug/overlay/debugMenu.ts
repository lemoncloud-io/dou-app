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
    | 'BootRecords'
    | 'Deeplink'
    | 'AppIcon'
    | 'Sms'
    | 'OAuthNative'
    | 'Iap'
    | 'Config'
    | 'CustomZip';

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
            // Moved off the app's 기능 테스트 section (ADR-0080 결정 11).
            { key: 'Sms', title: 'SMS' },
            { key: 'OAuthNative', title: 'OAuth (네이티브)' },
            { key: 'AppIcon', title: '앱 아이콘' },
            { key: 'Iap', title: '인앱결제' },
            { key: 'InviteRedirect', title: 'Invite Link Converter' },
            // Distinct from the converter above: that one navigates the WEB, this hands the APP an
            // inbound deeplink (ADR-0080 결정 11).
            { key: 'Deeplink', title: '딥링크 보내기 (앱)' },
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
        items: [
            { key: 'DeviceInfo', title: 'Device Info' },
            // ADR-0079 결정 16의 화면 절반 — 로깅 절반은 configStateLog가 이미 낸다.
            { key: 'Config', title: '지금 설정' },
            // 앱의 환경설정 화면에서 옮겨온 절반 (ADR-0080 결정 13 · 미결 4). PROD는 앱이 거부한다.
            { key: 'CustomZip', title: '커스텀 web zip' },
            // Distinct from the Boot tab: that one measures the current web session live, this is
            // the native side's persisted per-boot history (ADR-0080 결정 11).
            { key: 'BootRecords', title: '부팅 기록 (앱)' },
        ],
    },
];

export const DEBUG_SCREEN_TITLES = DEBUG_MENU_SECTIONS.flatMap(section => section.items).reduce(
    (acc, item) => {
        acc[item.key] = item.title;
        return acc;
    },
    {} as Record<DebugScreenKey, string>
);
