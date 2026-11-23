import type { ComponentType } from 'react';

export type DebugPanelSize = 'mini' | 'dock' | 'full';

export const DEBUG_PANEL_SIZES: readonly DebugPanelSize[] = ['mini', 'dock', 'full'];

export type DebugSectionKey = 'info' | 'tools' | 'data';

const SECTION_ORDER: readonly DebugSectionKey[] = ['info', 'tools', 'data'];

interface DebugScreenEntry {
    key: string;
    icon: string;
    section: DebugSectionKey;
    size?: DebugPanelSize;
    requiresShell?: true;
    load: () => Promise<{ default: ComponentType }>;
}

export const DEBUG_SCREENS = [
    {
        key: 'State',
        icon: 'Activity',
        section: 'info',
        load: () => import('./screens/StateScreen').then(m => ({ default: m.StateScreen })),
    },
    {
        key: 'Boot',
        icon: 'Rocket',
        section: 'info',
        load: () => import('./screens/BootScreen').then(m => ({ default: m.BootScreen })),
    },
    {
        key: 'Perf',
        icon: 'Gauge',
        section: 'info',
        load: () => import('./screens/PerfScreen').then(m => ({ default: m.PerfScreen })),
    },
    {
        key: 'Unread',
        icon: 'Bell',
        section: 'info',
        load: () => import('./screens/UnreadScreen').then(m => ({ default: m.UnreadScreen })),
    },
    {
        key: 'Route',
        icon: 'Route',
        section: 'info',
        load: () => import('./screens/RouteScreen').then(m => ({ default: m.RouteScreen })),
    },
    {
        key: 'DeviceInfo',
        requiresShell: true,
        icon: 'Smartphone',
        section: 'info',
        load: () => import('./screens/DeviceInfoScreen').then(m => ({ default: m.DeviceInfoScreen })),
    },
    {
        key: 'Config',
        icon: 'SlidersHorizontal',
        section: 'info',
        load: () => import('./screens/ConfigScreen').then(m => ({ default: m.ConfigScreen })),
    },
    {
        key: 'CustomZip',
        requiresShell: true,
        icon: 'FileArchive',
        section: 'tools',
        load: () => import('./screens/CustomZipScreen').then(m => ({ default: m.CustomZipScreen })),
    },
    {
        key: 'SessionOwner',
        requiresShell: true,
        icon: 'ArrowLeftRight',
        section: 'tools',
        load: () => import('./screens/SessionOwnerScreen').then(m => ({ default: m.SessionOwnerScreen })),
    },
    {
        key: 'BootRecords',
        requiresShell: true,
        icon: 'History',
        section: 'info',
        load: () => import('./screens/BootRecordsScreen').then(m => ({ default: m.BootRecordsScreen })),
    },

    {
        key: 'Bridge',
        icon: 'Plug',
        section: 'tools',
        load: () => import('./screens/BridgeScreen').then(m => ({ default: m.BridgeScreen })),
    },
    {
        key: 'LogBuffer',
        icon: 'ScrollText',
        section: 'tools',
        load: () => import('./screens/LogBufferScreen').then(m => ({ default: m.LogBufferScreen })),
    },
    {
        key: 'CacheMetrics',
        icon: 'BarChart3',
        section: 'tools',
        load: () => import('./screens/CacheMetricsScreen').then(m => ({ default: m.CacheMetricsScreen })),
    },
    {
        key: 'EmailLogin',
        icon: 'Mail',
        section: 'tools',
        load: () => import('./screens/EmailLoginScreen').then(m => ({ default: m.EmailLoginScreen })),
    },
    {
        key: 'CacheTest',
        icon: 'FlaskConical',
        section: 'tools',
        size: 'full',
        load: () => import('./screens/CacheTestScreen').then(m => ({ default: m.CacheTestScreen })),
    },
    {
        key: 'UploadTest',
        icon: 'UploadCloud',
        section: 'tools',
        size: 'full',
        load: () => import('./screens/UploadTestScreen').then(m => ({ default: m.UploadTestScreen })),
    },
    {
        key: 'Push',
        requiresShell: true,
        icon: 'BellRing',
        section: 'tools',
        load: () => import('./screens/PushScreen').then(m => ({ default: m.PushScreen })),
    },
    {
        key: 'Sms',
        requiresShell: true,
        icon: 'MessageSquare',
        section: 'tools',
        load: () => import('./screens/SmsScreen').then(m => ({ default: m.SmsScreen })),
    },
    {
        key: 'OAuthNative',
        requiresShell: true,
        icon: 'KeyRound',
        section: 'tools',
        load: () => import('./screens/OAuthScreen').then(m => ({ default: m.OAuthScreen })),
    },
    {
        key: 'Iap',
        requiresShell: true,
        icon: 'CreditCard',
        section: 'tools',
        load: () => import('./screens/IapScreen').then(m => ({ default: m.IapScreen })),
    },
    {
        key: 'InviteRedirect',
        icon: 'Link2',
        section: 'tools',
        load: () => import('./screens/InviteRedirectScreen').then(m => ({ default: m.InviteRedirectScreen })),
    },
    {
        key: 'Deeplink',
        requiresShell: true,
        icon: 'ExternalLink',
        section: 'tools',
        load: () => import('./screens/DeeplinkScreen').then(m => ({ default: m.DeeplinkScreen })),
    },
    {
        key: 'SubWebView',
        requiresShell: true,
        icon: 'AppWindow',
        section: 'tools',
        load: () => import('./screens/SubWebViewScreen').then(m => ({ default: m.SubWebViewScreen })),
    },

    {
        key: 'Room',
        icon: 'MessageSquareCode',
        section: 'data',
        load: () => import('./screens/RoomScreen').then(m => ({ default: m.RoomScreen })),
    },
    {
        key: 'DBBrowser',
        icon: 'Database',
        section: 'data',
        load: () => import('./screens/DBBrowserScreen').then(m => ({ default: m.DBBrowserScreen })),
    },
    {
        key: 'Storage',
        icon: 'HardDrive',
        section: 'data',
        load: () => import('./screens/StorageScreen').then(m => ({ default: m.StorageScreen })),
    },
] as const satisfies readonly DebugScreenEntry[];

export type DebugScreenKey = (typeof DEBUG_SCREENS)[number]['key'];

export type DebugScreenIcon = (typeof DEBUG_SCREENS)[number]['icon'];

export interface DebugMenuItem {
    key: DebugScreenKey;
    icon: DebugScreenIcon;
    requiresShell: boolean;
}

export interface DebugMenuSection {
    section: DebugSectionKey;
    items: DebugMenuItem[];
}

export const DEBUG_MENU_SECTIONS: DebugMenuSection[] = SECTION_ORDER.map(section => ({
    section,
    items: DEBUG_SCREENS.filter(screen => screen.section === section).map(screen => ({
        key: screen.key,
        icon: screen.icon,
        requiresShell: 'requiresShell' in screen,
    })),
})).filter(section => section.items.length > 0);

export const DEBUG_TABS: DebugMenuItem[] = DEBUG_MENU_SECTIONS.flatMap(section => section.items);

export const DEBUG_SCREEN_SIZES = DEBUG_SCREENS.reduce(
    (acc, screen) => {
        if ('size' in screen) acc[screen.key] = screen.size;
        return acc;
    },
    {} as Partial<Record<DebugScreenKey, DebugPanelSize>>
);
