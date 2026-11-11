import { isAppVersionAtLeast } from '@chatic/bridges';

/**
 * The oldest phone app this web still runs in. A shell below it is shown the update screen and
 * nothing else.
 *
 * The web is deployed independently of the app, so without a floor it has to keep a fallback for
 * every shell ever shipped, with no way to know when one is gone. The floor is that way: raising it
 * is what lets the fallbacks for the shells below it be deleted. It is the app's marketing version,
 * not the bridge version, because that is what the stores sell and what the shell injects.
 *
 * 0.30.0 carries bridge 2.9.0: the handshake that lists the shell's handlers, the photo library with
 * videos and paging, the attachment picker, haptics, saving and sharing files, and the share intake.
 */
export const APP_VERSION_FLOOR = '0.30.0';

export interface ShellVersion {
    /** `CHATIC_APP_PLATFORM` — `ios`, `android`, `desktop`, or absent in a browser. */
    platform: string | undefined;
    /** `CHATIC_APP_CURRENT_VERSION` — the installed app's marketing version. */
    version: string | undefined;
}

const PLAIN_VERSION = /^\d+(\.\d+){0,2}$/;

/**
 * Whether this phone app is older than the floor.
 *
 * Only the phone apps are held to it: the desktop shell updates itself, and a browser has no app.
 * A shell that reports no version, or one that does not parse, is let through — every shipped shell
 * has injected its version, so an unreadable one is a defect to fix, not an old app to lock out.
 */
export const isBelowAppVersionFloor = ({ platform, version }: ShellVersion, floor = APP_VERSION_FLOOR): boolean => {
    if (platform !== 'ios' && platform !== 'android') return false;
    if (!version || !PLAIN_VERSION.test(version)) return false;
    return !isAppVersionAtLeast(version, floor);
};

/** The injected globals. The shell writes them before the page's own scripts run. */
export const readShellVersion = (): ShellVersion => ({
    platform: typeof window === 'undefined' ? undefined : window.CHATIC_APP_PLATFORM,
    version: typeof window === 'undefined' ? undefined : window.CHATIC_APP_CURRENT_VERSION,
});
