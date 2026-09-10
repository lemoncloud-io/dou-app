import type { ComponentType } from 'react';

/**
 * Single catalog of every debug screen. Ids and behaviour live here; every human-readable label
 * lives in `../i18n.ts`, one table per language (the old mix of `Email Login` and `앱 아이콘` came
 * from labels being written wherever the screen happened to be registered). Replaces the old split between `debugMenu.ts` (the
 * expanded-sheet menu) and the hardcoded `TABS` array in `MiniPanel.tsx`, where the same screen
 * could be listed twice and "which screen may appear as a tab" lived only in a prose comment.
 *
 * React-free at runtime (the `ComponentType` import is type-only), so navigation and grouping stay
 * unit-testable without rendering.
 */

/**
 * Panel size, not a separate navigation tree — the same catalog is reachable at every size.
 *
 *  'mini'  a small floating widget: one screen, icon-only tabs, meant to sit in a corner while the
 *          app is used. The smallest thing that still shows a live number.
 *  'dock'  the default floating panel.
 *  'full'  the whole viewport, for wide content.
 */
export type DebugPanelSize = 'mini' | 'dock' | 'full';

/** Small to large. `expand`/`minimize` step through this. */
export const DEBUG_PANEL_SIZES: readonly DebugPanelSize[] = ['mini', 'dock', 'full'];

export type DebugSectionKey = 'info' | 'tools' | 'data';

/** Menu order. Monitoring-style screens first — they are what the panel is opened for most often. */
const SECTION_ORDER: readonly DebugSectionKey[] = ['info', 'tools', 'data'];

interface DebugScreenEntry {
    key: string;
    /** lucide-react icon name; resolved to a component in `screenIcons` so this stays pure data. */
    icon: string;
    section: DebugSectionKey;
    /**
     * Pinned to the dock's tab strip for one-tap switching while the app underneath is driven.
     * Inspection only: a screen that changes something belongs in the menu, not a stray tap away.
     */
    pinned?: boolean;
    /** Forces this size on open. Only for screens whose content cannot be read in the dock. */
    size?: DebugPanelSize;
    load: () => Promise<{ default: ComponentType }>;
}

