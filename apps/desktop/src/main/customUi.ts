import { join, resolve, sep } from 'node:path';

/**
 * Deterministic djb2(xor) hash — ported from the mobile PoC so both shells name extraction
 * roots the same way. Used only to give each bundle URL its own directory, never for
 * integrity; no crypto dependency wanted in the main bundle.
 */
export const hashUrl = (url: string): string => {
    let hash = 5381;
    for (let i = 0; i < url.length; i += 1) {
        hash = (hash * 33) ^ url.charCodeAt(i);
    }
    // >>> 0 converts the int32 to unsigned, so the hex never carries a leading '-'.
    return (hash >>> 0).toString(16);
};

/**
 * Where a bundle URL unpacks to. Per-URL so switching bundles cannot leave one bundle's
 * stale files shadowing the next one's.
 */
export const bundleRootFor = (baseDir: string, zipUrl: string): string => join(baseDir, 'webroot', hashUrl(zipUrl));

/** Scratch path for the download. Outside `webroot/` so it is never servable. */
export const zipDownloadPath = (baseDir: string): string => join(baseDir, 'bundle.zip');

/**
 * Map a `chatic-local://bundle/...` request to the file that answers it, or null if the
 * request has no answer inside `root`.
 *
 * The confinement check is the reason this is its own function: bundle entries are
 * attacker-shaped input (a ZIP can name an entry `../../etc/passwd`), so the one place
 * that turns a request into a filesystem path has to be testable on its own.
 */
export const resolveEntryPath = (root: string, requestUrl: string): string | null => {
    let pathname: string;
    try {
        ({ pathname } = new URL(requestUrl));
    } catch {
        return null;
    }

    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null; // malformed percent-encoding
    }
    // A NUL truncates the path at the syscall boundary, so `/app\0.js` could reach `/app`.
    if (decoded.includes('\0')) return null;

    const relative = decoded.replace(/^\/+/, '');
    const rootPath = resolve(root);
    const target = resolve(rootPath, relative === '' ? 'index.html' : relative);

    // URL parsing already resolves dot segments (`/%2e%2e/x` arrives as `/x`), so this is a
    // backstop, not the primary defence — it still fires for what parsing leaves alone, e.g. a
    // Windows drive-letter entry (`C:/Windows/...`), which `resolve` would honour as absolute.
    // `startsWith(rootPath + sep)` — not `startsWith(rootPath)`, which would also admit a
    // sibling like `<root>-evil`, and not `=== rootPath`, which is the directory itself.
    return target.startsWith(rootPath + sep) ? target : null;
};
