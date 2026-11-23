import { recordTelemetry } from '@chatic/bridges';

export const APP_ICON_IDS = ['DefaultIcon', 'WhiteIcon', 'MidnightIcon', 'AuroraIcon', 'SkyIcon'] as const;

export const APP_ICON_ATTR_VALUES: readonly string[] = [...APP_ICON_IDS, 'other'];

export type AppIconAttr = (typeof APP_ICON_IDS)[number] | 'other';

export const toAppIconAttr = (id: string | null | undefined): AppIconAttr => {
    if (id === null || id === undefined || id === 'default') return 'DefaultIcon';
    return (APP_ICON_IDS as readonly string[]).includes(id) ? (id as AppIconAttr) : 'other';
};

export const recordAppIconChange = (from: string | null | undefined, to: string | null | undefined): void => {
    const fromAttr = toAppIconAttr(from);
    const toAttr = toAppIconAttr(to);
    if (fromAttr === toAttr) return;
    recordTelemetry('event', 'app_icon_change', { attrs: { from: fromAttr, to: toAttr } });
};

export interface AppIconStatus {
    iconName: string;
    supported: boolean;
}

export const reportAppIconInUse = async (fetchIcon: () => Promise<AppIconStatus | undefined>): Promise<void> => {
    try {
        const status = await fetchIcon();
        if (!status?.supported) return;
        recordTelemetry('event', 'app_icon_in_use', { attrs: { icon: toAppIconAttr(status.iconName) } });
    } catch {
        /* the statistic is lost, nothing else is */
    }
};

export interface AppIconUsageOptions {
    fetchIcon: () => Promise<AppIconStatus | undefined>;
    onSessionStart: (listener: () => void) => () => void;
}

export const startAppIconUsage = ({ fetchIcon, onSessionStart }: AppIconUsageOptions): (() => void) => {
    void reportAppIconInUse(fetchIcon);
    return onSessionStart(() => void reportAppIconInUse(fetchIcon));
};
