import { join, sep } from 'node:path';

import {
    bundleRootFor,
    hashUrl,
    isAllowedBundleUrl,
    isSymlinkEntry,
    resolveEntryPath,
    zipDownloadPath,
} from './customUi';
import { CUSTOM_UI_ORIGIN } from './webUrl';

const ROOT = join(sep, 'tmp', 'custom-web', 'abc123');
const BASE = join(sep, 'tmp', 'custom-web');
const req = (path: string): string => `${CUSTOM_UI_ORIGIN}${path}`;

describe('hashUrl', () => {
    it('is deterministic for the same URL', () => {
        expect(hashUrl('https://cdn.example.com/bundle.zip')).toBe(hashUrl('https://cdn.example.com/bundle.zip'));
    });

    it('matches the mobile PoC, so both shells name the same bundle the same way', () => {
        // Ported from apps/mobile customZipService; a silent divergence would only show up as
        // the two shells disagreeing about which directory a bundle lives in.
        expect(hashUrl('https://lemon-ade-storage.s3.ap-northeast-2.amazonaws.com/custom-web-poc.zip')).toBe(
            'f14cb6c8'
        );
    });

    it('separates different URLs, including ones differing only by host', () => {
        expect(hashUrl('https://a.example.com/x.zip')).not.toBe(hashUrl('https://b.example.com/y.zip'));
        expect(hashUrl('https://a.example.com/x.zip')).not.toBe(hashUrl('https://b.example.com/x.zip'));
    });

    it('never yields a negative or sign-prefixed value (it becomes a directory name)', () => {
        for (const url of ['https://x.io/a.zip', 'https://y.io/' + 'z'.repeat(500), '']) {
            expect(hashUrl(url)).toMatch(/^[0-9a-f]+$/);
        }
    });
});

describe('bundleRootFor', () => {
    it('gives each zip URL its own extraction root under the base dir', () => {
        const a = bundleRootFor(BASE, 'https://cdn.example.com/a.zip');
        const b = bundleRootFor(BASE, 'https://cdn.example.com/b.zip');
        expect(a).not.toBe(b);
        expect(a.startsWith(join(BASE, 'webroot') + sep)).toBe(true);
    });

    it('is stable across calls, so a re-apply reuses the same root', () => {
        expect(bundleRootFor(BASE, 'https://cdn.example.com/a.zip')).toBe(
            bundleRootFor(BASE, 'https://cdn.example.com/a.zip')
        );
    });
});

describe('zipDownloadPath', () => {
    it('keeps the download beside the roots, not inside one', () => {
        const path = zipDownloadPath(BASE, 'https://cdn.example.com/a.zip');
        expect(path.startsWith(join(BASE, 'webroot'))).toBe(false);
        expect(path.endsWith('.zip')).toBe(true);
    });

    it('gives each URL its own scratch file, so overlapping applies cannot overwrite each other', () => {
        expect(zipDownloadPath(BASE, 'https://cdn.example.com/a.zip')).not.toBe(
            zipDownloadPath(BASE, 'https://cdn.example.com/b.zip')
        );
    });
});

describe('isSymlinkEntry', () => {
    // extract-zip follows what it creates, and resolveEntryPath only confines lexically, so
    // this predicate is the whole defence against a `link -> /` entry.
    const attrs = (unixMode: number): number => (unixMode << 16) >>> 0;

    it('rejects a symlink entry', () => {
        expect(isSymlinkEntry(attrs(0o120777))).toBe(true);
    });

    it('admits regular files and directories', () => {
        expect(isSymlinkEntry(attrs(0o100644))).toBe(false);
        expect(isSymlinkEntry(attrs(0o040755))).toBe(false);
    });

    it('admits an entry with no unix mode at all (DOS attributes only)', () => {
        // extract-zip writes those as plain files, so rejecting them would break bundles
        // zipped on Windows.
        expect(isSymlinkEntry(0)).toBe(false);
        expect(isSymlinkEntry(0x10)).toBe(false);
    });

    it('does not mistake a socket or FIFO for a symlink', () => {
        // The tell that the mask is the file-type field and not just the symlink bits.
        expect(isSymlinkEntry(attrs(0o140777))).toBe(false);
        expect(isSymlinkEntry(attrs(0o010644))).toBe(false);
    });
});

describe('isAllowedBundleUrl', () => {
    it('admits https only', () => {
        expect(isAllowedBundleUrl('https://cdn.example.com/a.zip')).toBe(true);
        expect(isAllowedBundleUrl('HTTPS://cdn.example.com/a.zip')).toBe(true);
    });

    it('refuses schemes that would make the main process a probe', () => {
        for (const url of [
            'http://cdn.example.com/a.zip',
            'file:///a.zip',
            'http://127.0.0.1:9200/',
            'ftp://x/a.zip',
        ]) {
            expect(isAllowedBundleUrl(url)).toBe(false);
        }
    });
});

