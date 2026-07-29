import type { OnCheckAppUpdatePayload } from '@chatic/app-messages';

export type AppUpdatePlatform = OnCheckAppUpdatePayload['platform'];

export type AppUpdateCheckResult = OnCheckAppUpdatePayload;

export interface IVersionService {
    getCurrentVersion(): string;

    /** Resolves the live store version, or null when unavailable (Android has no public API yet, or the lookup failed). */
    getLatestVersion(platform: AppUpdatePlatform): Promise<string | null>;

    /** Compares the current version against the live store version. Safe-falls back to `updateAvailable: false`. */
    checkForUpdate(): Promise<AppUpdateCheckResult>;

    /** Opens the platform app store listing. */
    openStore(): Promise<void>;
}
