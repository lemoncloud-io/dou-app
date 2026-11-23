import crashlytics from '@react-native-firebase/crashlytics';
import type { ILogService } from '../log';
import type { ILogUploadQueueService } from '../log/uploadQueue/types';
import type { IPendingReportQueueService } from './types';

export interface NativeErrorDetectionDeps {
    logService: ILogService;
    logUploadQueue: ILogUploadQueueService;
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
            const tracking = require('promise/setimmediate/rejection-tracking');
            tracking.enable({ allRejections: true, onUnhandled });
        } catch {
            /* no rejection tracking available — uncaught-exception path still works */
        }
    }
};

export const checkCrashOnPreviousExecution = async (deps: NativeErrorDetectionDeps): Promise<void> => {
    const { logService, logUploadQueue, pendingReports } = deps;
    try {
        const crashed = await crashlytics().didCrashOnPreviousExecution();
        if (!crashed) return;

        const lastLogAt = logUploadQueue.getPreviousRunLastLogAt();
        logService.warn('GLOBAL', '[native-crash] previous execution crashed (Crashlytics relaunch detection)');
        pendingReports.enqueue({
            category: 'native-crash',
            message: 'Previous app execution crashed (stack in Crashlytics console)',
            detectedAt: lastLogAt || Date.now(),
        });
    } catch (error) {
        logService.warn('GLOBAL', 'didCrashOnPreviousExecution check failed', { error });
    }
};
