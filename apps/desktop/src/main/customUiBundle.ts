import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { app } from 'electron';
import extract from 'extract-zip';

import { bundleRootFor, zipDownloadPath } from './customUi';
import { registerCustomUiProtocol, unregisterCustomUiProtocol } from './customUiProtocol';
import { isUsableBundleRoot, persistRoot, readPersistedRoot } from './customUiState';
import { setCustomUiActive } from './webUrl';

/**
 * Download → unpack → serve a web bundle in place of the remote web (PoC).
 *
 * Under userData, which the dev channel already redirects to its own directory, so a dev
 * build's bundles cannot leak into the installed app.
 */
const baseDir = (): string => join(app.getPath('userData'), 'custom-web');
const stateFile = (): string => join(app.getPath('userData'), 'chatic-custom-ui.json');

let activeRoot: string | null = null;

/**
 * Serve `root` now, leaving the persisted record alone. The two callers that already know
 * the record is right — restoring what was persisted, and the dev override that deliberately
 * must not become persisted — go through here, so `activeRoot` keeps a single writer.
 */
export const serveCustomUi = (root: string): void => {
    registerCustomUiProtocol(root);
    setCustomUiActive(true);
    activeRoot = root;
};

/** Point the shell at `root` and remember it for the next launch. */
const activate = (root: string): void => {
    serveCustomUi(root);
    persistRoot(stateFile(), root);
};

/** The bundle currently being served, or null when the shell is on the remote web. */
export const getActiveCustomUiRoot = (): string | null => activeRoot;

/**
 * Fetch `zipUrl`, unpack it, and switch the shell over to it.
 *
 * Throws — and leaves the shell on the remote web — if the download fails, the archive is
 * unreadable, or it has no index.html at its root. The caller reloads the window.
 */
export const applyCustomUi = async (zipUrl: string): Promise<void> => {
    const dir = baseDir();
    await mkdir(dir, { recursive: true });

    const response = await fetch(zipUrl);
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    // Buffer the whole archive before writing: a stream that dies mid-flight would otherwise
    // leave a truncated zip on disk that the next run happily tries to unpack.
    const archive = Buffer.from(await response.arrayBuffer());
    const zipPath = zipDownloadPath(dir);
    await writeFile(zipPath, archive);

    const root = bundleRootFor(dir, zipUrl);
    // Clear first — unpacking over a previous extraction leaves files the new bundle dropped.
    await rm(root, { recursive: true, force: true });
    try {
        await extract(zipPath, { dir: root });
        // index.html must sit at the archive root; no scanning of subdirectories, so a
        // wrongly-nested bundle fails loudly here instead of serving a blank window.
        if (!existsSync(join(root, 'index.html'))) throw new Error('index.html not found at zip root');
    } catch (error) {
        await rm(root, { recursive: true, force: true });
        throw error;
    } finally {
        await rm(zipPath, { force: true }).catch(() => undefined);
    }

    activate(root);
};

/**
 * Re-enter the bundle that was active at last quit. Call before the first window, so the
 * initial load already resolves to it — switching after the window exists would flash the
 * remote web first.
 *
 * Anything unusable clears the record rather than retrying, so a bundle deleted from under
 * the app costs one launch on the remote web instead of failing the same way every start.
 */
export const restoreCustomUi = (): boolean => {
    const root = readPersistedRoot(stateFile());
    if (!root) return false;
    if (!isUsableBundleRoot(root)) {
        persistRoot(stateFile(), null);
        return false;
    }
    // Not `activate` — the root came out of the record, so writing it straight back would be
    // a no-op disk write on every launch.
    serveCustomUi(root);
    return true;
};

/** Return the shell to the remote web, now and at next launch. */
export const disableCustomUi = (): void => {
    unregisterCustomUiProtocol();
    setCustomUiActive(false);
    activeRoot = null;
    persistRoot(stateFile(), null);
};
