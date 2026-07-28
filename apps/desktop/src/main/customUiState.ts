/**
 * What survives a restart: the extraction root, and nothing else.
 *
 * The scheme registration and the active flag are rebuilt at boot from this one value, so
 * there is a single thing that can be stale. Persisting the derived state instead would let
 * the shell come up believing a bundle is being served before any handler exists.
 *
 * Electron-free so it is testable; the caller supplies the path under userData.
 */
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
 * Whether `root` holds a servable entry point. An extraction killed halfway leaves the
 * directory without one, and restoring that is a blank window with no way back.
 *
 * `isFile`, not `existsSync`: a zip carrying DOS-only entry attributes makes extract-zip
 * create `index.html` as a *directory*, which an existence check accepts. The bundle then
 * 404s with a body — a completed navigation as far as Chromium is concerned — so no recovery
 * path fires and the record restores it again at every launch.
 */
export const hasEntryPoint = (root: string): boolean => {
    try {
        return statSync(join(root, 'index.html')).isFile();
    } catch {
        return false;
    }
};
