import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { bootMetricsService, bootSplashService } from '../../services';

/**
 * How long the crash-reload cover may stay without the web reporting its first screen. The reload
 * is a full boot of the web app, so this is the same order as the launch splash's own cap.
 */
export const RELOAD_COVER_CAP_MS = 5000;

/**
 * Hook that manages the theme-colored overlay (ResumeOverlay) laid over the WebView. Two causes put
 * it up, and either keeps it up:
 *
 * - **iOS resume** — prevents the white flash a WKWebView shows when it returns from the background.
 *   (No-op on Android, since that issue doesn't occur there.)
 * - **Crash reload** — the WebView's content process died and is reloading. There is no launch
 *   splash to cover that boot (it only exists at app start), so this covers it instead, until the
 *   reloaded page reports its first screen through the same signal that lifts the splash.
 */
export const useResumeOverlay = () => {
    const [isResumeCovered, setIsResumeCovered] = useState(false);
    const [isReloadCovered, setIsReloadCovered] = useState(false);
    const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const resumeStartedAtRef = useRef<number | null>(null);

    const dismissOverlay = useCallback(() => {
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        // Perf: how long the overlay actually covered the screen this resume.
        if (resumeStartedAtRef.current != null) {
            bootMetricsService.recordForegroundResume(Date.now() - resumeStartedAtRef.current);
            resumeStartedAtRef.current = null;
        }
        setIsResumeCovered(false);
    }, []);

    const dismissReloadCover = useCallback(() => {
        if (reloadTimeoutRef.current) {
            clearTimeout(reloadTimeoutRef.current);
            reloadTimeoutRef.current = null;
        }
        setIsReloadCovered(false);
    }, []);

    /** Covers the WebView while a crashed content process reloads; see the hook note. */
    const coverReload = useCallback(() => {
        if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        setIsReloadCovered(true);
        reloadTimeoutRef.current = setTimeout(dismissReloadCover, RELOAD_COVER_CAP_MS);
    }, [dismissReloadCover]);

    useEffect(() => bootSplashService.subscribe(() => dismissReloadCover()), [dismissReloadCover]);

    useEffect(() => {
        return () => {
            if (reloadTimeoutRef.current) clearTimeout(reloadTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'ios') {
            return;
        }

        const subscription = AppState.addEventListener('change', nextState => {
            if (nextState === 'background' || nextState === 'inactive') {
                if (resumeTimeoutRef.current) {
                    clearTimeout(resumeTimeoutRef.current);
                }
                setIsResumeCovered(true);
            } else if (nextState === 'active') {
                resumeStartedAtRef.current = Date.now();
                // Fallback: force-dismiss after at most 1.5s if the web app never sends a
                // DismissResumeOverlay signal (e.g. the web process stalls, etc.)
                if (resumeTimeoutRef.current) {
                    clearTimeout(resumeTimeoutRef.current);
                }
                resumeTimeoutRef.current = setTimeout(() => {
                    // Timed-out resumes are the interesting ones — record the cap.
                    if (resumeStartedAtRef.current != null) {
                        bootMetricsService.recordForegroundResume(Date.now() - resumeStartedAtRef.current);
                        resumeStartedAtRef.current = null;
                    }
                    setIsResumeCovered(false);
                }, 1500);
            }
        });

        return () => {
            subscription.remove();
            if (resumeTimeoutRef.current) {
                clearTimeout(resumeTimeoutRef.current);
            }
        };
    }, []);

    return {
        showResumeOverlay: isResumeCovered || isReloadCovered,
        dismissOverlay,
        coverReload,
    };
};
