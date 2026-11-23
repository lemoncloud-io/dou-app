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

export type ShellGlobals = Readonly<Record<ShellGlobalName, string | undefined>>;

declare global {
    interface Window {
        CHATIC_APP_PLATFORM?: string;
        CHATIC_APP_APPLICATION?: string;
        CHATIC_APP_STAGE?: string;
        CHATIC_APP_DEVICE_ID?: string;
        CHATIC_APP_DEVICE_MODEL?: string;
        CHATIC_APP_OS_VERSION?: string;
        CHATIC_APP_BUILD_NUMBER?: string;
        CHATIC_APP_CURRENT_VERSION?: string;
        CHATIC_APP_LATEST_VERSION?: string;
        CHATIC_APP_SHOULD_UPDATE?: string;
        CHATIC_APP_CURRENT_LANGUAGE?: string;
        CHATIC_APP_INSTALLATION_ID?: string;
        CHATIC_APP_UNIQUE_DEVICE_ID?: string;
        CHATIC_APP_FIREBASE_INSTALLATION_ID?: string;
        CHATIC_APP_CAPABILITIES?: unknown;
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

export const liveShellGlobals = (): ShellGlobals =>
    readShellGlobals(typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>));

export const LIVE_SHELL_VALUE_NAMES = [
    'CHATIC_APP_CONFIG_BAG',
    'CHATIC_APP_DEBUG_MODE',
    'CHATIC_APP_LOG_UPLOAD_HOLD',
    'CHATIC_APP_RUN_ID',
] as const;

export type LiveShellValueName = (typeof LIVE_SHELL_VALUE_NAMES)[number];

export const liveShellValue = (name: LiveShellValueName): unknown =>
    typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>)[name];
