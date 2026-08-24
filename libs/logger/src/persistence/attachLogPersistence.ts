import { LogPersistenceBinder } from './LogPersistenceBinder';
import { logBuffer, logHub } from '../runtime';

import type { AttachLogPersistenceOptions, LogPersistence } from './LogPersistence';

/**
 * Binds a persistence adapter to the process-wide log stream and returns a
 * teardown that flushes pending writes and unsubscribes.
 *
 * The wiring lives here rather than in `LogPersistenceBinder` so the class
 * itself stays free of the singleton — this is the only file in the module that
 * knows there is one.
 */
export const attachLogPersistence = (
    persistence: LogPersistence,
    options: AttachLogPersistenceOptions = {}
): (() => void) => {
    const binder = new LogPersistenceBinder(persistence, { hub: logHub, buffer: logBuffer }, options);

    binder.attach({ restore: options.restore });

    return () => binder.detach();
};
