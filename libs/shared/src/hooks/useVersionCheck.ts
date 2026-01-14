import { useCallback, useEffect, useRef, useState } from 'react';

export interface VersionInfo {
    version: string;
    buildTime: string;
}

export interface UseVersionCheckOptions {
    checkInterval?: number;
    autoCheck?: boolean;
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

const DEFAULT_CHECK_INTERVAL_PROD = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CHECK_INTERVAL_DEV = 1 * 60 * 1000; // 1 minute
const MIN_CHECK_GAP = 10 * 1000; // 10 seconds minimum between checks

const getDefaultInterval = (): number => {
    const env = window.ENV || import.meta.env.VITE_ENV || 'LOCAL';
    return env === 'PROD' ? DEFAULT_CHECK_INTERVAL_PROD : DEFAULT_CHECK_INTERVAL_DEV;
};

const fetchVersionInfo = async (): Promise<VersionInfo> => {
    const response = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
            'Cache-Control': 'no-cache',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch version info: ${response.status}`);
    }

    return response.json();
};

export const useVersionCheck = (options: UseVersionCheckOptions = {}): VersionCheckResult => {
    const { checkInterval = getDefaultInterval(), autoCheck = true, onNewVersionDetected } = options;

    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

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

    const checkVersion = useCallback(async (): Promise<void> => {
        const now = Date.now();
        if (isCheckingRef.current || now - lastCheckTime.current < MIN_CHECK_GAP) {
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
            const error = err instanceof Error ? err : new Error('Unknown error');
            setError(error);
            console.warn('[VersionCheck] Failed to check version:', error.message);
        } finally {
            isCheckingRef.current = false;
            setIsChecking(false);
        }
    }, [currentVersion]);

    const dismissUpdate = useCallback((): void => {
        setIsDismissed(true);
    }, []);

    useEffect(() => {
        if (!autoCheck) {
            return;
        }

        checkVersion();

        intervalRef.current = setInterval(checkVersion, checkInterval);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [autoCheck, checkInterval, checkVersion]);

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
