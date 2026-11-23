import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATER_LOG_FILE = 'updater.log';

export const MAX_LOG_BYTES = 1024 * 1024;

export interface UpdaterLog {
    info: (message?: unknown) => void;
    warn: (message?: unknown) => void;
    error: (message?: unknown) => void;
    debug: (message?: unknown) => void;
}

export const createUpdaterLog = (dir: string, now: () => Date = () => new Date()): UpdaterLog => {
    const file = join(dir, UPDATER_LOG_FILE);
    try {
        mkdirSync(dir, { recursive: true });
        if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_LOG_BYTES) truncateSync(file);
    } catch {
        // Best effort: an update must not fail because its log could not be opened.
    }
    const write =
        (level: string) =>
        (message?: unknown): void => {
            try {
                appendFileSync(file, `${now().toISOString()} [${level}] ${String(message)}\n`);
            } catch {
                // Best effort, as above.
            }
        };
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') };
};
