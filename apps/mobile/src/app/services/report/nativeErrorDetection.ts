import crashlytics from '@react-native-firebase/crashlytics';
import type { ILogService } from '../log';
import type { ILogBufferService } from '../log/buffer';
import type { IPendingReportQueueService } from './types';

export interface NativeErrorDetectionDeps {
    logService: ILogService;
    logBufferService: ILogBufferService;
    pendingReports: IPendingReportQueueService;
}

type RNGlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;
interface RNErrorUtils {
    getGlobalHandler?: () => RNGlobalErrorHandler | undefined;
    setGlobalHandler?: (handler: RNGlobalErrorHandler) => void;
}

const toMessage = (value: unknown): string => {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

/**
 * Installs RN-level JS error detection (ADR-0047): uncaught exceptions via
 * `ErrorUtils.setGlobalHandler` and unhandled promise rejections via the
 * Hermes rejection tracker (with the `promise` polyfill as the JSC fallback).
 * Each detection logs first (buffer/Crashlytics breadcrumb), then queues a
 * `native-error` report for the web to relay — the previous handler chain is
 * preserved so RedBox/Crashlytics keep working.
 */
export const installNativeErrorDetection = (deps: NativeErrorDetectionDeps): void => {
    const { logService, pendingReports } = deps;

    const capture = (error: unknown, extra: Record<string, unknown>): void => {
        const message = toMessage(error);
        logService.error('GLOBAL', `[native-error] ${message}`, error);
        pendingReports.enqueue({
            category: 'native-error',
            message,
            stack: error instanceof Error ? error.stack : undefined,
            detectedAt: Date.now(),
            extra,
        });
    };

    const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
    if (errorUtils?.setGlobalHandler) {
        const previous = errorUtils.getGlobalHandler?.();
        errorUtils.setGlobalHandler((error, isFatal) => {
            capture(error, { isFatal: isFatal ?? false });
            previous?.(error, isFatal);
        });
    }

    const hermes = (globalThis as { HermesInternal?: { enablePromiseRejectionTracker?: (config: unknown) => void } })
        .HermesInternal;
    const onUnhandled = (_id: number, rejection: unknown): void => {
        capture(rejection, { unhandledRejection: true });
    };
    if (hermes?.enablePromiseRejectionTracker) {
        hermes.enablePromiseRejectionTracker({ allRejections: true, onUnhandled });
    } else {
        try {
            // JSC / polyfilled-Promise runtimes (RN bundles the `promise` package).

            const tracking = require('promise/setimmediate/rejection-tracking');
            tracking.enable({ allRejections: true, onUnhandled });
        } catch {
            /* no rejection tracking available — uncaught-exception path still works */
        }
    }
};

/**
 * Pure-native crash detection (ADR-0047): JVM/signal crashes kill the process
 * before anything can report, so Crashlytics captures the stack and the NEXT
 * launch queues a `native-crash` report. The breadcrumb is the previous
 * session's buffer tail — alive in MMKV thanks to log persistence. The stack
 * itself exists only in the Crashlytics console (dual-track by design); the
 * report timestamp approximates the crash with the last persisted entry.
 *
 * Call AFTER logBufferService.init() so the restored entries are readable.
 */
export const checkCrashOnPreviousExecution = async (deps: NativeErrorDetectionDeps): Promise<void> => {
    const { logService, logBufferService, pendingReports } = deps;
    try {
        const crashed = await crashlytics().didCrashOnPreviousExecution();
        if (!crashed) return;

        // The buffer is read for its last entry's TIME, not to attach it: the
        // relaunch detection has no crash timestamp of its own, and the newest
        // entry from the dead run is the closest approximation.
        const lastEntry = logBufferService.peek().at(-1);
        logService.warn('GLOBAL', '[native-crash] previous execution crashed (Crashlytics relaunch detection)');
        pendingReports.enqueue({
            category: 'native-crash',
            message: 'Previous app execution crashed (stack in Crashlytics console)',
            detectedAt: lastEntry?.timestamp || Date.now(),
        });
    } catch (error) {
        logService.warn('GLOBAL', 'didCrashOnPreviousExecution check failed', { error });
    }
};
