import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { bootMetricsService, bootSplashService, logger, pendingReportQueueService } from '../../services';

export const CRASH_LOOP_LIMIT = 3;
export const CRASH_LOOP_WINDOW_MS = 60_000;

export const FIRST_SCREEN_CAP_MS = 30_000;

export type CrashRecoveryGiveUpReason = 'crash-loop' | 'no-first-screen';

interface UseWebViewCrashRecoveryOptions {
    reload: () => void;
    coverReload: () => void;
    onGiveUp: (reason: CrashRecoveryGiveUpReason) => void;
}

export const useWebViewCrashRecovery = ({ reload, coverReload, onGiveUp }: UseWebViewCrashRecoveryOptions) => {
    const terminationsRef = useRef<number[]>([]);
    const firstScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const awaitingRevealRef = useRef(true);
    const gaveUpRef = useRef(false);
    const onGiveUpRef = useRef(onGiveUp);
    onGiveUpRef.current = onGiveUp;

    const clearFirstScreenTimer = useCallback(() => {
        if (firstScreenTimerRef.current) {
            clearTimeout(firstScreenTimerRef.current);
            firstScreenTimerRef.current = null;
        }
    }, []);

    const giveUp = useCallback(
        (reason: CrashRecoveryGiveUpReason, terminations: number) => {
            clearFirstScreenTimer();
            awaitingRevealRef.current = false;
            if (gaveUpRef.current) return;
            gaveUpRef.current = true;
            const message = `WebView crash recovery gave up: ${reason} (${terminations} termination(s) in ${CRASH_LOOP_WINDOW_MS / 1000}s)`;
            logger.error('webview.crash_recovery_gave_up', `[webview-crash] ${message}`);
            pendingReportQueueService.enqueue({ category: 'webview-crash', message, detectedAt: Date.now() });
            onGiveUpRef.current(reason);
        },
        [clearFirstScreenTimer]
    );

    const armFirstScreenTimer = useCallback(() => {
        clearFirstScreenTimer();
        if (!awaitingRevealRef.current || AppState.currentState !== 'active') return;
        firstScreenTimerRef.current = setTimeout(() => {
            firstScreenTimerRef.current = null;
            giveUp('no-first-screen', terminationsRef.current.length);
        }, FIRST_SCREEN_CAP_MS);
    }, [clearFirstScreenTimer, giveUp]);

    const handleTermination = useCallback(
        (reason: string) => {
            if (gaveUpRef.current) return;
            const now = Date.now();
            logger.error('webview.process_terminated', `[webview-crash] ${reason}`);
            pendingReportQueueService.enqueue({ category: 'webview-crash', message: reason, detectedAt: now });

            const recent = [...terminationsRef.current.filter(at => now - at < CRASH_LOOP_WINDOW_MS), now];
            terminationsRef.current = recent;

            if (recent.length >= CRASH_LOOP_LIMIT) {
                giveUp('crash-loop', recent.length);
                return;
            }

            bootMetricsService.startReloadSession();
            coverReload();
            reload();
            awaitingRevealRef.current = true;
            armFirstScreenTimer();
        },
        [armFirstScreenTimer, coverReload, giveUp, reload]
    );

    useEffect(
        () =>
            bootSplashService.subscribe(() => {
                awaitingRevealRef.current = false;
                clearFirstScreenTimer();
            }),
        [clearFirstScreenTimer]
    );

    useEffect(() => {
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active') armFirstScreenTimer();
            else clearFirstScreenTimer();
        });
        return () => subscription.remove();
    }, [armFirstScreenTimer, clearFirstScreenTimer]);

    useEffect(() => {
        armFirstScreenTimer();
        return clearFirstScreenTimer;
    }, [armFirstScreenTimer, clearFirstScreenTimer]);

    return handleTermination;
};