export const DEBUG_SCREENS = [
    // Info — read-only observation.
    {
        key: 'State',
        icon: 'Activity',
        section: 'info',
        pinned: true,
        load: () => import('./screens/StateScreen').then(m => ({ default: m.StateScreen })),
    },
    {
        key: 'Boot',
        icon: 'Rocket',
        section: 'info',
        pinned: true,
        load: () => import('./screens/BootScreen').then(m => ({ default: m.BootScreen })),
    },
    {
        key: 'Perf',
        icon: 'Gauge',
        section: 'info',
        pinned: true,
        load: () => import('./screens/PerfScreen').then(m => ({ default: m.PerfScreen })),
    },
    {
        key: 'Unread',
        icon: 'Bell',
        section: 'info',
        pinned: true,
        load: () => import('./screens/UnreadScreen').then(m => ({ default: m.UnreadScreen })),
    },
    {
        // Two stores, one screen: the reconstructed history stack and the visited trail. They
        // disagree by design (`/a → /b → back → /c`), and the back-button questions need the stack.
        key: 'Route',
        icon: 'Route',
        section: 'info',
        pinned: true,
        load: () => import('./screens/RouteScreen').then(m => ({ default: m.RouteScreen })),
    },
    {
        key: 'DeviceInfo',
        icon: 'Smartphone',
        section: 'info',
        load: () => import('./screens/DeviceInfoScreen').then(m => ({ default: m.DeviceInfoScreen })),
    },
    {
        // ADR-0079 결정 16의 화면 절반 — 로깅 절반은 configStateLog가 이미 낸다.
        key: 'Config',
        icon: 'SlidersHorizontal',
        section: 'info',
        load: () => import('./screens/ConfigScreen').then(m => ({ default: m.ConfigScreen })),
    },
    {
        // 앱의 환경설정 화면에서 옮겨온 절반 (ADR-0080 결정 13 · 미결 4). PROD는 앱이 거부한다.
        key: 'CustomZip',
        icon: 'FileArchive',
        section: 'info',
        load: () => import('./screens/CustomZipScreen').then(m => ({ default: m.CustomZipScreen })),
    },
    {
        // Distinct from the Boot screen: that one measures the current web session live, this is the
        // native side's persisted per-boot history (ADR-0080 결정 11).
        key: 'BootRecords',
        icon: 'History',
        section: 'info',
        load: () => import('./screens/BootRecordsScreen').then(m => ({ default: m.BootRecordsScreen })),
    },

    // Tools — screens that drive something.
    {
        key: 'Bridge',
        icon: 'Plug',
        section: 'tools',
        load: () => import('./screens/BridgeScreen').then(m => ({ default: m.BridgeScreen })),
    },
    {
        // Logs are pinned for the same reason the DB browser is: what you want to read is what the
        // app writes *while you drive it*.
        key: 'LogBuffer',
        icon: 'ScrollText',
        section: 'tools',
        pinned: true,
        load: () => import('./screens/LogBufferScreen').then(m => ({ default: m.LogBufferScreen })),
    },
    {
        key: 'CacheMetrics',
        icon: 'BarChart3',
        section: 'tools',
        pinned: true,
        load: () => import('./screens/CacheMetricsScreen').then(m => ({ default: m.CacheMetricsScreen })),
    },
    {
        key: 'EmailLogin',
        icon: 'Mail',
        section: 'tools',
        load: () => import('./screens/EmailLoginScreen').then(m => ({ default: m.EmailLoginScreen })),
    },
    {
        // Tables plus its own scenario switcher — unreadable at dock width.
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
        icon: 'BellRing',
        section: 'tools',
        load: () => import('./screens/PushScreen').then(m => ({ default: m.PushScreen })),
    },
    // Moved off the app's 기능 테스트 section (ADR-0080 결정 11).
    {
        key: 'Sms',
        icon: 'MessageSquare',
        section: 'tools',
        load: () => import('./screens/SmsScreen').then(m => ({ default: m.SmsScreen })),
    },
    {
        key: 'OAuthNative',
        icon: 'KeyRound',
        section: 'tools',
        load: () => import('./screens/OAuthScreen').then(m => ({ default: m.OAuthScreen })),
    },
    {
        key: 'AppIcon',
        icon: 'Image',
        section: 'tools',
        load: () => import('./screens/AppIconScreen').then(m => ({ default: m.AppIconScreen })),
    },
    {
        key: 'Iap',
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
        // Distinct from the converter above: that one navigates the WEB, this hands the APP an
        // inbound deeplink (ADR-0080 결정 11).
        key: 'Deeplink',
        icon: 'ExternalLink',
        section: 'tools',
        load: () => import('./screens/DeeplinkScreen').then(m => ({ default: m.DeeplinkScreen })),
    },

    // Data — direct reads and edits of stored rows.
    {
        key: 'DBBrowser',
        icon: 'Database',
        section: 'data',
        pinned: true,
        load: () => import('./screens/DBBrowserScreen').then(m => ({ default: m.DBBrowserScreen })),
    },
    {
        key: 'ProfileEditor',
        icon: 'UserCog',
        section: 'data',
        load: () => import('./screens/ProfileEditorScreen').then(m => ({ default: m.ProfileEditorScreen })),
    },
] as const satisfies readonly DebugScreenEntry[];

export type DebugScreenKey = (typeof DEBUG_SCREENS)[number]['key'];

export type DebugScreenIcon = (typeof DEBUG_SCREENS)[number]['icon'];

export interface DebugMenuItem {
    key: DebugScreenKey;
    icon: DebugScreenIcon;
}

export interface DebugMenuSection {
    section: DebugSectionKey;
    items: DebugMenuItem[];
}

/** Home menu: every screen, grouped by section. */
export const DEBUG_MENU_SECTIONS: DebugMenuSection[] = SECTION_ORDER.map(section => ({
    section,
    items: DEBUG_SCREENS.filter(screen => screen.section === section).map(({ key, icon }) => ({ key, icon })),
})).filter(section => section.items.length > 0);

/** Dock tab strip, in manifest order. */
export const DEBUG_DOCK_TABS: DebugMenuItem[] = DEBUG_SCREENS.filter(screen => 'pinned' in screen && screen.pinned).map(
    ({ key, icon }) => ({ key, icon })
);

/** Screens that must open at a given size; everything else keeps the size the panel already has. */
export const DEBUG_SCREEN_SIZES = DEBUG_SCREENS.reduce(
    (acc, screen) => {
        if ('size' in screen) acc[screen.key] = screen.size;
        return acc;
    },
    {} as Partial<Record<DebugScreenKey, DebugPanelSize>>
);
