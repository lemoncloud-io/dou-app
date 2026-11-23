import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const readPersistedRoot = (stateFile: string): string | null => {
    try {
        const parsed = JSON.parse(readFileSync(stateFile, 'utf8')) as { root?: unknown } | null;
        const root = parsed?.root;
        return typeof root === 'string' && root !== '' ? root : null;
    } catch {
        return null;
    }
};

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

export const hasEntryPoint = (root: string): boolean => {
    try {
        return statSync(join(root, 'index.html')).isFile();
    } catch {
        return false;
    }
};
