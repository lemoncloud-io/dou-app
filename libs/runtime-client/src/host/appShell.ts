import type { AppIconOption, HapticKind, OnUpdateStatusPayload, PreferenceKey } from '@chatic/bridge-messages';

import type { HostOs, ShellOrBrowser } from './ports';

export interface AppShellPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
    readonly ownsWindow: boolean;
    readonly reportsKeyboardHeight: boolean;
    readonly haptics: AppShellHaptics | null;
    readonly preferences: ShellPreferenceStore | null;
    readonly backGesture: ShellBackGesture | null;
    readonly iconBadge: ReadableIconBadge | null;
    readonly dockBadge: PaintableDockBadge | null;
    readonly appIcon: AlternateAppIcon | null;
    readonly storeUpdate: StoreUpdate | null;
    readonly selfUpdate: SelfUpdate | null;
    readonly systemSettings: SystemSettingsPage | null;
}

export interface AppShellHaptics {
    play(kind: HapticKind): void;
}

export interface ShellPreferenceStore {
    save(key: PreferenceKey, value: unknown): Promise<void>;
    read(key: PreferenceKey): Promise<unknown>;
}

export interface ShellBackGesture {
    setCanGoBack(canGoBack: boolean): void;
}

export interface ReadableIconBadge {
    read(): Promise<number | null>;
}

export interface PaintableDockBadge {
    set(count: number, overlayIconDataUrl?: string): Promise<unknown>;
}

export interface AlternateAppIcon {
    current(): Promise<{ iconName: string; supported: boolean } | null>;
    options(): Promise<AppIconOption[] | null>;
    change(iconName: string | null): Promise<{ iconName: string | undefined } | null>;
}

export interface StoreUpdate {
    check(): Promise<{ updateAvailable: boolean; latestVersion: string }>;
    openStore(): void;
}

export interface SystemSettingsPage {
    open(): void;
}

export interface SelfUpdate {
    onStatus(listener: (status: OnUpdateStatusPayload) => void): () => void;
    startDownload(): void;
    restart(): void;
}
