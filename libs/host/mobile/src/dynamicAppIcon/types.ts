export const DEFAULT_APP_ICON_NAME = 'DefaultIcon';

export interface AppIconOption {
    id: string | null;
    label: string;
}

export const AVAILABLE_ICONS: AppIconOption[] = [
    { id: null, label: 'Default' },
    { id: 'WhiteIcon', label: 'White' },
    { id: 'MidnightIcon', label: 'Midnight' },
    { id: 'AuroraIcon', label: 'Aurora' },
    { id: 'SkyIcon', label: 'Clear Sky' },
];

export interface IDynamicAppIconService {
    getAvailableIcons(): AppIconOption[];
    fetchCurrentIcon(): Promise<string>;
    setAppIcon(targetIconName?: string | null): Promise<boolean>;
}

export interface AppIconStore {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T): Promise<void>;
}

export interface AppIconSwitcher {
    changeIcon(targetName: string, activeIconName: string): Promise<void>;
}
