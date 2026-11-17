/**
 * The updater's log, on disk. electron-updater logs to the console unless it is handed a logger, and
 * a packaged app has no console. The install itself runs after the app has exited, so what the
 * updater did up to that point — which installer it started, with which arguments, and any error
 * starting it — is the only record the app can leave of an update that did not apply.
 *
 * Deliberately imports no electron: this runs under jest, which cannot load electron.
 */
import { appendFileSync, mkdirSync, statSync, truncateSync } from 'node:fs';
import { join } from 'node:path';

export const UPDATER_LOG_FILE = 'updater.log';

/**
 * Past this the log starts over at the next launch — earlier lines are dropped, not rotated — so the
 * file cannot grow without bound.
 */
export const MAX_LOG_BYTES = 1024 * 1024;

/** The part of electron-updater's `Logger` the updater is given. */
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
                // Synchronous on purpose. The lines that matter most are written while the app is
                // quitting to install, and a write still queued at exit never reaches the file.
                appendFileSync(file, `${now().toISOString()} [${level}] ${String(message)}\n`);
            } catch {
                // Best effort, as above.
            }
        };
    return { info: write('info'), warn: write('warn'), error: write('error'), debug: write('debug') };
};
