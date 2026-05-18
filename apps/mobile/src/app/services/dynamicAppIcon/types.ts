export const DEFAULT_APP_ICON_NAME = 'DefaultIcon';

export interface AppIconOption {
    id: string | null;
    label: string;
}

export const AVAILABLE_ICONS: AppIconOption[] = [
    { id: null, label: 'Default' },
    { id: 'WhiteIcon', label: 'White' },
];

export interface IDynamicAppIconService {
    getAvailableIcons(): AppIconOption[];
    fetchCurrentIcon(): Promise<string>;
    setAppIcon(targetIconName?: string | null): Promise<boolean>;
}
