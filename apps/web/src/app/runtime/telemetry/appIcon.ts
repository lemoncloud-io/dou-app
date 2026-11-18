import { recordTelemetry } from '@chatic/bridges';

/**
 * The icon ids the app ships, spelled the way the app reports them. The primary icon is listed by
 * its stored name `DefaultIcon`, never by the `null` id the picker uses for it.
 *
 * Adding an icon to the app means adding its id here too. Until then a pick of it is still counted,
 * as `other`, so a new icon never makes the event disappear — it only stays unnamed.
 */
export const APP_ICON_IDS = ['DefaultIcon', 'WhiteIcon', 'MidnightIcon', 'AuroraIcon', 'SkyIcon'] as const;

/** Every value an app icon attribute may carry. A closed set, as the usage catalogue requires. */
export const APP_ICON_ATTR_VALUES: readonly string[] = [...APP_ICON_IDS, 'other'];

export type AppIconAttr = (typeof APP_ICON_IDS)[number] | 'other';

/**
 * The attribute value for an icon id. The primary icon goes by three names — `null` in the list,
 * `'default'` before the app has answered, `DefaultIcon` once it has — and all three are one value
 * here, or the same icon would be counted as two.
 */
export const toAppIconAttr = (id: string | null | undefined): AppIconAttr => {
    if (id === null || id === undefined || id === 'default') return 'DefaultIcon';
    return (APP_ICON_IDS as readonly string[]).includes(id) ? (id as AppIconAttr) : 'other';
};

/**
 * Records that the user switched the app icon. A re-pick of the icon already in use is not a
 * change — the app accepts it without doing anything — so it is not recorded.
 */
export const recordAppIconChange = (from: string | null | undefined, to: string | null | undefined): void => {
    const fromAttr = toAppIconAttr(from);
    const toAttr = toAppIconAttr(to);
    if (fromAttr === toAttr) return;
    recordTelemetry('event', 'app_icon_change', { attrs: { from: fromAttr, to: toAttr } });
};

/** What `FetchAppIcon` answers, as far as this module needs it. */
export interface AppIconStatus {
    iconName: string;
    supported: boolean;
}

/**
 * Records the icon this install has on its home screen, once. Users who never open the picker are
 * the majority, and the change event says nothing about them; this is what makes "how many users
 * have each icon" answerable.
 *
 * An app that cannot switch icons reports nothing — there was no choice to count. A failed lookup
 * records nothing either: a statistic must never become the caller's failure.
 */
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
    /** Subscribes to later usage sessions of this run; answers the unsubscribe. */
    onSessionStart: (listener: () => void) => () => void;
}

/**
 * Reports the icon in use for the session already running, then again for every later session of the
 * run. Once per run would undercount: a run can sit in the background for days, and a period with no
 * cold start would show its users as having no icon at all.
 */
export const startAppIconUsage = ({ fetchIcon, onSessionStart }: AppIconUsageOptions): (() => void) => {
    void reportAppIconInUse(fetchIcon);
    return onSessionStart(() => void reportAppIconInUse(fetchIcon));
};
