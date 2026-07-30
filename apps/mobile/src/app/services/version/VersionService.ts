import { Linking, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { getStoreUrl } from '@chatic/shared';

import type { ILogService } from '../log';
import type { AppUpdateCheckResult, AppUpdatePlatform, IVersionService } from './types';

const IOS_BUNDLE_ID = 'io.chatic.dou';
const APP_STORE_LOOKUP_URL = `https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE_ID}`;

interface AppStoreLookupResponse {
    resultCount: number;
    results: Array<{ version: string }>;
}

/** Parses a version string into numeric parts for comparison. */
export const parseVersion = (version: string): number[] => {
    return version
        .replace(/^v/, '')
        .split('.')
        .map(part => parseInt(part, 10) || 0);
};

/** Returns true when `latest` is a newer semantic version than `current`. */
export const isNewerVersion = (latest: string, current: string): boolean => {
    const latestParts = parseVersion(latest);
    const currentParts = parseVersion(current);
    const maxLength = Math.max(latestParts.length, currentParts.length);

    for (let i = 0; i < maxLength; i++) {
        const latestPart = latestParts[i] || 0;
        const currentPart = currentParts[i] || 0;

        if (latestPart > currentPart) return true;
        if (latestPart < currentPart) return false;
    }
    return false;
};

const resolvePlatform = (): AppUpdatePlatform => (Platform.OS === 'ios' ? 'ios' : 'android');

// This service is a process-lifetime singleton (see services/provider.ts), and a mobile app
// session can run for days without a full restart. A successful lookup is cached briefly to
// avoid re-hitting the App Store on rapid repeated checks (e.g. quick foreground toggling), but
// the TTL keeps it short enough that a long-lived session still notices a newly published
// version on a later foreground check. A failed or unavailable lookup (Android, network error)
// is intentionally NOT cached at all, so the very next call can retry immediately.
const CACHE_TTL_MS = 30 * 60 * 1000;

export class VersionService implements IVersionService {
    private cachedResult: AppUpdateCheckResult | null = null;
    private cachedAt = 0;

    constructor(private readonly logger: ILogService) {}

    getCurrentVersion(): string {
        return DeviceInfo.getVersion();
    }

    async getLatestVersion(platform: AppUpdatePlatform): Promise<string | null> {
        // Android has no public live-version API; a backend endpoint (Play Developer API) is pending.
        if (platform !== 'ios') {
            return null;
        }

        try {
            const response = await fetch(APP_STORE_LOOKUP_URL, {
                method: 'GET',
                headers: { 'Cache-Control': 'no-cache' },
            });
            if (!response.ok) return null;

            const data: AppStoreLookupResponse = await response.json();
            return data.results?.[0]?.version ?? null;
        } catch (error) {
            this.logger.warn('VERSION', 'Failed to fetch latest iOS version from the App Store', error);
            return null;
        }
    }

    async checkForUpdate(): Promise<AppUpdateCheckResult> {
        if (this.cachedResult && Date.now() - this.cachedAt < CACHE_TTL_MS) {
            return this.cachedResult;
        }

        const platform = resolvePlatform();
        const currentVersion = this.getCurrentVersion();
        const storeUrl = getStoreUrl(platform) ?? '';
        const latestVersion = await this.getLatestVersion(platform);

        if (!latestVersion) {
            return { platform, currentVersion, latestVersion: currentVersion, updateAvailable: false, storeUrl };
        }

        const result: AppUpdateCheckResult = {
            platform,
            currentVersion,
            latestVersion,
            updateAvailable: isNewerVersion(latestVersion, currentVersion),
            storeUrl,
        };
        this.cachedResult = result;
        this.cachedAt = Date.now();
        return result;
    }

    async openStore(): Promise<void> {
        const storeUrl = getStoreUrl(resolvePlatform());
        if (!storeUrl) return;

        try {
            await Linking.openURL(storeUrl);
        } catch (error) {
            this.logger.error('VERSION', 'Failed to open the store URL', error);
        }
    }
}
