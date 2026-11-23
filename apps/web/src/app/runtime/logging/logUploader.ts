import {
    createLogId,
    createLogUploadQueue,
    createLogUploadScheduler,
    createQueueLogStore,
    logHub,
} from '@chatic/bridges';
import { runtime } from '@chatic/runtime';

import { isBelowAppVersionFloor, readShellVersion } from '../../features/appUpdate/lib/appVersionFloor';
import { diagnosticsKind } from '../../../config/diagnosticsKind';
import { clearNativeLogQueue, createNativeUploadSource } from './nativeUploadSource';
import { noteStatisticsDropped, selectTelemetryForUpload } from '../telemetry/telemetryRuntime';
import { registerLogQueueView } from './logQueueView';
import { createLogUploadStore, resolveTabId } from './logUploadStore';
import { createLogUploadSwitch, isLogCollectionEnabled } from './logUploadSwitch';

import type { LogEntry, LogStoreReader } from '@chatic/bridges';

const PERSIST_DEBOUNCE_MS = 1_000;

export const UPLOAD_BATCH_SIZE = 100;

export interface LogUploaderOptions {
    isEnabled?: () => boolean;
    keepDebug?: boolean;
}

export interface LogUploaderHandle {
    flush(): Promise<void>;
    teardown(): void;
}

export const startLogUploader = (options: LogUploaderOptions = {}): LogUploaderHandle => {
    const hybrid = diagnosticsKind() === 'shell' && !isBelowAppVersionFloor(readShellVersion());

    const store = createLogUploadStore(resolveTabId(createLogId()));

    const queue = createLogUploadQueue({
        acceptDebug: options.keepDebug ?? false,
        onDrop: dropped => {
            console.warn(`[logUploader] dropped ${dropped.length} queued entries under backpressure`);
        },
        onStatDrop: noteStatisticsDropped,
    });

    let persistTimer: ReturnType<typeof setTimeout> | undefined;

    const persistNow = (): void => {
        if (persistTimer !== undefined) {
            clearTimeout(persistTimer);
            persistTimer = undefined;
        }
        store.save(queue.snapshot());
    };

    const persistSoon = (): void => {
        if (persistTimer !== undefined) return;
        persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS);
    };

    queue.restore(store.load());
    if (hybrid) queue.clear();

    const localStore = createQueueLogStore(queue);
    const appStore = createNativeUploadSource();

    const logStore: LogStoreReader = hybrid ? appStore : localStore;

    const scheduler = createLogUploadScheduler({
        store: logStore,
        isEnabled: options.isEnabled ?? createLogUploadSwitch(),
        send: entries => runtime.report.uploadLogBatch(entries),
        batchSize: UPLOAD_BATCH_SIZE,
        selectTelemetry: selectTelemetryForUpload,
        onSettled: persistNow,
        onGiveUp: (entries, attempts) => {
            console.warn(`[logUploader] gave up on ${entries.length} entries after ${attempts} attempts`);
        },
    });

    const enforceOptOut = (): boolean => {
        if (isLogCollectionEnabled()) return false;

        if (queue.size()) {
            queue.clear();
            persistNow();
        }
        if (diagnosticsKind() === 'shell') void clearNativeLogQueue();
        return true;
    };

    const unsubscribeStore = logHub.subscribe((entry: LogEntry) => {
        if (!isLogCollectionEnabled()) return;
        if (hybrid) return;

        queue.push(entry);
        persistSoon();
    });

    const flush = async (): Promise<void> => {
        if (enforceOptOut()) return;

        await scheduler.flushNow();
        persistNow();
    };

    const onLogout = (): void => {
        void flush();
    };

    const unregisterLogout = runtime.session.registerSessionLogoutCallback(onLogout);

    const onHide = (): void => {
        if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = (): void => {
        void flush();
    };

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    if (!enforceOptOut()) {
        persistNow();
    }

    const unregisterView = registerLogQueueView({
        snapshot: () => queue.snapshot(),
        droppedCount: () => queue.droppedCount(),
        clear: () => {
            queue.clear();
            persistNow();
        },
        flush: () => flush(),
    });

    const stopHeartbeat = store.start();
    scheduler.start();

    return {
        flush,
        teardown() {
            unsubscribeStore();
            unregisterView();
            unregisterLogout();
            scheduler.stop();
            stopHeartbeat();
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
            persistNow();
        },
    };
};
