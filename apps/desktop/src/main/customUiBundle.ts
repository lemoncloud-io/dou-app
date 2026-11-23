import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { app } from 'electron';
import extract from 'extract-zip';

import { bundleRootFor, isAllowedBundleUrl, isSymlinkEntry, zipDownloadPath } from './customUi';
import { registerCustomUiProtocol, unregisterCustomUiProtocol } from './customUiProtocol';
import { hasEntryPoint, persistRoot, readPersistedRoot } from './customUiState';
import { setCustomUiActive } from './webUrl';

const baseDir = (): string => join(app.getPath('userData'), 'custom-web');
const stateFile = (): string => join(app.getPath('userData'), 'chatic-custom-ui.json');

let activeRoot: string | null = null;

export const serveCustomUi = (root: string): void => {
    registerCustomUiProtocol(root);
    setCustomUiActive(true);
    activeRoot = root;
};

const activate = (root: string): void => {
    serveCustomUi(root);
    persistRoot(stateFile(), root);
};

export const getActiveCustomUiRoot = (): string | null => activeRoot;

const rejectSymlinks = (entry: { fileName: string; externalFileAttributes: number }): void => {
    if (isSymlinkEntry(entry.externalFileAttributes)) throw new Error(`symlink entry rejected: ${entry.fileName}`);
};

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

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

const downloadArchive = async (zipUrl: string): Promise<Buffer> => {
    if (!isAllowedBundleUrl(zipUrl)) throw new Error('bundle URL must be https');
    const response = await fetch(zipUrl, { redirect: 'manual', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (response.status >= 300 && response.status < 400) throw new Error('bundle URL must not redirect');
    if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES) {
        throw new Error('bundle is too large');
    }
    const archive = Buffer.from(await response.arrayBuffer());
    if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('bundle is too large');
    return archive;
};

const unpackBundle = async (zipPath: string, root: string): Promise<void> => {
    const staging = `${root}.incoming`;
    const previous = `${root}.previous`;
    await rm(staging, { recursive: true, force: true });
    try {
        await extract(zipPath, { dir: staging, onEntry: rejectSymlinks });
        if (!hasEntryPoint(staging)) throw new Error('index.html not found at zip root');
    } catch (error) {
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }

    await rm(previous, { recursive: true, force: true });
    const hadRoot = existsSync(root);
    if (hadRoot) await rename(root, previous);
    try {
        await rename(staging, root);
    } catch (error) {
        if (hadRoot) await rename(previous, root).catch(() => undefined);
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        if (activeRoot === root && !existsSync(root)) disableCustomUi();
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

export const applyCustomUi = (zipUrl: string): Promise<void> => {
    const next = applyInFlight.then(() => applyBundle(zipUrl));
    applyInFlight = next.catch(() => undefined);
    return next;
};

export const restoreCustomUi = (): boolean => {
    const root = readPersistedRoot(stateFile());
    if (!root) return false;
    const ours = root.startsWith(join(baseDir(), 'webroot') + sep);
    if (!ours || !hasEntryPoint(root)) {
        persistRoot(stateFile(), null);
        return false;
    }
    serveCustomUi(root);
    return true;
};

export const disableCustomUi = (): void => {
    unregisterCustomUiProtocol();
    setCustomUiActive(false);
    const wasPersisted = activeRoot !== null && activeRoot === readPersistedRoot(stateFile());
    activeRoot = null;
    if (wasPersisted) persistRoot(stateFile(), null);
};
