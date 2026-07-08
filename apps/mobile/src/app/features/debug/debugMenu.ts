export type DebugOverlayScreenKey =
    | 'EnvironmentSettings'
    | 'Monitoring'
    | 'BootPerformance'
    | 'SocketTest'
    | 'InAppPurchaseTest'
    | 'NotificationTest'
    | 'DeeplinkTest'
    | 'DeviceTest'
    | 'AppIconTest'
    | 'BridgeTest'
    | 'OAuthTest'
    | 'StorageTest'
    | 'SmsTest'
    | 'UploadTest';

export type DebugOverlayEntryKey = 'FeatureTests' | 'EnvironmentSettings' | 'Monitoring' | 'BootPerformance';

export interface DebugMenuItem {
    key: DebugOverlayScreenKey;
    title: string;
}

export interface DebugMenuSection {
    title: string;
    items: DebugMenuItem[];
}

export const DEBUG_MENU_SECTIONS: DebugMenuSection[] = [
    {
        title: '기능 테스트',
        items: [
            { key: 'SocketTest', title: '소켓 테스트' },
            { key: 'InAppPurchaseTest', title: '인앱결제 테스트' },
            { key: 'NotificationTest', title: '알림 테스트' },
            { key: 'DeeplinkTest', title: '딥링크 테스트' },
            { key: 'DeviceTest', title: '디바이스 기능 테스트' },
            { key: 'SmsTest', title: 'SMS 테스트' },
            { key: 'AppIconTest', title: '앱 아이콘 테스트' },
            { key: 'BridgeTest', title: '브릿지 테스트' },
            { key: 'UploadTest', title: '대용량 업로드 테스트' },
            { key: 'OAuthTest', title: 'OAuth 테스트' },
            { key: 'StorageTest', title: '스토리지 테스트' },
        ],
    },
    {
        title: '환경설정',
        items: [{ key: 'EnvironmentSettings', title: '환경설정' }],
    },
    {
        title: '모니터링',
        items: [
            { key: 'Monitoring', title: '모니터링' },
            { key: 'BootPerformance', title: '부팅 성능 기록' },
        ],
    },
];

export const FEATURE_TEST_MENU_SECTION = DEBUG_MENU_SECTIONS[0];

export const DEBUG_ENTRY_TITLES: Record<DebugOverlayEntryKey, string> = {
    FeatureTests: '기능 테스트',
    EnvironmentSettings: '환경설정',
    Monitoring: '모니터링',
    BootPerformance: '부팅 성능 기록',
};

export const DEBUG_SCREEN_TITLES = DEBUG_MENU_SECTIONS.flatMap(section => section.items).reduce(
    (acc, item) => {
        acc[item.key] = item.title;
        return acc;
    },
    {} as Record<DebugOverlayScreenKey, string>
);
