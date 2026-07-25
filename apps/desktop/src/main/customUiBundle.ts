import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { app } from 'electron';
import extract from 'extract-zip';

import { bundleRootFor, isAllowedBundleUrl, isSymlinkEntry, zipDownloadPath } from './customUi';
import { registerCustomUiProtocol, unregisterCustomUiProtocol } from './customUiProtocol';
import { hasEntryPoint, persistRoot, readPersistedRoot } from './customUiState';
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

/** Throwing from onEntry aborts the extraction before the entry is written to disk. */
const rejectSymlinks = (entry: { fileName: string; externalFileAttributes: number }): void => {
    if (isSymlinkEntry(entry.externalFileAttributes)) throw new Error(`symlink entry rejected: ${entry.fileName}`);
};

/** Delete every extraction root except `keep` — one unpacked web build per URL ever applied adds up. */
const pruneOtherRoots = async (dir: string, keep: string): Promise<void> => {
    const webroot = join(dir, 'webroot');
    const entries = await readdir(webroot).catch(() => [] as string[]);
    await Promise.all(
        entries
            .map(name => join(webroot, name))
            .filter(path => path !== keep)
            .map(path => rm(path, { recursive: true, force: true }).catch(() => undefined))
    );
};

const downloadArchive = async (zipUrl: string): Promise<Buffer> => {
    if (!isAllowedBundleUrl(zipUrl)) throw new Error('bundle URL must be https');
    // `redirect: 'manual'`, because the scheme check above only ever sees the first hop —
    // fetch follows redirects by default, so an https URL that 302s to http://169.254.169.254
    // walks straight through it and turns the error string into a status oracle for internal hosts.
    const response = await fetch(zipUrl, { redirect: 'manual' });
    if (response.status >= 300 && response.status < 400) throw new Error('bundle URL must not redirect');
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    // Buffer the whole archive before writing: a stream that dies mid-flight would otherwise
    // leave a truncated zip on disk that the next run happily tries to unpack.
    return Buffer.from(await response.arrayBuffer());
};

const unpackBundle = async (zipPath: string, root: string): Promise<void> => {
    // Unpack beside the real root, not into it. Re-applying a URL resolves to the directory
    // currently being served, so extracting in place would delete a working bundle before
    // knowing the replacement is any good.
    const staging = `${root}.incoming`;
    const previous = `${root}.previous`;
    await rm(staging, { recursive: true, force: true });
    await extract(zipPath, { dir: staging, onEntry: rejectSymlinks });
    // index.html must sit at the archive root, and be a FILE: a zip carrying DOS-only entry
    // attributes makes extract-zip create `index.html` as a directory, which an existence
    // check happily accepts — and the resulting bundle 404s with a body, which Chromium
    // treats as a completed navigation, so no fallback ever fires.
    if (!hasEntryPoint(staging)) {
        await rm(staging, { recursive: true, force: true });
        throw new Error('index.html not found at zip root');
    }

    // Move the live root aside rather than deleting it: rm-then-rename has a window where a
    // failure (EPERM/EBUSY on Windows, a partial recursive delete) leaves the shell serving a
    // root whose files are gone — and a 404 with a body raises no did-fail-load to recover from.
    await rm(previous, { recursive: true, force: true });
    const hadRoot = existsSync(root);
    if (hadRoot) await rename(root, previous);
    try {
        await rename(staging, root);
    } catch (error) {
        if (hadRoot) await rename(previous, root).catch(() => undefined);
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }
    await rm(previous, { recursive: true, force: true }).catch(() => undefined);
};

const applyBundle = async (zipUrl: string): Promise<void> => {
    const dir = baseDir();
    await mkdir(dir, { recursive: true });

    const archive = await downloadArchive(zipUrl);
    const zipPath = zipDownloadPath(dir, zipUrl);
    await writeFile(zipPath, archive);

    const root = bundleRootFor(dir, zipUrl);
    try {
        await unpackBundle(zipPath, root);
    } finally {
        await rm(zipPath, { force: true }).catch(() => undefined);
    }

    activate(root);
    await pruneOtherRoots(dir, root);
};

let applyInFlight: Promise<unknown> = Promise.resolve();

/**
 * Fetch `zipUrl`, unpack it, and switch the shell over to it.
 *
 * Throws — leaving whatever was being served untouched — if the URL is not https or
 * redirects, the download fails, the archive is unreadable or carries a symlink entry, or it
 * has no index.html file at its root. The caller reloads the window.
 *
 * Serialized, because two applies of the SAME url share a staging dir, a scratch archive and
 * a destination root — and that is the default case, not a contrived one: the tray's Apply
 * has no busy flag and defaults to the very archive the debug panel pre-fills. Interleaved,
 * one can rename a half-extracted tree into place and activate it.
 */
export const applyCustomUi = (zipUrl: string): Promise<void> => {
    const next = applyInFlight.then(
        () => applyBundle(zipUrl),
        () => applyBundle(zipUrl)
    );
    applyInFlight = next.catch(() => undefined);
    return next;
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
    // Only ever a directory this module created. Nothing renderer-reachable writes the state
    // file today, so this is defence in depth — it makes the file non-load-bearing.
    const ours = root.startsWith(join(baseDir(), 'webroot') + sep);
    if (!ours || !hasEntryPoint(root)) {
        persistRoot(stateFile(), null);
        return false;
    }
    // Not `activate` — the root came out of the record, so writing it straight back would be
    // a no-op disk write on every launch.
    serveCustomUi(root);
    return true;
};

/**
 * Return the shell to the remote web, now and at next launch.
 *
 * Clearing the record is skipped when what is being served came from the dev override rather
 * than the record: that bundle was never persisted, so forgetting one the user actually
 * applied would be collateral damage from an env var.
 */
export const disableCustomUi = (): void => {
    unregisterCustomUiProtocol();
    setCustomUiActive(false);
    const wasPersisted = activeRoot !== null && activeRoot === readPersistedRoot(stateFile());
    activeRoot = null;
    if (wasPersisted) persistRoot(stateFile(), null);
};
