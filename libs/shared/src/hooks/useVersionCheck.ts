import { useCallback, useEffect, useRef, useState } from 'react';

declare const __APP_VERSION__: string;

const IS_PROD = import.meta.env.VITE_ENV === 'PROD';
const DEFAULT_INTERVAL = IS_PROD ? 5 * 60 * 1000 : 1 * 60 * 1000;
const MIN_CHECK_GAP = 10000;

export interface VersionInfo {
    version: string;
    buildTime?: string;
}

export interface VersionCheckConfig {
    interval?: number;
    enabled?: boolean;
    onNewVersionDetected?: (newVersion: string, currentVersion: string) => void;
}

export interface VersionCheckResult {
    hasUpdate: boolean;
    currentVersion: string;
    latestVersion: string | null;
    isChecking: boolean;
    lastChecked: Date | null;
    error: Error | null;
    checkNow: () => Promise<void>;
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

    useEffect(() => {
        onNewVersionDetectedRef.current = onNewVersionDetected;
    }, [onNewVersionDetected]);

    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

    const checkVersion = useCallback(async (): Promise<void> => {
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

            if (info.version !== currentVersion) {
                setHasUpdate(true);
                onNewVersionDetectedRef.current?.(info.version, currentVersion);
            }
        } catch (err) {
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

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        if (enabled) {
            checkVersion();
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
