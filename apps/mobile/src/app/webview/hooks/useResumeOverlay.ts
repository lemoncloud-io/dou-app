import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { bootMetricsService, bootSplashService } from '../../services';

export const RELOAD_COVER_CAP_MS = 5000;

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
                if (resumeTimeoutRef.current) {
                    clearTimeout(resumeTimeoutRef.current);
                }
                resumeTimeoutRef.current = setTimeout(() => {
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
