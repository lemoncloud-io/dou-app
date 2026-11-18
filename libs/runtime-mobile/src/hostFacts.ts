import { Platform } from 'react-native';

/** The part of React Native's `Platform` the host facts read. */
export type PlatformSource = Pick<typeof Platform, 'OS'>;

/**
 * What React Native's process knows about the host it runs on, read once at boot. A plain frozen
 * object: nothing in it changes for the life of the process, so a reader never has to ask again.
 */
export interface NativeHostFacts {
    /** `Platform.OS` — the value the phone shell injects into its pages as `CHATIC_APP_PLATFORM`. */
    readonly platform: PlatformSource['OS'];
    /** The user agent the app reports for this device; see `NativeDeviceOptions`. */
    readonly userAgent: string;
}

/** What the app's boot already knows and hands the host facts. */
export interface NativeHostFactsOptions {
    /** The user agent the app resolved before the boot, because reading it is asynchronous. */
    userAgent: string;
}

/**
 * Reads the host facts of React Native's process: the OS from `Platform`, and what the app resolved
 * before the boot. A test passes its own `platform`.
 */
export const readNativeHostFacts = (
    { userAgent }: NativeHostFactsOptions,
    platform: PlatformSource = Platform
): NativeHostFacts => Object.freeze({ platform: platform.OS, userAgent });
