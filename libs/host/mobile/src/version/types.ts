import type { OnCheckAppUpdatePayload } from '@chatic/bridge-messages';

export type AppUpdatePlatform = OnCheckAppUpdatePayload['platform'];

export type AppUpdateCheckResult = OnCheckAppUpdatePayload;

export interface IVersionService {
    getCurrentVersion(): string;

    getLatestVersion(platform: AppUpdatePlatform): Promise<string | null>;

    checkForUpdate(): Promise<AppUpdateCheckResult>;

    openStore(): Promise<void>;
}
