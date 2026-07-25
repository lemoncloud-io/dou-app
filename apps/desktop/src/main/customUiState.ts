import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What survives a restart: the extraction root, and nothing else.
 *
 * The scheme registration and the active flag are rebuilt at boot from this one value, so
 * there is a single thing that can be stale. Persisting the derived state instead would let
 * the shell come up believing a bundle is being served before any handler exists.
 *
 * Electron-free so it is testable; the caller supplies the path under userData.
 */

/** The bundle root to restore, or null when there is nothing usable recorded. */
export const readPersistedRoot = (stateFile: string): string | null => {
    try {
        const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as { root?: unknown } | null;
        const root = parsed?.root;
        return typeof root === 'string' && root !== '' ? root : null;
    } catch {
        // Absent on first run; unparseable if a crash caught a write mid-flight. Either way
        // the remote web is the safe answer.
        return null;
    }
};

/** Record the bundle to restore, or clear the record with null. Best-effort. */
export const persistRoot = (stateFile: string, root: string | null): void => {
    try {
        if (root === null) {
            rmSync(stateFile, { force: true });
            return;
        }
        writeFileSync(stateFile, JSON.stringify({ root }), 'utf8');
    } catch {
        // Losing the record costs one restart on the remote web, never a broken launch.
    }
};

/**
 * Whether `root` still holds a servable bundle. An extraction killed halfway leaves the
 * directory without its entry point, and restoring that is a blank window with no way back.
 */
export const isUsableBundleRoot = (root: string): boolean => existsSync(join(root, 'index.html'));
