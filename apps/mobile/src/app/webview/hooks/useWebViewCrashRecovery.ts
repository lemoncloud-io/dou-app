import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { bootMetricsService, bootSplashService, logger, pendingReportQueueService } from '../../services';

/**
 * How many content-process terminations inside {@link CRASH_LOOP_WINDOW_MS} end the automatic
 * reloads. The first is reloaded (the OS reclaiming a backgrounded page is ordinary), the second
 * too in case it was bad luck; the third means the page kills its process every time it loads.
 */
export const CRASH_LOOP_LIMIT = 3;
export const CRASH_LOOP_WINDOW_MS = 60_000;

/**
 * How long a page — a fresh mount, or a reload after a crash — may take to report its first screen
 * before it is treated as dead. The web lifts its own boot cover, and reports, at a 10s cap once its
 * script runs, so this leaves 20s for the page and its bundle to arrive; a page that still has not
 * reported has no process behind it.
 */
export const FIRST_SCREEN_CAP_MS = 30_000;

/** Why the shell gave up on the WebView and asked the reader to retry. */
export type CrashRecoveryGiveUpReason = 'crash-loop' | 'no-first-screen';

interface UseWebViewCrashRecoveryOptions {
    /** Reloads the current page in the existing WebView. */
    reload: () => void;
    /** Covers the WebView while the reload boots; see `useResumeOverlay`. */
    coverReload: () => void;
    /** Called once when reloading is not working; the host replaces the WebView with a retry view. */
    onGiveUp: (reason: CrashRecoveryGiveUpReason) => void;
}

/**
 * What the shell does when the WebView's content process dies (`onContentProcessDidTerminate` on
 * iOS, `onRenderProcessGone` on Android), and when it never comes up at all. Returns the handler for
 * both callbacks; use it once per mounted WebView.
 *
 * Every termination is recorded into the pending-report queue: the web side died outright and
 * cannot report on itself, so the next page that boots relays it. Then the page is reloaded under
 * the crash-reload cover — unless reloading has stopped working, in which case `onGiveUp` hands the
 * reader a retry instead of a cover that lifts onto a dead page:
 *
 * - **crash loop** — the page keeps killing its process ({@link CRASH_LOOP_LIMIT} terminations in
 *   {@link CRASH_LOOP_WINDOW_MS}), with or without reaching a first screen in between;
 * - **no first screen** — the mounted page, or the reload after a crash, did not report a first
 *   screen within {@link FIRST_SCREEN_CAP_MS}. WebKit does not report every death: a content
 *   process that dies while launching leaves the WebView blank, or showing the last frame of the
 *   page before it, with no callback at all — on a fresh mount as much as on a reload. Android documents
 *   that a WebView whose render process is gone cannot be reused, so `reload()` is not expected
 *   to recover it there; until that path remounts instead, this rule is what hands it over.
 */
export const useWebViewCrashRecovery = ({ reload, coverReload, onGiveUp }: UseWebViewCrashRecoveryOptions) => {
    const terminationsRef = useRef<number[]>([]);
    const firstScreenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // A mount or reload that has not reported a first screen yet. A fresh mount starts out waiting.
    const awaitingRevealRef = useRef(true);
    // The host is replacing this WebView; a callback still in flight must not give up twice.
    const gaveUpRef = useRef(false);
    // Read through a ref so the returned handler stays stable across renders.
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

    // Only time spent in the foreground counts: a page loading while the app is in the background
    // cannot paint, so it would never report and would be given up on the moment the app returned.
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
            // It doesn't attach a buffer snapshot: the uploader already ships those entries
            // individually from the unified buffer, so copying them here would save the same log
            // into the report a second time.
            pendingReportQueueService.enqueue({ category: 'webview-crash', message: reason, detectedAt: now });

            const recent = [...terminationsRef.current.filter(at => now - at < CRASH_LOOP_WINDOW_MS), now];
            terminationsRef.current = recent;

            if (recent.length >= CRASH_LOOP_LIMIT) {
                giveUp('crash-loop', recent.length);
                return;
            }

            // The forced reload is effectively a full re-boot of the web app — record it as its own
            // boot session so it shows up in the perf history.
            bootMetricsService.startReloadSession();
            // The reload is a full web boot with no launch splash over it; cover it the same way.
            coverReload();
            reload();
            awaitingRevealRef.current = true;
            armFirstScreenTimer();
        },
        [armFirstScreenTimer, coverReload, giveUp, reload]
    );

    // Any reveal — first screen, or the handshake of an older web build — means the page came up.
    useEffect(
        () =>
            bootSplashService.subscribe(() => {
                awaitingRevealRef.current = false;
                clearFirstScreenTimer();
            }),
        [clearFirstScreenTimer]
    );

    // Leaving the foreground pauses the wait; coming back gives the page the full cap again.
    useEffect(() => {
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active') armFirstScreenTimer();
            else clearFirstScreenTimer();
        });
        return () => subscription.remove();
    }, [armFirstScreenTimer, clearFirstScreenTimer]);

    // The mount's own wait, and its cleanup.
    useEffect(() => {
        armFirstScreenTimer();
        return clearFirstScreenTimer;
    }, [armFirstScreenTimer, clearFirstScreenTimer]);

    return handleTermination;
};
