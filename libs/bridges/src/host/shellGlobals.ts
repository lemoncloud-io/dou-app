/**
 * The boot globals a shell sets before the page's own scripts run, as the web reads them: one entry
 * per name, the value exactly as first injected (`undefined` when the shell did not set it).
 *
 * Globals a shell writes again while the page runs — the log upload hold, the theme, the config bag,
 * the safe area — are not host facts and are not here at all. The phone also runs its boot script a
 * second time after load, which can rewrite the device ids and the version check; the profile keeps
 * the first values, and `apps/web`'s device store reads those live.
 */
export const SHELL_GLOBAL_NAMES = [
    'CHATIC_APP_PLATFORM',
    'CHATIC_APP_APPLICATION',
    'CHATIC_APP_STAGE',
    'CHATIC_APP_DEVICE_ID',
    'CHATIC_APP_DEVICE_MODEL',
    'CHATIC_APP_OS_VERSION',
    'CHATIC_APP_BUILD_NUMBER',
    'CHATIC_APP_CURRENT_VERSION',
    'CHATIC_APP_LATEST_VERSION',
    'CHATIC_APP_SHOULD_UPDATE',
    'CHATIC_APP_CURRENT_LANGUAGE',
    'CHATIC_APP_INSTALLATION_ID',
    'CHATIC_APP_UNIQUE_DEVICE_ID',
    'CHATIC_APP_FIREBASE_INSTALLATION_ID',
] as const;

export type ShellGlobalName = (typeof SHELL_GLOBAL_NAMES)[number];

/**
 * The boot globals by name, typed as the strings every shell injects. The profile keeps each value as
 * it came, so a reader sees what it saw before the profile existed.
 */
export type ShellGlobals = Readonly<Record<ShellGlobalName, string | undefined>>;

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_STAGE?: string;
        /** @deprecated Composite `deviceId:firebaseInstallId`; use CHATIC_APP_UNIQUE_DEVICE_ID + CHATIC_APP_FIREBASE_INSTALLATION_ID. */
        CHATIC_APP_DEVICE_ID?: string;
        CHATIC_APP_DEVICE_MODEL?: string;
        CHATIC_APP_OS_VERSION?: string;
        CHATIC_APP_BUILD_NUMBER?: string;
        CHATIC_APP_CURRENT_VERSION?: string;
        CHATIC_APP_LATEST_VERSION?: string;
        CHATIC_APP_SHOULD_UPDATE?: string;
        CHATIC_APP_CURRENT_LANGUAGE?: string;
        /** @deprecated Carries the bare device id despite the name; use CHATIC_APP_UNIQUE_DEVICE_ID. */
        CHATIC_APP_INSTALLATION_ID?: string;
        CHATIC_APP_UNIQUE_DEVICE_ID?: string;
        CHATIC_APP_FIREBASE_INSTALLATION_ID?: string;
        /** The capabilities this shell declares — see `capabilities.ts`. Read as untrusted. */
        CHATIC_APP_CAPABILITIES?: unknown;
        /** A shell's offer to own the session this launch. Read as untrusted by the runtime adapter. */
        CHATIC_APP_RUNTIME?: unknown;
    }
}

export const readShellGlobals = (source: Readonly<Record<string, unknown>> | undefined): ShellGlobals => {
    const globals = {} as Record<ShellGlobalName, string | undefined>;
    for (const name of SHELL_GLOBAL_NAMES) {
        globals[name] = source?.[name] as string | undefined;
    }
    return globals;
};
