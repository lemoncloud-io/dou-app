import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { bootMetricsService } from '../../services';

/**
 * Hook that manages the show/dismiss lifecycle of the theme-colored overlay (ResumeOverlay) used
 * to prevent a white flash when an iOS WKWebView resumes from the background.
 * (No-op on Android, since that issue doesn't occur there.)
 */
export const useResumeOverlay = () => {
    const [showResumeOverlay, setShowResumeOverlay] = useState(false);
    const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setShowResumeOverlay(false);
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
                setShowResumeOverlay(true);
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
                    setShowResumeOverlay(false);
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
        showResumeOverlay,
        dismissOverlay,
    };
};