describe('resolveEntryPath', () => {
    it('maps the bundle root to index.html', () => {
        expect(resolveEntryPath(ROOT, req('/'))).toBe(join(ROOT, 'index.html'));
    });

    it('maps a nested asset to its file inside the root', () => {
        expect(resolveEntryPath(ROOT, req('/assets/app-1a2b.js'))).toBe(join(ROOT, 'assets', 'app-1a2b.js'));
    });

    it('ignores the query string and hash a bundler appends', () => {
        expect(resolveEntryPath(ROOT, req('/assets/app.js?v=3'))).toBe(join(ROOT, 'assets', 'app.js'));
        expect(resolveEntryPath(ROOT, req('/index.html#/chat/1'))).toBe(join(ROOT, 'index.html'));
    });

    it('decodes percent-encoded names so spaced filenames resolve', () => {
        expect(resolveEntryPath(ROOT, req('/my%20logo.png'))).toBe(join(ROOT, 'my logo.png'));
    });

    it('confines traversal to the root — dot segments cannot climb out', () => {
        // URL parsing resolves dot segments before this function sees them, encoded or not
        // (`/%2e%2e/%2e%2e/etc/passwd` arrives as pathname `/etc/passwd`), so a traversal
        // entry lands inside the root rather than above it. Asserted as the observable
        // outcome, since that is the property that matters — not which layer enforces it.
        expect(resolveEntryPath(ROOT, req('/%2e%2e/%2e%2e/etc/passwd'))).toBe(join(ROOT, 'etc', 'passwd'));
        expect(resolveEntryPath(ROOT, req('/assets/%2e%2e/%2e%2e/%2e%2e/secret'))).toBe(join(ROOT, 'secret'));
        expect(resolveEntryPath(ROOT, req('/../..'))).toBe(join(ROOT, 'index.html'));
    });

    it('does not let a sibling that shares the root prefix be reached', () => {
        // `/tmp/custom-web/abc123-evil` starts with the root string but is not inside it;
        // it must resolve under the root, never beside it.
        expect(resolveEntryPath(ROOT, req('/%2e%2e/abc123-evil/index.html'))).toBe(
            join(ROOT, 'abc123-evil', 'index.html')
        );
    });

    it('confines traversal that URL parsing does NOT resolve — encoded slashes and backslashes', () => {
        // The cases above survive because parsing normalizes them. These do not: an encoded
        // slash keeps `..` from being a path segment, so the traversal is still intact when
        // decodeURIComponent runs, and the root-prefix check is the only thing between it and
        // a sibling directory. Without the `+ sep` these would resolve to `<root>-evil`.
        expect(resolveEntryPath(ROOT, req('/..%2fabc123-evil/index.html'))).toBeNull();
        expect(resolveEntryPath(ROOT, req('/%2e%2e%2fabc123-evil/index.html'))).toBeNull();
        expect(resolveEntryPath(ROOT, req('/..%2f..%2fetc%2fpasswd'))).toBeNull();
    });

    it('treats a leading double slash as a relative path, not an absolute one', () => {
        expect(resolveEntryPath(ROOT, req('//etc/passwd'))).toBe(join(ROOT, 'etc', 'passwd'));
    });

    it('refuses a NUL byte, which path APIs reject at the OS boundary', () => {
        expect(resolveEntryPath(ROOT, req('/app%00.js'))).toBeNull();
    });

    it('refuses malformed percent-encoding and unparseable requests', () => {
        expect(resolveEntryPath(ROOT, req('/%E0%A4%A'))).toBeNull();
        expect(resolveEntryPath(ROOT, 'not a url')).toBeNull();
    });

    // The invariant, stated once over every shape above and a few more. The cases individually
    // asserted earlier pin *which layer* happens to stop each one, which is incidental — Node
    // could change how it normalizes and leave the code just as safe. This is the property.
    it.each([
        '/../../../etc/passwd',
        '/%2e%2e/%2e%2e/etc/passwd',
        '/..%2f..%2fetc%2fpasswd',
        '/%2e%2e%2fabc123-evil/x',
        '/..%5c..%5cetc',
        '/..\\..\\Windows\\win.ini',
        '/C:/Windows/win.ini',
        '/app%00.js',
        '//etc/passwd',
        '///etc/passwd',
        '/%2e%2e%2f%2e%2e%2f',
    ])('never resolves outside the root: %s', path => {
        const resolved = resolveEntryPath(ROOT, req(path));
        expect(resolved === null || resolved.startsWith(ROOT + sep)).toBe(true);
    });
});
