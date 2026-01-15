import { useCallback, useEffect, useRef, useState } from 'react';

declare const __APP_VERSION__: string;

const IS_PROD = import.meta.env.VITE_ENV === 'PROD';
const DEFAULT_INTERVAL = IS_PROD ? 5 * 60 * 1000 : 1 * 60 * 1000; // prod: 5분, dev: 1분
const MIN_CHECK_GAP = 10000; // 10초

export interface VersionInfo {
    version: string;
    buildTime?: string;
}

export interface VersionCheckConfig {
    /** Polling interval in milliseconds. Default: 5 minutes (prod) / 1 minute (dev) */
    interval?: number;
    /** Whether to enable version checking. Default: true */
    enabled?: boolean;
    /** Callback when new version is detected */
    onNewVersionDetected?: (newVersion: string, currentVersion: string) => void;
}

export interface VersionCheckResult {
    /** Whether a new version is available */
    hasUpdate: boolean;
    /** Current app version (from build) */
    currentVersion: string;
    /** Latest version from server (if fetched) */
    latestVersion: string | null;
    /** Whether the check is currently in progress */
    isChecking: boolean;
    /** Last check timestamp */
    lastChecked: Date | null;
    /** Error from last check (if any) */
    error: Error | null;
    /** Manually trigger version check */
    checkNow: () => Promise<void>;
    /** Dismiss the update notification */
    dismissUpdate: () => void;
}

const fetchVersionInfo = async (): Promise<VersionInfo> => {
    const response = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch version: ${response.status}`);
    }

    return response.json();
};

export const useVersionCheck = (config?: VersionCheckConfig): VersionCheckResult => {
    const { interval = DEFAULT_INTERVAL, enabled = true, onNewVersionDetected } = config ?? {};

    const [hasUpdate, setHasUpdate] = useState(false);
    const [latestVersion, setLatestVersion] = useState<string | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const isCheckingRef = useRef(false);
    const lastCheckTime = useRef(0);
    const onNewVersionDetectedRef = useRef(onNewVersionDetected);

    // Keep callback ref updated
    useEffect(() => {
        onNewVersionDetectedRef.current = onNewVersionDetected;
    }, [onNewVersionDetected]);

    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

    const checkVersion = useCallback(async (): Promise<void> => {
        // Prevent concurrent checks
        const now = Date.now();
        const isDuplicated = now - lastCheckTime.current < MIN_CHECK_GAP || isCheckingRef.current;
        if (isDuplicated) {
            return;
        }

        isCheckingRef.current = true;
        lastCheckTime.current = now;
        setIsChecking(true);
        setError(null);

        try {
            const info = await fetchVersionInfo();
            setLatestVersion(info.version);
            setLastChecked(new Date());

            // Compare versions
            if (info.version !== currentVersion) {
                setHasUpdate(true);
                onNewVersionDetectedRef.current?.(info.version, currentVersion);
            }
        } catch (err) {
            // Graceful degradation: log error but don't block app
            const errorObj = err instanceof Error ? err : new Error('Version check failed');
            setError(errorObj);
            console.warn('[VersionCheck] Failed to check version:', errorObj.message);
        } finally {
            isCheckingRef.current = false;
            setIsChecking(false);
        }
    }, [currentVersion]);

    const startInterval = useCallback(() => {
        if (intervalRef.current) {
            return;
        }

        console.log(`[VersionCheck] Starting version check interval: ${interval}ms (current: ${currentVersion})`);
        intervalRef.current = setInterval(checkVersion, interval);
    }, [checkVersion, interval, currentVersion]);

    const stopInterval = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const dismissUpdate = useCallback(() => {
        setIsDismissed(true);
        setHasUpdate(false);
    }, []);

    // Effect: Start/stop polling based on enabled flag
    useEffect(() => {
        // Only run in browser
        if (typeof window === 'undefined') {
            return;
        }

        if (enabled) {
            // Initial check
            checkVersion();
            // Start polling
            startInterval();
        } else {
            stopInterval();
        }

        return stopInterval;
    }, [enabled, checkVersion, startInterval, stopInterval]);

    return {
        hasUpdate: hasUpdate && !isDismissed,
        currentVersion,
        latestVersion,
        isChecking,
        lastChecked,
        error,
        checkNow: checkVersion,
        dismissUpdate,
    };
};
